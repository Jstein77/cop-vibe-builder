import { randomBytes } from "node:crypto";

import { isValidDeploymentName } from "@/lib/artifact";
import { demoSpeed, isDemoMode, RequestError } from "@/lib/config";
import { PrReadError, readPullRequest } from "@/lib/github-pr";
import { advanceDeployment, isAwaitingMerge, startRelease, type ReleaseIds } from "@/lib/release-watch";
import { getStoredRequest, recordEvent } from "@/lib/store";
import type { Deployment, PrStatus, StoredRequest } from "@/lib/types";

export type ReleaseSnapshot = { deployment: Deployment | null; pr?: PrStatus; prError?: string; checkedAt: number };

function releaseIds(): ReleaseIds {
  return {
    runNumber: 100 + (randomBytes(1)[0] % 150),
    commitSha: randomBytes(20).toString("hex"),
    digest: `sha256:${randomBytes(32).toString("hex")}`,
  };
}

async function requireDeployable(agentId: string): Promise<StoredRequest & { artifact: NonNullable<StoredRequest["artifact"]> }> {
  const request = await getStoredRequest(agentId);
  if (!request) throw new RequestError("No request with that id.", 404);
  if (!request.artifact) throw new RequestError("Build the app before deploying it.", 409);
  return request as StoredRequest & { artifact: NonNullable<StoredRequest["artifact"]> };
}

async function save(agentId: string, deployment: Deployment): Promise<Deployment> {
  await recordEvent(agentId, { type: "deployment", deployment, at: Date.now() });
  return deployment;
}

const locks = new Map<string, Promise<unknown>>();

function serialized<T>(agentId: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(agentId) ?? Promise.resolve();
  const next = previous.then(task, task);
  locks.set(agentId, next.catch(() => undefined));
  return next;
}

/**
 * DEMO_MODE starts the simulated release right away. Live mode records the agent's
 * pull request and waits for it to merge; the release route watches it.
 */
export async function deployRequest(agentId: string, deploymentName: string): Promise<Deployment> {
  if (!isValidDeploymentName(deploymentName)) {
    throw new RequestError("Use lowercase letters, numbers, and hyphens for the deployment name.");
  }
  return serialized(agentId, async () => {
    const request = await requireDeployable(agentId);
    if (request.status === "running") throw new RequestError("Wait for the current build to finish.", 409);
    const base: Deployment = {
      name: deploymentName,
      status: "awaiting-merge",
      prUrl: request.prUrl,
      url: request.prUrl,
      artifactVersion: request.artifact.version,
      at: Date.now(),
    };
    if (request.demo || isDemoMode()) {
      return save(agentId, startRelease(base, { trigger: "demo", at: Date.now(), speed: demoSpeed(), ids: releaseIds() }));
    }
    if (!request.prUrl) {
      // No pull request (for example the starter already matched and the agent made no edits).
      // Play the simulated release so the demo never dead-ends on the deploy step.
      console.warn(`[vibe] ${agentId} has no pull request; running the simulated release`);
      return save(agentId, startRelease(base, { trigger: "simulated", at: Date.now(), speed: demoSpeed(), ids: releaseIds() }));
    }
    return save(agentId, base);
  });
}

/** Reads the pull request when the release is waiting on it, and moves the deployment forward. */
export async function pollRelease(agentId: string): Promise<ReleaseSnapshot> {
  return serialized(agentId, async () => {
    const request = await getStoredRequest(agentId);
    if (!request) throw new RequestError("No request with that id.", 404);
    let deployment = request.deployment ?? null;
    if (!deployment) return { deployment: null, checkedAt: Date.now() };

    let pr: PrStatus | undefined;
    let prError: string | undefined;
    if (isAwaitingMerge(deployment) && deployment.prUrl) {
      try {
        pr = await readPullRequest(deployment.prUrl, { since: deployment.at });
      } catch (error) {
        prError = error instanceof PrReadError ? error.message : `Could not read the pull request: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`[vibe] PR watch ${deployment.prUrl}: ${prError}`);
      }
    }

    const next = advanceDeployment(deployment, { pr, at: Date.now(), speed: demoSpeed(), ids: releaseIds });
    if (next) deployment = await save(agentId, next);
    return { deployment, pr, prError, checkedAt: Date.now() };
  });
}

/** Demo escape hatch: treat the pull request as merged without touching GitHub. */
export async function simulateMerge(agentId: string): Promise<ReleaseSnapshot> {
  return serialized(agentId, async () => {
    const request = await getStoredRequest(agentId);
    const deployment = request?.deployment;
    if (!deployment) throw new RequestError("Deploy the app first.", 409);
    if (!isAwaitingMerge(deployment)) return { deployment, checkedAt: Date.now() };
    const next = startRelease(deployment, { trigger: "simulated", at: Date.now(), speed: demoSpeed(), ids: releaseIds() });
    return { deployment: await save(agentId, next), checkedAt: Date.now() };
  });
}
