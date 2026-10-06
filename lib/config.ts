import type { Requester } from "@/lib/types";

export class RequestError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "RequestError";
    this.status = status;
  }
}

/**
 * Real cloud agents are the default whenever CURSOR_API_KEY is set.
 * DEMO_MODE is the fallback for rehearsing the UI with no key. A DEMO_MODE
 * flag does not override a real key.
 */
export function getApiKey(): string | undefined {
  const key = process.env.CURSOR_API_KEY?.trim();
  return key ? key : undefined;
}

export function isDemoMode(): boolean {
  return !getApiKey();
}

export function templateRepoUrl(): string {
  const url = process.env.TEMPLATE_REPO_URL?.trim();
  if (!url) {
    throw new RequestError(
      "TEMPLATE_REPO_URL is not set. Push template/ to GitHub and point this variable at that repo.",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new RequestError("TEMPLATE_REPO_URL must be an https URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new RequestError("TEMPLATE_REPO_URL must use https.");
  }
  return url.replace(/\.git$/, "").replace(/\/$/, "");
}

export function templateStartingRef(): string {
  return process.env.TEMPLATE_STARTING_REF?.trim() || "main";
}

export function demoRepoUrl(): string {
  const configured = process.env.TEMPLATE_REPO_URL?.trim();
  if (!configured) return "https://github.com/your-org/app-template";
  try {
    return templateRepoUrl();
  } catch {
    return "https://github.com/your-org/app-template";
  }
}

export function requireRequester(request: Request): Requester {
  const name = request.headers.get("x-requester-name")?.trim() ?? "";
  if (!name || name.length > 80 || /[\u0000-\u001f]/.test(name)) {
    throw new RequestError(
      "Add your name before starting an agent. This check stands in for your SSO layer and runs before any agent is created.",
    );
  }
  const id =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "requester";
  return { id, name };
}

export function parseTags(input: unknown): string[] {
  if (input == null || input === "") return [];
  const raw = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(",")
      : null;
  if (!raw) throw new RequestError("Tags must be a comma-separated list.");
  const tags = raw.map((tag) => String(tag).trim()).filter(Boolean);
  if (tags.length > 8) throw new RequestError("Use up to 8 tags.");
  for (const tag of tags) {
    if (tag.length > 32) throw new RequestError("Each tag must be 32 characters or fewer.");
  }
  return tags;
}

export function parsePrompt(input: unknown): string {
  if (typeof input !== "string" || !input.trim()) {
    throw new RequestError("Describe the app you want built.");
  }
  const prompt = input.trim();
  if (prompt.length > 8000) throw new RequestError("Keep the prompt under 8,000 characters.");
  return prompt;
}

export function titleFromPrompt(prompt: string): string {
  const line = prompt.split("\n")[0]?.trim() || "New app";
  const stripped = line
    .replace(/^(please\s+)?(build|create|make|give)\s+(me\s+)?(an?\s+|the\s+)?/i, "")
    .replace(/[.]+$/g, "");
  const clause = stripped.split(/[,:;]/)[0]?.trim() || stripped;
  const sliced = clause.slice(0, 72).trim();
  return sliced.charAt(0).toUpperCase() + sliced.slice(1);
}

/** FAST_PATH_CACHE (default on): show a cached briefing while a live Permian example build runs. */
export function fastPathCache(): boolean {
  return !/^(0|false|off|no)$/i.test(process.env.FAST_PATH_CACHE?.trim() ?? "");
}

/** DEMO_SPEED=4 plays the simulated build four times faster. Defaults to real-time (about 40 seconds). */
export function demoSpeed(): number {
  const value = Number(process.env.DEMO_SPEED);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 50) : 1;
}

export function studioUser(): { name: string; role: string; initials: string } {
  const name = process.env.STUDIO_USER_NAME?.trim() || "Jordan Stein";
  const role = process.env.STUDIO_USER_ROLE?.trim() || "Field Engineer";
  const initials =
    name
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "OX";
  return { name, role, initials };
}

export function environmentLabel(): string {
  return process.env.STUDIO_ENVIRONMENT?.trim() || (isDemoMode() ? "ConocoPhillips Digital · Demo" : "ConocoPhillips Digital · Live");
}
