import type { Artifact, ClientEvent } from "@/lib/types";

export type StepDef = { label: string; detail: string };

export const CREATE_STEPS: StepDef[] = [
  { label: "Understand the decision", detail: "Prompt" },
  { label: "Ground in enterprise context", detail: "4 sources" },
  { label: "Design and build the experience", detail: "HTML app" },
  { label: "Validate the deployable artifact", detail: "Smoke check" },
];

export const FOLLOW_UP_STEPS: StepDef[] = [
  { label: "Understand the change", detail: "Follow-up" },
  { label: "Update the experience", detail: "HTML app" },
  { label: "Validate the deployable artifact", detail: "Smoke check" },
];

export function stepsFor(kind: "create" | "followup"): StepDef[] {
  return kind === "create" ? CREATE_STEPS : FOLLOW_UP_STEPS;
}

export type TurnState = "running" | "done" | "error" | "cancelled";

export type Turn = {
  kind: "create" | "followup";
  prompt: string;
  startedAt: number;
  endedAt?: number;
  step: number;
  steps: StepDef[];
  message: string;
  state: TurnState;
  artifact?: Artifact;
  error?: string;
  helpUrl?: string;
  resultText?: string;
};

const TEST_COMMAND = /\b(npm (run )?test|node --test|npx vitest|npx jest)\b/i;
const EDIT_TOOLS = /^(write|edit|multiedit|str_?replace|apply_?patch|create_?file)/i;

/**
 * Advance the checklist for a live cloud agent from the events it streams.
 * Returns the next phase, or null when the event does not move the checklist.
 */
export function nextLivePhase(
  current: number,
  event: ClientEvent,
  kind: "create" | "followup",
): { step: number; message: string } | null {
  const steps = stepsFor(kind);
  const build = kind === "create" ? 2 : 1;
  const validate = steps.length - 1;
  const advance = (step: number, message: string) => (step > current ? { step, message } : null);

  if (kind === "create" && current < 1) {
    if (event.type === "status" || event.type === "thinking" || event.type === "assistant" || event.type === "tool") {
      if (!(event.type === "tool" && EDIT_TOOLS.test(event.name))) {
        return advance(1, "Cloud agent connected · grounding enterprise context");
      }
    }
  }
  if (event.type === "tool" && EDIT_TOOLS.test(event.name)) {
    return advance(build, "Designing the information hierarchy and interactions");
  }
  if (event.type === "tool" && TEST_COMMAND.test(event.detail ?? "")) {
    return advance(validate, "Validating the generated artifact");
  }
  if (event.type === "result" && event.status === "finished") {
    return advance(validate, "Reading the generated app back from the agent");
  }
  return null;
}

function toolVerb(name: string): string {
  const lower = name.toLowerCase();
  if (lower === "read" || lower.startsWith("read")) return "Reading";
  if (lower.startsWith("write") || lower.startsWith("create")) return "Writing";
  if (lower.startsWith("edit") || lower.startsWith("str") || lower.includes("patch")) return "Editing";
  if (lower === "shell" || lower.startsWith("run") || lower === "bash") return "Running";
  if (lower.includes("grep") || lower.includes("glob") || lower.includes("search")) return "Searching";
  if (lower === "mcp") return "Querying";
  return name;
}

export function activityLabel(event: ClientEvent): string | null {
  if (event.type !== "tool" || event.status !== "running") return null;
  const verb = toolVerb(event.name);
  return event.detail ? `${verb} ${event.detail}` : verb;
}

export function buildTurns(events: ClientEvent[]): Turn[] {
  const turns: Turn[] = [];
  let turn: Turn | null = null;

  for (const event of events) {
    if (event.type === "prompt") {
      const steps = stepsFor(event.kind);
      turn = {
        kind: event.kind,
        prompt: event.text,
        startedAt: event.at,
        step: 0,
        steps,
        message: event.kind === "create" ? "Starting a cloud agent…" : "Resuming the same cloud agent…",
        state: "running",
      };
      turns.push(turn);
      continue;
    }
    if (!turn) continue;

    switch (event.type) {
      case "phase":
        if (event.step >= turn.step) {
          turn.step = event.step;
          turn.message = event.message;
        }
        if (event.step >= turn.steps.length) {
          turn.state = "done";
          turn.endedAt = event.at;
        }
        break;
      case "tool": {
        const label = turn.state === "running" ? activityLabel(event) : null;
        if (label) turn.message = label;
        break;
      }
      case "artifact":
        turn.artifact = event.artifact;
        break;
      case "result":
        if (event.text) turn.resultText = event.text;
        if (event.status === "cancelled") {
          turn.state = "cancelled";
          turn.endedAt = event.at;
          turn.message = "Build stopped";
        } else if (event.status === "error") {
          turn.state = "error";
          turn.endedAt = event.at;
          turn.error = event.error || "The cloud agent stopped before completing the app.";
          turn.message = "Build stopped";
        }
        break;
      case "error":
        turn.state = "error";
        turn.endedAt = event.at;
        turn.error = event.message;
        turn.helpUrl = event.helpUrl;
        turn.message = "Build stopped";
        break;
      default:
        break;
    }
  }

  return turns;
}

export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
