import { demoSpeed } from "@/lib/config";
import { demoAppName, demoArtifact, demoBranch, demoPullUrl, demoTimeline, type DemoStep } from "@/lib/demo-script";
import { getStoredRequest, recordEvent } from "@/lib/store";
import type { ClientEvent } from "@/lib/types";

const controllers = new Map<string, AbortController>();

export class RunCancelled extends Error {
  constructor() {
    super("Cancelled");
    this.name = "RunCancelled";
  }
}

export function trackRun(agentId: string): AbortSignal {
  const existing = controllers.get(agentId);
  if (existing) existing.abort();
  const controller = new AbortController();
  controllers.set(agentId, controller);
  return controller.signal;
}

export function releaseRun(agentId: string) {
  controllers.delete(agentId);
}

export function cancelTrackedRun(agentId: string): boolean {
  const controller = controllers.get(agentId);
  if (!controller) return false;
  controller.abort();
  return true;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof RunCancelled || (error instanceof Error && error.name === "AbortError");
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new RunCancelled());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new RunCancelled());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function play(agentId: string, steps: DemoStep[], signal: AbortSignal) {
  const speed = demoSpeed();
  for (const step of steps) {
    await sleep(Math.round(step.delayMs / speed), signal);
    const event = { ...step.event, at: Date.now() } as ClientEvent;
    await recordEvent(agentId, event);
  }
}

export async function playDemo(options: {
  agentId: string;
  prompt: string;
  kind: "create" | "followup";
  repoUrl: string;
  branch?: string;
  prUrl?: string;
  signal: AbortSignal;
}) {
  const stored = await getStoredRequest(options.agentId);
  const prompts = (stored?.events ?? []).flatMap((event) => (event.type === "prompt" ? [event.text] : []));
  if (!prompts.length) prompts.push(options.prompt);
  const version = (stored?.artifact?.version ?? 0) + 1;
  const { artifact } = demoArtifact(prompts, version);
  const branch = options.branch || demoBranch(demoAppName(prompts[0]));
  const prUrl = options.prUrl || demoPullUrl(options.repoUrl);
  const steps = demoTimeline({ kind: options.kind, prompt: options.prompt, repoUrl: options.repoUrl, branch, prUrl, artifact });
  try {
    await play(options.agentId, steps, options.signal);
  } catch (error) {
    if (!isAbortError(error)) throw error;
    await recordEvent(options.agentId, {
      type: "result",
      status: "cancelled",
      repoUrl: options.repoUrl,
      branch,
      text: "Cancelled before the agent finished. The transcript stays here.",
      at: Date.now(),
    });
  }
}
