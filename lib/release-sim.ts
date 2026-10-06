/**
 * SIMULATED production release.
 *
 * Nothing in this module calls GitHub Actions, Azure Container Registry or Azure App
 * Service. The demo template repo has Actions disabled and there is no Azure subscription
 * behind it, so after the agent's pull request merges (or "Simulate merge" is used)
 * App Studio plays this scripted run instead. The schedule is a pure function of the release start time and
 * speed, so the browser animates it locally and the server reaches the same end state.
 *
 * To make it real, replace this with the template's .github/workflows/deploy.yml run,
 * read through the GitHub Actions API, and keep the same ReleaseProgress shape.
 */
import type { ReleaseRun } from "@/lib/types";

export type ReleaseJobId = "build" | "controls" | "approval" | "deploy";

export type ReleaseJob = { id: ReleaseJobId; name: string };

export const RELEASE_JOBS: ReleaseJob[] = [
  { id: "build", name: "Build and test" },
  { id: "controls", name: "Controls" },
  { id: "approval", name: "Approval" },
  { id: "deploy", name: "Deploy to Azure" },
];

export type ReleaseStep = { job: ReleaseJobId; name: string; durationMs: number; logs: string[] };

export type ReleaseContext = { name: string; run: ReleaseRun; region?: string; resourceGroup?: string; registry?: string };

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

export function approvalLine(run: ReleaseRun): string {
  if (run.trigger === "merged") {
    return run.mergedBy ? `Satisfied by merge of #${run.prNumber ?? "?"} by @${run.mergedBy}` : `Satisfied by merge of #${run.prNumber ?? "?"}`;
  }
  if (run.trigger === "simulated") return `Satisfied by merge of #${run.prNumber ?? "?"} (simulated)`;
  return "Recorded for the App Studio release";
}

export function releasePlan({
  name,
  run,
  region = "southcentralus",
  resourceGroup = "rg-cop-appstudio-prod-scus",
  registry = "crcopappstudio.azurecr.io",
}: ReleaseContext): ReleaseStep[] {
  const sha = shortSha(run.commitSha);
  const image = `${registry}/apps/${name}`;
  const app = webAppName(name);
  const digestShort = run.digest.slice(0, 19);
  return [
    {
      job: "build",
      name: "Checkout",
      durationMs: 1800,
      logs: [`Syncing repository: cop-digital/${name}`, `Checking out ${sha} (refs/heads/main)`, "HEAD is now at " + sha],
    },
    {
      job: "build",
      name: "npm ci",
      durationMs: 4600,
      logs: ["npm ci --no-audit --no-fund", "added 214 packages in 3s", "found 0 vulnerabilities"],
    },
    {
      job: "build",
      name: "Lint and test",
      durationMs: 5200,
      logs: ["npm run lint", "✔ No lint errors", "npm test", "✔ GET /ping returns 200", "✔ public/index.html renders without network calls", "tests 6 · pass 6 · fail 0"],
    },
    {
      job: "build",
      name: "Build container image",
      durationMs: 6200,
      logs: [
        `docker build -t ${name}:${sha} .`,
        "#5 [build 2/4] RUN npm ci --omit=dev",
        "#7 [runtime 3/4] COPY --from=build /app /app",
        "#9 exporting layers 0.8s done",
        `naming to ${name}:${sha} done`,
      ],
    },
    {
      job: "build",
      name: "Push to Azure Container Registry",
      durationMs: 3400,
      logs: [`az acr login --name ${registry.split(".")[0]}`, `Pushing ${image}:${sha}`, "a3f1c2d8e1b4: Pushed", `${sha}: digest: ${run.digest} size: 1784`],
    },
    {
      job: "controls",
      name: "Dependency and SAST scan",
      durationMs: 4000,
      logs: ["Scanning 214 dependencies against the ConocoPhillips allow list", "0 critical · 0 high · 1 low (dev only)", "SAST: 0 findings in src/ and public/"],
    },
    {
      job: "controls",
      name: "Policy check",
      durationMs: 1800,
      logs: ["Evaluating cop-release-policy v4", "✔ image signed · ✔ base image approved · ✔ no secrets in layers", "Policy passed"],
    },
    {
      job: "approval",
      name: "CODEOWNERS approval",
      durationMs: 1500,
      logs: ["Required reviewers: @cop-digital/platform", `✔ ${approvalLine(run)}`],
    },
    {
      job: "deploy",
      name: "Azure login (OIDC)",
      durationMs: 2000,
      logs: [
        "azure/login@v2 · federated credential for repo:cop-digital/" + name + ":environment:production",
        "Subscription: sub-cop-appstudio-prod",
        `Resource group: ${resourceGroup} (${region})`,
      ],
    },
    {
      job: "deploy",
      name: "Deploy to App Service staging slot",
      durationMs: 4600,
      logs: [
        `azure/webapps-deploy@v3 · app ${app} · slot staging`,
        `Image ${image}@${digestShort}…`,
        "Pulling image on plan asp-cop-appstudio-prod (P1v3, Linux)",
        "Instance 1/2 started",
        "Instance 2/2 started",
      ],
    },
    {
      job: "deploy",
      name: "Health checks",
      durationMs: 3300,
      logs: [`GET https://${app}-staging.azurewebsites.net/ping → 200 (34 ms)`, "GET / → 200 (51 ms)", "Health check: 2/2 instances healthy"],
    },
    {
      job: "deploy",
      name: "Swap staging into production",
      durationMs: 2100,
      logs: [
        `az webapp deployment slot swap -g ${resourceGroup} -n ${app} --slot staging --target-slot production`,
        "Warming up production slot",
        "Swap complete · staging → production",
        `Release ${run.runNumber} complete`,
      ],
    },
  ];
}

export function releaseDurationMs(plan: ReleaseStep[], speed: number): number {
  return Math.round(plan.reduce((total, step) => total + step.durationMs, 0) / normalSpeed(speed));
}

function normalSpeed(speed: number): number {
  return Number.isFinite(speed) && speed > 0 ? speed : 1;
}

export type StepState = "pending" | "running" | "done";

export type ReleaseProgress = {
  elapsedMs: number;
  totalMs: number;
  done: boolean;
  /** Index of the running step, or plan.length once everything has finished. */
  current: number;
  steps: Array<{ step: ReleaseStep; state: StepState; elapsedMs: number; durationMs: number }>;
  jobs: Array<{ job: ReleaseJob; state: StepState; elapsedMs: number }>;
  /** Index into RELEASE_JOBS of the running job, or RELEASE_JOBS.length when finished. */
  jobIndex: number;
  log: string[];
};

export function releaseProgress(plan: ReleaseStep[], speed: number, elapsedMs: number): ReleaseProgress {
  const scale = normalSpeed(speed);
  const clamped = Math.max(0, elapsedMs);
  let cursor = 0;
  let current = plan.length;
  const log: string[] = [];
  const steps = plan.map((step, index) => {
    const durationMs = Math.round(step.durationMs / scale);
    const start = cursor;
    cursor += durationMs;
    const within = clamped - start;
    let state: StepState = "pending";
    if (within >= durationMs) state = "done";
    else if (within >= 0) state = "running";
    if (state === "running" && current === plan.length) current = index;
    if (state !== "pending") {
      log.push(`▸ ${step.name}`);
      const shown = state === "done" ? step.logs.length : Math.min(step.logs.length, Math.floor((within / durationMs) * step.logs.length) + 1);
      log.push(...step.logs.slice(0, shown));
    }
    return { step, state, elapsedMs: state === "done" ? durationMs : Math.max(0, within), durationMs };
  });
  const totalMs = cursor;

  const jobs = RELEASE_JOBS.map((job) => {
    const own = steps.filter((item) => item.step.job === job.id);
    const state: StepState = own.every((item) => item.state === "done") ? "done" : own.some((item) => item.state !== "pending") ? "running" : "pending";
    return { job, state, elapsedMs: own.reduce((total, item) => total + item.elapsedMs, 0) };
  });
  const running = jobs.findIndex((item) => item.state !== "done");

  return {
    elapsedMs: Math.min(clamped, totalMs),
    totalMs,
    done: clamped >= totalMs,
    current,
    steps,
    jobs,
    jobIndex: running < 0 ? RELEASE_JOBS.length : running,
    log,
  };
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/** Display URL for a live app. It links to this server's /apps/<name> route. */
export function productionHost(name: string): string {
  return `https://${webAppName(name)}.azurewebsites.net`;
}

/** App Service names are global, so generated apps get a company prefix. */
export function webAppName(name: string): string {
  return `cop-${name}`;
}
