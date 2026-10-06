import assert from "node:assert/strict";
import test from "node:test";

import { githubContentsUrl, isValidDeploymentName, parseArtifactMeta, slugify, stripArtifactMeta } from "../lib/artifact";
import { renderBriefing, themeFromPrompt } from "../lib/briefing";
import { demoArtifact, demoTimeline, timelineDuration } from "../lib/demo-script";
import { buildTurns, CREATE_STEPS, nextLivePhase } from "../lib/progress";
import { applyEvent, isTerminalEvent } from "../lib/reduce";
import type { ClientEvent, StoredRequest } from "../lib/types";

const REPO = "https://github.com/cop-digital/app-template";
const BRANCH = "cursor/permian-morning-briefing-ab12";
const PR = `${REPO}/pull/128`;

function blank(): StoredRequest {
  return {
    agentId: "bc-demo-test",
    name: "Permian morning briefing",
    prompt: "Build the Permian morning briefing",
    requesterId: "jordan",
    requesterName: "Jordan Stein",
    tags: [],
    modelId: "demo",
    modelLabel: "Demo model",
    status: "running",
    archived: false,
    demo: true,
    createdAt: 1,
    updatedAt: 1,
    events: [],
  };
}

function stamp(steps: ReturnType<typeof demoTimeline>, start = 0): ClientEvent[] {
  let at = start;
  return steps.map((step) => {
    at += step.delayMs;
    return { ...step.event, at } as ClientEvent;
  });
}

test("the create timeline walks all four checklist steps and lands a PR and an artifact", () => {
  const { artifact } = demoArtifact(["Build the Permian morning briefing"], 1);
  const steps = demoTimeline({ kind: "create", prompt: "Build the Permian morning briefing", repoUrl: REPO, branch: BRANCH, prUrl: PR, artifact });
  const duration = timelineDuration(steps);
  assert.ok(duration >= 30_000 && duration <= 60_000, `create timeline should be 30-60s, got ${duration}ms`);

  const phases = steps.flatMap((step) => (step.event.type === "phase" ? [step.event.step] : []));
  assert.deepEqual(phases, [1, 2, 3, 4]);

  const result = steps.find((step) => step.event.type === "result")?.event;
  assert.equal(result?.type === "result" && result.prUrl, PR);
  const cost = steps.at(-1)?.event;
  assert.equal(cost?.type, "cost");
  if (cost?.type === "cost") assert.equal(isTerminalEvent({ ...cost, at: 1 }), true);
});

test("buildTurns turns a prompt and its events into a completed checklist with the artifact", () => {
  const { artifact } = demoArtifact(["Build the Permian morning briefing"], 1);
  const events: ClientEvent[] = [
    { type: "prompt", kind: "create", text: "Build the Permian morning briefing", at: 0 },
    ...stamp(demoTimeline({ kind: "create", prompt: "", repoUrl: REPO, branch: BRANCH, prUrl: PR, artifact })),
  ];
  const [turn] = buildTurns(events);
  assert.equal(turn.state, "done");
  assert.equal(turn.step, CREATE_STEPS.length);
  assert.equal(turn.artifact?.name, "Permian morning briefing");
  assert.ok(turn.endedAt && turn.endedAt > turn.startedAt);
});

test("a follow-up starts a second turn and restyles the artifact", () => {
  const first = demoArtifact(["Build the Permian morning briefing"], 1).artifact;
  const second = demoArtifact(["Build the Permian morning briefing", "make it blue"], 2);
  assert.equal(second.theme, "blue");
  assert.notEqual(first.html, second.artifact.html);
  assert.equal(second.artifact.version, 2);

  const events: ClientEvent[] = [
    { type: "prompt", kind: "create", text: "Build it", at: 0 },
    { type: "artifact", artifact: first, at: 1 },
    { type: "phase", step: 4, message: "done", at: 2 },
    { type: "prompt", kind: "followup", text: "make it blue", at: 3 },
    { type: "phase", step: 1, message: "Updating the experience", at: 4 },
  ];
  const turns = buildTurns(events);
  assert.equal(turns.length, 2);
  assert.equal(turns[0].state, "done");
  assert.equal(turns[1].state, "running");
  assert.equal(turns[1].kind, "followup");
});

test("themeFromPrompt understands common restyle requests", () => {
  assert.equal(themeFromPrompt("make it blue"), "blue");
  assert.equal(themeFromPrompt("Can you switch to a green palette?"), "green");
  assert.equal(themeFromPrompt("dark mode please"), "dark");
  assert.equal(themeFromPrompt("add a column for owner"), null);
});

test("the synthetic briefing is a full HTML document with the demo badge", () => {
  const html = renderBriefing({ title: "Permian morning briefing", theme: "red", notes: [], asOf: new Date("2026-10-01T11:00:00Z"), build: "v1" });
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /Synthetic demo data/i);
  assert.match(html, /Decisions needed today/);
});

test("nextLivePhase maps SDK activity onto the checklist", () => {
  assert.deepEqual(nextLivePhase(0, { type: "status", status: "RUNNING", at: 1 }, "create")?.step, 1);
  assert.equal(nextLivePhase(1, { type: "tool", callId: "w", name: "Write", status: "running", detail: "public/index.html", at: 2 }, "create")?.step, 2);
  assert.equal(nextLivePhase(2, { type: "tool", callId: "t", name: "Shell", status: "running", detail: "npm test", at: 3 }, "create")?.step, 3);
  assert.equal(nextLivePhase(3, { type: "tool", callId: "r", name: "Read", status: "running", detail: "README.md", at: 4 }, "create"), null);
});

test("artifact helpers parse the agent's metadata block and build a contents URL", () => {
  const text = 'Done.\n<app-artifact>{"name":"Well performance desk","slug":"Well Performance Desk","insights":["a","b"]}</app-artifact>';
  const meta = parseArtifactMeta(text);
  assert.equal(meta.name, "Well performance desk");
  assert.equal(meta.slug, "well-performance-desk");
  assert.deepEqual(meta.insights, ["a", "b"]);
  assert.equal(stripArtifactMeta(text), "Done.");
  assert.deepEqual(parseArtifactMeta("<app-artifact>not json</app-artifact>"), {});

  assert.equal(slugify("Permian's morning briefing!"), "permians-morning-briefing");
  assert.equal(isValidDeploymentName("permian-morning-briefing"), true);
  assert.equal(isValidDeploymentName("-bad"), false);
  assert.equal(
    githubContentsUrl(REPO, BRANCH),
    "https://api.github.com/repos/cop-digital/app-template/contents/public/index.html?ref=cursor%2Fpermian-morning-briefing-ab12",
  );
  assert.equal(githubContentsUrl("https://gitlab.com/a/b", "main"), null);
});

test("applyEvent records artifacts and deployments on the request", () => {
  const { artifact } = demoArtifact(["Build the Permian morning briefing"], 1);
  let request = applyEvent(blank(), { type: "artifact", artifact, at: 5 });
  assert.equal(request.artifact?.slug, "permian-morning-briefing");
  request = applyEvent(request, { type: "result", status: "finished", branch: BRANCH, prUrl: PR, at: 10 });
  assert.equal(request.status, "finished");
  request = applyEvent(request, {
    type: "deployment",
    deployment: { name: "permian-morning-briefing", status: "live", url: "https://example.test", artifactVersion: 1, at: 12 },
    at: 12,
  });
  assert.equal(request.deployment?.status, "live");
});
