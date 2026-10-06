import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildCreatePrompt, buildFollowUpPrompt } from "@/lib/agent-prompt";
import { renderStarter } from "@/lib/briefing-starter";
import { fastPathCache } from "@/lib/config";
import { applyEvent } from "@/lib/reduce";
import { cachedBriefing, matchesPermianExample, matchStarter, normalizePrompt, PERMIAN_STARTER, previewView } from "@/lib/starters";
import { EXAMPLES } from "@/lib/studio-content";
import type { Artifact, StoredRequest } from "@/lib/types";

const CARD = EXAMPLES[0].prompt;

test("the Permian card text matches exactly and after normalization", () => {
  assert.ok(matchesPermianExample(CARD));
  assert.ok(matchesPermianExample(`  ${CARD.toUpperCase()}  `));
  assert.ok(matchesPermianExample(CARD.replace(/[:,.]/g, "")));
  assert.equal(normalizePrompt("Build the Permian — morning briefing!"), "build the permian morning briefing");
});

test("a close rewording of the card still matches", () => {
  assert.ok(matchesPermianExample("Build me the Permian morning briefing, a concise executive dashboard for production against plan, downtime, safety, exceptions and the decisions needed today"));
});

test("other requests do not get the cached preview", () => {
  for (const example of EXAMPLES.slice(1)) assert.equal(matchesPermianExample(example.prompt), false, example.title);
  assert.equal(matchesPermianExample("Build the Permian morning briefing"), false);
  assert.equal(matchesPermianExample("Permian water handling dashboard with SWD volumes and permits"), false);
  assert.equal(matchesPermianExample(""), false);
});

test("any Permian briefing request adapts the starter, other apps do not", () => {
  assert.deepEqual(matchStarter(CARD), PERMIAN_STARTER);
  assert.deepEqual(matchStarter("Build the Permian morning briefing in blue"), PERMIAN_STARTER);
  assert.equal(matchStarter(EXAMPLES[1].prompt), null);
  assert.equal(matchStarter("A Permian water handling dashboard"), null);
});

test("the cached briefing is a known-good version 0 artifact", () => {
  const artifact = cachedBriefing(CARD, new Date("2026-10-02T12:00:00Z"));
  assert.ok(artifact);
  assert.equal(artifact.version, 0);
  assert.equal(artifact.name, "Permian morning briefing");
  assert.match(artifact.html, /SYNTHETIC DEMO DATA/);
  assert.match(artifact.html, /CS-14 compressor trip/);
  assert.equal(cachedBriefing(EXAMPLES[2].prompt), null);
});

test("FAST_PATH_CACHE is on unless explicitly turned off", () => {
  const before = process.env.FAST_PATH_CACHE;
  try {
    delete process.env.FAST_PATH_CACHE;
    assert.equal(fastPathCache(), true);
    for (const value of ["0", "false", "OFF", "no"]) {
      process.env.FAST_PATH_CACHE = value;
      assert.equal(fastPathCache(), false, value);
    }
    process.env.FAST_PATH_CACHE = "1";
    assert.equal(fastPathCache(), true);
  } finally {
    if (before === undefined) delete process.env.FAST_PATH_CACHE;
    else process.env.FAST_PATH_CACHE = before;
  }
});

function liveRequest(): StoredRequest {
  return {
    agentId: "bc-live",
    name: "Permian morning briefing",
    prompt: CARD,
    requesterId: "u",
    requesterName: "Jordan",
    tags: [],
    modelId: "m",
    modelLabel: "Model",
    status: "running",
    archived: false,
    demo: false,
    createdAt: 1,
    updatedAt: 1,
    events: [],
  };
}

const liveArtifact: Artifact = { name: "Permian morning briefing", slug: "permian", description: "d", insights: [], html: "<!doctype html><p>live</p>", version: 1 };

test("cache-swap: cached preview first, then the agent's artifact replaces it", () => {
  const cached = cachedBriefing(CARD)!;
  let request = applyEvent(liveRequest(), { type: "prompt", kind: "create", text: CARD, at: 2 });
  assert.equal(previewView(request, true).source, "none");

  request = applyEvent(request, { type: "preview", artifact: cached, source: "cache", at: 3 });
  let view = previewView(request, true);
  assert.equal(view.source, "cached");
  assert.equal(view.artifact, cached);
  assert.deepEqual(view.chip, { label: "Preview from last approved build", tone: "cached" });
  assert.equal(request.artifact, undefined, "the cached preview never counts as a deployable artifact");

  request = applyEvent(request, { type: "artifact", artifact: liveArtifact, at: 4 });
  request = applyEvent(request, { type: "result", status: "finished", prUrl: "https://example.test/pr/1", at: 5 });
  view = previewView(request, false);
  assert.equal(view.source, "live");
  assert.equal(view.artifact, liveArtifact);
  assert.deepEqual(view.chip, { label: "Live build", tone: "live" });
});

test("cache-swap: a failed run keeps the cached preview and flags it", () => {
  const cached = cachedBriefing(CARD)!;
  let request = applyEvent(liveRequest(), { type: "preview", artifact: cached, source: "cache", at: 3 });
  request = applyEvent(request, { type: "error", message: "The agent hit its usage limit.", at: 4 });
  const view = previewView(request, false);
  assert.equal(view.source, "cached");
  assert.equal(view.artifact, cached);
  assert.equal(view.chip?.tone, "failed");
  assert.equal(request.error, "The agent hit its usage limit.");
});

test("requests without the fast path show no chip", () => {
  const request = applyEvent(liveRequest(), { type: "artifact", artifact: liveArtifact, at: 4 });
  assert.deepEqual(previewView(request, false), { artifact: liveArtifact, source: "live", chip: null });
  assert.deepEqual(previewView(null, false), { artifact: null, source: "none", chip: null });
});

test("template/public/index.html is the generated starter", () => {
  const committed = fs.readFileSync(path.join(process.cwd(), "template", "public", "index.html"), "utf8");
  assert.equal(committed, renderStarter(), "run `npm run starter` to regenerate it");
});

test("the starter carries tokens for every theme and a parseable data block", () => {
  const html = renderStarter();
  for (const theme of ["blue", "green", "purple", "teal", "orange", "dark"]) assert.match(html, new RegExp(`\\[data-theme="${theme}"\\]`));
  const block = html.match(/<script type="application\/json" id="briefing-data">([\s\S]*?)<\/script>/);
  assert.ok(block);
  const data = JSON.parse(block[1]) as { kpis: unknown[]; decisions: unknown[]; sources: unknown[] };
  assert.equal(data.kpis.length, 6);
  assert.equal(data.decisions.length, 4);
  assert.equal(data.sources.length, 4);
  assert.doesNotMatch(html, /<(script|link)[^>]+(src|href)=/);
});

test("the create prompt adapts the starter when the request matches it", () => {
  const matched = buildCreatePrompt(CARD, matchStarter(CARD));
  assert.match(matched, /Adapt it; don't rewrite it/);
  assert.match(matched, /Don't run npm install/);
  assert.match(matched, /\/opt\/cursor\/artifacts\/index\.html/);
  assert.match(matched, /<app-artifact>/);
  assert.ok(matched.split(/\s+/).length < 320, "keep the prompt short");

  const other = buildCreatePrompt(EXAMPLES[1].prompt, matchStarter(EXAMPLES[1].prompt));
  assert.doesNotMatch(other, /Adapt it/);
  assert.match(other, /Reuse its tokens/);
  assert.match(buildFollowUpPrompt("make it blue"), /data-theme/);
});
