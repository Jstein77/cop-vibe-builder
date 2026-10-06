import { STARTER_ID } from "@/lib/briefing-starter";
import { demoArtifact } from "@/lib/demo-script";
import { EXAMPLES } from "@/lib/studio-content";
import type { Artifact, StoredRequest } from "@/lib/types";

export type Starter = { id: string; title: string };

export const PERMIAN_STARTER: Starter = { id: STARTER_ID, title: "Permian morning briefing" };

const PERMIAN_CARD = EXAMPLES.find((example) => example.title === PERMIAN_STARTER.title)!.prompt;

export function normalizePrompt(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set(["a", "an", "and", "the", "for", "of", "to", "me", "my", "with", "on", "in", "please", "build", "create", "make"]);

function words(text: string): Set<string> {
  return new Set(normalizePrompt(text).split(" ").filter((word) => word && !STOP.has(word)));
}

/** Share of the card's words that the prompt also uses, ignoring filler words. */
export function overlap(prompt: string, card: string): number {
  const cardWords = words(card);
  const promptWords = words(prompt);
  if (!cardWords.size || !promptWords.size) return 0;
  let shared = 0;
  for (const word of cardWords) if (promptWords.has(word)) shared += 1;
  return shared / Math.max(cardWords.size, promptWords.size);
}

/**
 * Strict: the prompt is the Permian example card, verbatim or nearly. This gates the cached
 * preview, so a different request never shows the Permian briefing.
 */
export function matchesPermianExample(prompt: string): boolean {
  if (normalizePrompt(prompt) === normalizePrompt(PERMIAN_CARD)) return true;
  return overlap(prompt, PERMIAN_CARD) >= 0.8;
}

/** Loose: the request is a Permian morning briefing, so the agent should adapt the starter. */
export function matchStarter(prompt: string): Starter | null {
  if (matchesPermianExample(prompt)) return PERMIAN_STARTER;
  const text = normalizePrompt(prompt);
  return /\bpermian\b/.test(text) && /\b(morning )?briefing\b/.test(text) ? PERMIAN_STARTER : null;
}

/** The known-good briefing shown while a live build of the Permian example runs. */
export function cachedBriefing(prompt: string, asOf = new Date()): Artifact | null {
  if (!matchesPermianExample(prompt)) return null;
  const { artifact } = demoArtifact([prompt], 0, asOf);
  return { ...artifact, name: PERMIAN_STARTER.title, slug: PERMIAN_STARTER.id, version: 0 };
}

export type PreviewChip = { label: string; tone: "cached" | "live" | "failed" };

export type PreviewView = { artifact: Artifact | null; source: "cached" | "live" | "none"; chip: PreviewChip | null };

/**
 * What the preview pane shows: the agent's artifact once it exists, otherwise the cached
 * briefing from the fast path. A failed run keeps the cached preview.
 */
export function previewView(request: Pick<StoredRequest, "artifact" | "cachedPreview" | "status"> | null | undefined, building: boolean): PreviewView {
  if (!request) return { artifact: null, source: "none", chip: null };
  if (request.artifact) {
    return { artifact: request.artifact, source: "live", chip: request.cachedPreview ? { label: "Live build", tone: "live" } : null };
  }
  if (request.cachedPreview) {
    const failed = !building && (request.status === "error" || request.status === "cancelled");
    return {
      artifact: request.cachedPreview,
      source: "cached",
      chip: failed
        ? { label: "Preview from last approved build · live build did not finish", tone: "failed" }
        : { label: "Preview from last approved build", tone: "cached" },
    };
  }
  return { artifact: null, source: "none", chip: null };
}
