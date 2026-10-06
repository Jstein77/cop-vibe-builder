import assert from "node:assert/strict";
import test from "node:test";

import { parsePullUrl } from "../lib/github-pr";
import { productionHost, releaseDurationMs, releasePlan, releaseProgress } from "../lib/release-sim";
import { advanceDeployment, flowCardStates, productionPath, prWatchRows } from "../lib/release-watch";
import type { Deployment, PrStatus } from "../lib/types";

const PR_URL = "https://github.com/Jstein77/cop-vibe-template/pull/1";
const ids = () => ({ runNumber: 142, commitSha: "a".repeat(40), digest: `sha256:${"b".repeat(64)}` });

function awaiting(overrides: Partial<Deployment> = {}): Deployment {
  return { name: "permian-morning-briefing", status: "awaiting-merge", prUrl: PR_URL, url: PR_URL, artifactVersion: 1, at: 1_000, ...overrides };
}

function pr(overrides: Partial<PrStatus> = {}): PrStatus {
  return {
    number: 1,
    title: "Add the generated app",
    url: PR_URL,
    state: "open",
    draft: false,
    checks: { total: 0, passed: 0, failed: 0, pending: 0 },
    review: "pending",
    approvers: [],
    source: "gh",
    ...overrides,
  };
}

test("an open pull request keeps the release waiting and says what it is waiting on", () => {
  const rows = prWatchRows(pr());
  assert.deepEqual(
    rows.map((row) => [row.id, row.state]),
    [
      ["pr", "done"],
      ["checks", "neutral"],
      ["review", "waiting"],
      ["merge", "active"],
    ],
  );
  assert.equal(rows.at(-1)?.label, "Waiting for merge…");
  assert.equal(advanceDeployment(awaiting(), { pr: pr(), at: 5_000, speed: 1, ids }), null);
  assert.equal(productionPath(awaiting(), 5_000)?.label, "Waiting for merge · PR #1");
  assert.deepEqual(flowCardStates(awaiting(), 5_000), ["complete", "active", "", ""]);
});

test("checks and reviews map to running, failed and approved rows", () => {
  const running = prWatchRows(pr({ checks: { total: 3, passed: 1, failed: 0, pending: 2 } }));
  assert.equal(running[1].state, "active");
  assert.equal(running[1].label, "Checks running · 1 of 3 passed");
  const failed = prWatchRows(pr({ checks: { total: 2, passed: 1, failed: 1, pending: 0 }, review: "changes-requested" }));
  assert.equal(failed[1].state, "error");
  assert.equal(failed[2].state, "error");
  const approved = prWatchRows(pr({ checks: { total: 2, passed: 2, failed: 0, pending: 0 }, review: "approved", approvers: ["cop-platform"] }));
  assert.equal(approved[1].label, "2 checks passed");
  assert.equal(approved[2].label, "Approved by @cop-platform");
});

test("a merged pull request starts the release and records who merged it", () => {
  const merged = pr({ state: "merged", mergedBy: "jstein77", mergeSha: "c".repeat(40) });
  const rows = prWatchRows(merged);
  assert.equal(rows[2].label, "Approval satisfied by merge (@jstein77)");
  assert.equal(rows[3].label, "Merged by @jstein77");

  const next = advanceDeployment(awaiting(), { pr: merged, at: 10_000, speed: 1, ids });
  assert.equal(next?.status, "releasing");
  assert.equal(next?.release?.trigger, "merged");
  assert.equal(next?.release?.mergedBy, "jstein77");
  assert.equal(next?.release?.prNumber, 1);
  assert.equal(next?.release?.commitSha, "c".repeat(40));
});

test("a closed, unmerged pull request is an error and does not release", () => {
  const closed = pr({ state: "closed" });
  assert.equal(prWatchRows(closed)[0].state, "error");
  assert.equal(advanceDeployment(awaiting(), { pr: closed, at: 10_000, speed: 1, ids }), null);
});

test("deployments stored by the previous build are read as awaiting merge", () => {
  const legacy = awaiting({ status: "awaiting-approval" });
  assert.equal(advanceDeployment(legacy, { pr: pr(), at: 2_000, speed: 1, ids })?.status, "awaiting-merge");
  assert.equal(advanceDeployment(legacy, { pr: pr({ state: "merged" }), at: 2_000, speed: 1, ids })?.status, "releasing");
});

test("the release walks build, controls, approval and deploy, then goes live", () => {
  const releasing = advanceDeployment(awaiting(), { pr: pr({ state: "merged", mergedBy: "jstein77" }), at: 10_000, speed: 1, ids })!;
  const plan = releasePlan({ name: releasing.name, run: releasing.release! });
  const total = releaseDurationMs(plan, 1);
  assert.ok(total >= 30_000 && total <= 45_000, `release should take 30-45s, took ${total}ms`);
  assert.deepEqual(
    plan.map((step) => step.name),
    [
      "Checkout",
      "npm ci",
      "Lint and test",
      "Build container image",
      "Push to Azure Container Registry",
      "Dependency and SAST scan",
      "Policy check",
      "CODEOWNERS approval",
      "Azure login (OIDC)",
      "Deploy to App Service staging slot",
      "Health checks",
      "Swap staging into production",
    ],
  );
  assert.ok(plan.find((step) => step.name === "CODEOWNERS approval")?.logs.some((line) => line.includes("@jstein77")));

  const stages = [1_000, 20_000, 26_500, 28_000, 35_000].map((elapsed) => productionPath(releasing, 10_000 + elapsed));
  assert.deepEqual(
    stages.map((stage) => stage?.active),
    [0, 0, 1, 2, 3],
  );
  assert.deepEqual(flowCardStates(releasing, 10_000 + 28_000), ["complete", "complete", "active", ""]);

  assert.equal(advanceDeployment(releasing, { at: 10_000 + total - 1, speed: 1, ids }), null);
  const live = advanceDeployment(releasing, { at: 10_000 + total, speed: 1, ids });
  assert.equal(live?.status, "live");
  assert.equal(live?.url, "/apps/permian-morning-briefing");
  assert.equal(productionHost("permian-morning-briefing"), "https://cop-permian-morning-briefing.azurewebsites.net");
  assert.equal(productionPath(live!, 0)?.tone, "live");
  assert.deepEqual(flowCardStates(live!, 0), ["complete", "complete", "complete", "complete"]);
});

test("DEMO_SPEED scales the release and the log tail streams with it", () => {
  const run = { startedAt: 0, speed: 4, trigger: "demo" as const, runNumber: 7, commitSha: "d".repeat(40), digest: "sha256:" + "e".repeat(64) };
  const plan = releasePlan({ name: "app", run });
  assert.equal(releaseDurationMs(plan, 4), Math.round(releaseDurationMs(plan, 1) / 4));
  const early = releaseProgress(plan, 4, 100);
  assert.equal(early.current, 0);
  assert.equal(early.log[0], "▸ Checkout");
  const finished = releaseProgress(plan, 4, Number.POSITIVE_INFINITY);
  assert.equal(finished.done, true);
  assert.equal(finished.jobIndex, 4);
  assert.ok(finished.log.some((line) => line.includes(run.digest)));
});

test("parsePullUrl reads owner, repo and number", () => {
  assert.deepEqual(parsePullUrl(PR_URL), { owner: "Jstein77", repo: "cop-vibe-template", number: 1 });
  assert.equal(parsePullUrl("https://gitlab.com/a/b/-/merge_requests/1"), null);
});
