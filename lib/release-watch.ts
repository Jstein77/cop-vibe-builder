import { releaseDurationMs, releasePlan, releaseProgress, type ReleaseProgress } from "@/lib/release-sim";
import type { Deployment, PrStatus, ReleaseRun, ReleaseTrigger } from "@/lib/types";

export type WatchRowState = "done" | "active" | "waiting" | "error" | "neutral";
export type WatchRow = { id: "pr" | "checks" | "review" | "merge"; label: string; state: WatchRowState };

export function isAwaitingMerge(deployment: Deployment | undefined): boolean {
  return deployment?.status === "awaiting-merge" || deployment?.status === "awaiting-approval";
}

/** The four status lines shown while the release waits on the agent's pull request. */
export function prWatchRows(pr: PrStatus): WatchRow[] {
  const merged = pr.state === "merged";
  const rows: WatchRow[] = [];

  if (pr.state === "closed") rows.push({ id: "pr", label: `Pull request #${pr.number} was closed without merging`, state: "error" });
  else rows.push({ id: "pr", label: `Pull request #${pr.number} ${merged ? "merged" : pr.draft ? "open (draft)" : "open"}`, state: "done" });

  const { total, passed, failed, pending } = pr.checks;
  if (total === 0) rows.push({ id: "checks", label: "No checks reported on the pull request", state: "neutral" });
  else if (failed > 0) rows.push({ id: "checks", label: `${failed} of ${total} checks failed`, state: "error" });
  else if (pending > 0) rows.push({ id: "checks", label: `Checks running · ${passed} of ${total} passed`, state: "active" });
  else rows.push({ id: "checks", label: `${total} ${total === 1 ? "check" : "checks"} passed`, state: "done" });

  if (pr.review === "approved") {
    rows.push({ id: "review", label: `Approved by ${pr.approvers.map((login) => `@${login}`).join(", ") || "a reviewer"}`, state: "done" });
  } else if (pr.review === "changes-requested") {
    rows.push({ id: "review", label: "Changes requested in review", state: "error" });
  } else if (merged) {
    rows.push({ id: "review", label: pr.mergedBy ? `Approval satisfied by merge (@${pr.mergedBy})` : "Approval satisfied by merge", state: "done" });
  } else {
    rows.push({ id: "review", label: "Awaiting CODEOWNERS review", state: "waiting" });
  }

  if (merged) rows.push({ id: "merge", label: pr.mergedBy ? `Merged by @${pr.mergedBy}` : "Merged", state: "done" });
  else if (pr.state === "closed") rows.push({ id: "merge", label: "Reopen the pull request or deploy again", state: "error" });
  else rows.push({ id: "merge", label: "Waiting for merge…", state: "active" });

  return rows;
}

export type ReleaseIds = { runNumber: number; commitSha: string; digest: string };

export function startRelease(
  deployment: Deployment,
  options: { trigger: ReleaseTrigger; at: number; speed: number; ids: ReleaseIds; pr?: PrStatus },
): Deployment {
  const release: ReleaseRun = {
    startedAt: options.at,
    speed: options.speed,
    trigger: options.trigger,
    runNumber: options.ids.runNumber,
    commitSha: options.pr?.mergeSha || options.ids.commitSha,
    digest: options.ids.digest,
    mergedBy: options.pr?.mergedBy,
    prNumber: options.pr?.number ?? prNumberFromUrl(deployment.prUrl),
  };
  return { ...deployment, status: "releasing", release };
}

/**
 * Moves a deployment forward after a poll: a merged pull request starts the release,
 * and a release whose simulated run has finished goes live. Returns null when nothing changes.
 */
export function advanceDeployment(
  deployment: Deployment,
  options: { pr?: PrStatus | null; at: number; speed: number; ids: () => ReleaseIds },
): Deployment | null {
  if (isAwaitingMerge(deployment)) {
    if (options.pr?.state === "merged") {
      return startRelease(deployment, { trigger: "merged", at: options.at, speed: options.speed, ids: options.ids(), pr: options.pr });
    }
    return deployment.status === "awaiting-approval" ? { ...deployment, status: "awaiting-merge" } : null;
  }
  if (deployment.status === "releasing" && deployment.release) {
    const plan = releasePlan({ name: deployment.name, run: deployment.release });
    if (options.at - deployment.release.startedAt >= releaseDurationMs(plan, deployment.release.speed)) {
      return { ...deployment, status: "live", url: `/apps/${deployment.name}` };
    }
  }
  return null;
}

export function deploymentProgress(deployment: Deployment, at: number): ReleaseProgress | null {
  if (!deployment.release) return null;
  const plan = releasePlan({ name: deployment.name, run: deployment.release });
  const elapsed = deployment.status === "live" ? Number.POSITIVE_INFINITY : at - deployment.release.startedAt;
  return releaseProgress(plan, deployment.release.speed, elapsed);
}

export type PathView = { complete: number; active: number; label: string; tone: "" | "live" };

/** Bottom PRODUCTION PATH: GitHub Actions build, Controls, Approval, Azure release. */
export function productionPath(deployment: Deployment | undefined, at: number): PathView | null {
  if (!deployment) return null;
  if (deployment.status === "live") return { complete: 3, active: -1, label: "Production deployment live", tone: "live" };
  if (isAwaitingMerge(deployment)) {
    const number = prNumberFromUrl(deployment.prUrl);
    return { complete: -1, active: -1, label: number ? `Waiting for merge · PR #${number}` : "Waiting for merge", tone: "" };
  }
  const progress = deploymentProgress(deployment, at);
  if (!progress) return null;
  if (progress.done) return { complete: 2, active: 3, label: "Finalizing release", tone: "" };
  const job = progress.jobs[progress.jobIndex];
  const step = progress.steps[progress.current]?.step.name;
  return { complete: progress.jobIndex - 1, active: progress.jobIndex, label: step ? `${job.job.name} · ${step}` : job.job.name, tone: "" };
}

/** Flow cards in the deploy modal: App Studio, CI/CD pipeline, Review and approval, Production app. */
export function flowCardStates(deployment: Deployment | undefined, at: number): Array<"complete" | "active" | ""> {
  if (!deployment) return ["", "", "", ""];
  if (deployment.status === "live") return ["complete", "complete", "complete", "complete"];
  if (isAwaitingMerge(deployment)) return ["complete", "active", "", ""];
  const progress = deploymentProgress(deployment, at);
  if (!progress) return ["complete", "active", "", ""];
  // Build and controls jobs are the CI/CD card; approval and deploy have their own.
  const card = progress.done ? 3 : progress.jobIndex <= 1 ? 1 : progress.jobIndex;
  return [0, 1, 2, 3].map((index) => (index < card ? "complete" : index === card ? "active" : ""));
}

export function prNumberFromUrl(url: string | undefined): number | undefined {
  const match = url?.match(/\/pull\/(\d+)/);
  return match ? Number(match[1]) : undefined;
}
