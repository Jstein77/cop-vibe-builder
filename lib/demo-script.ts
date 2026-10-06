import { slugify } from "@/lib/artifact";
import { renderBriefing, THEME_LABELS, themeFromPrompt, type BriefingTheme } from "@/lib/briefing";
import type { Artifact, ClientEvent } from "@/lib/types";

type WithoutAt<T> = T extends unknown ? Omit<T, "at"> : never;

export type DemoStep = {
  delayMs: number;
  event: WithoutAt<ClientEvent>;
};

const NAMED_APPS: Array<[RegExp, string]> = [
  [/morning brief/i, "Permian morning briefing"],
  [/well performance/i, "Well performance desk"],
  [/risk cockpit/i, "Operations risk cockpit"],
  [/delivery command/i, "Delivery command center"],
];

export function demoAppName(prompt: string): string {
  for (const [pattern, name] of NAMED_APPS) {
    if (pattern.test(prompt)) return name;
  }
  const first = prompt.split(/[\n:.,;]/)[0]?.trim() || "Generated app";
  const stripped = first.replace(/^(please\s+)?(build|create|make|give)\s+(me\s+)?(an?\s+|the\s+)?/i, "").trim();
  const name = (stripped || first).slice(0, 60);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function demoBranch(name: string): string {
  const suffix = Math.random().toString(36).slice(2, 6);
  return `cursor/${slugify(name, 36) || "app"}-${suffix}`;
}

export function demoPullUrl(repoUrl: string): string {
  const number = 120 + Math.floor(Math.random() * 60);
  return `${repoUrl.replace(/\/$/, "")}/pull/${number}`;
}

/**
 * Replays every prompt on the request so a follow-up builds on earlier ones:
 * "make it blue" then "add a note" keeps the blue palette.
 */
export function demoArtifact(prompts: string[], version: number, asOf = new Date()): { artifact: Artifact; theme: BriefingTheme; lastNote?: string } {
  const [first, ...followUps] = prompts;
  const name = demoAppName(first ?? "Permian morning briefing");
  let theme: BriefingTheme = "slate";
  const notes: string[] = [];
  let lastNote: string | undefined;
  let lastThemeChange = false;
  for (const prompt of followUps) {
    const detected = themeFromPrompt(prompt);
    if (detected) {
      theme = detected;
      lastThemeChange = true;
      lastNote = undefined;
    } else {
      notes.push(prompt.trim().slice(0, 160));
      lastThemeChange = false;
      lastNote = prompt.trim();
    }
  }

  const html = renderBriefing({ title: name, theme, notes, asOf, build: `v${version}` });
  let description = "A two-minute read for the VP, Permian Operations: production against plan, deferred volume, safety, and the decisions that need an owner today.";
  let insights = [
    "CS-14 compressor trip is the top decision: $0.62M per day exposure, decide by 11:00",
    "Delaware Basin NM is running 7.9 pts below plan; the other basins are within 5 pts",
    "ServiceNow is 21 minutes stale and is flagged as degraded in the app",
  ];
  if (followUps.length && lastThemeChange) {
    description = `Restyled with the ${THEME_LABELS[theme]} palette. Layout, data and citations are unchanged.`;
    insights = [
      `Header, accents, filters and charts now use the ${THEME_LABELS[theme]} palette`,
      "Severity colors stay red and amber so risk still reads at a glance",
      "Smoke check passed on the updated public/index.html",
    ];
  } else if (followUps.length && lastNote) {
    description = `Applied the change: "${lastNote.slice(0, 120)}".`;
    insights = ["The change is called out at the top of the briefing", "Data, sources and citations are unchanged", "Smoke check passed on the updated public/index.html"];
  }

  return {
    theme,
    lastNote,
    artifact: { name, slug: slugify(name), description, insights, html, version },
  };
}

export function demoTimeline(options: {
  kind: "create" | "followup";
  prompt: string;
  repoUrl: string;
  branch: string;
  prUrl: string;
  artifact: Artifact;
}): DemoStep[] {
  return options.kind === "create" ? createTimeline(options) : followUpTimeline(options);
}

function createTimeline({ repoUrl, branch, prUrl, artifact }: { repoUrl: string; branch: string; prUrl: string; artifact: Artifact }): DemoStep[] {
  return [
    { delayMs: 700, event: { type: "status", status: "CREATING", message: "Starting a cloud agent on the ConocoPhillips app template" } },
    { delayMs: 1600, event: { type: "status", status: "RUNNING", message: "Cloning the template and reading the house rules" } },
    {
      delayMs: 1400,
      event: {
        type: "thinking",
        text: "The reader is the VP of Permian Operations at 06:00. Lead with production against plan and the decisions that need an owner today, then site exceptions. Keep it to one screen.",
      },
    },
    { delayMs: 1300, event: { type: "phase", step: 1, message: "Cloud agent connected · grounding 4 sources" } },
    { delayMs: 900, event: { type: "tool", callId: "rules", name: "Read", status: "running", detail: ".cursor/rules/house-rules.mdc" } },
    { delayMs: 1400, event: { type: "tool", callId: "rules", name: "Read", status: "completed", detail: ".cursor/rules/house-rules.mdc" } },
    { delayMs: 300, event: { type: "tool", callId: "dbx", name: "MCP", status: "running", detail: "Databricks · prod_upstream.gold.daily_well_production" } },
    { delayMs: 2300, event: { type: "tool", callId: "dbx", name: "MCP", status: "completed", detail: "Databricks · 1,184 wells · prior 24 hours" } },
    { delayMs: 300, event: { type: "tool", callId: "glean", name: "MCP", status: "running", detail: "Glean · Permian standing instructions and H2S standard" } },
    { delayMs: 2000, event: { type: "tool", callId: "glean", name: "MCP", status: "completed", detail: "Glean · 6 documents" } },
    { delayMs: 300, event: { type: "tool", callId: "snow", name: "MCP", status: "running", detail: "ServiceNow · open incidents and work orders, Permian assets" } },
    { delayMs: 1900, event: { type: "tool", callId: "snow", name: "MCP", status: "completed", detail: "ServiceNow · 212 work orders (21 min stale)" } },
    { delayMs: 300, event: { type: "tool", callId: "gh", name: "MCP", status: "running", detail: "GitHub · release workflow and CODEOWNERS" } },
    { delayMs: 1500, event: { type: "tool", callId: "gh", name: "MCP", status: "completed", detail: "GitHub · deploy.yml" } },
    { delayMs: 600, event: { type: "phase", step: 2, message: "Designing the information hierarchy and interactions" } },
    {
      delayMs: 1200,
      event: {
        type: "assistant",
        text: "Building a single-page briefing: source health, six KPIs with 24-hour trends, decisions needed today with confidence and citations, and site exceptions against plan.",
      },
    },
    { delayMs: 900, event: { type: "tool", callId: "write", name: "Write", status: "running", detail: "public/index.html" } },
    { delayMs: 9500, event: { type: "tool", callId: "write", name: "Write", status: "completed", detail: "public/index.html" } },
    { delayMs: 300, event: { type: "tool", callId: "edit", name: "Edit", status: "running", detail: "public/index.html · decision filters and citations" } },
    { delayMs: 3200, event: { type: "tool", callId: "edit", name: "Edit", status: "completed", detail: "public/index.html" } },
    { delayMs: 500, event: { type: "artifact", artifact } },
    { delayMs: 400, event: { type: "phase", step: 3, message: "Validating the generated artifact" } },
    { delayMs: 700, event: { type: "tool", callId: "test-file", name: "Write", status: "running", detail: "test/app.test.js" } },
    { delayMs: 1300, event: { type: "tool", callId: "test-file", name: "Write", status: "completed", detail: "test/app.test.js" } },
    { delayMs: 300, event: { type: "tool", callId: "test", name: "Shell", status: "running", detail: "npm test" } },
    { delayMs: 3200, event: { type: "tool", callId: "test", name: "Shell", status: "completed", detail: "npm test · exit 0" } },
    {
      delayMs: 600,
      event: {
        type: "result",
        status: "finished",
        repoUrl,
        branch,
        prUrl,
        text: "The briefing is on its own branch with a pull request open. GitHub Actions runs the tests and posts a preview URL; nothing ships until someone approves.",
      },
    },
    { delayMs: 300, event: { type: "phase", step: 4, message: "App generated from grounded demo data" } },
    { delayMs: 1200, event: { type: "cost", chargedCents: 31, totalTokens: 48210 } },
  ];
}

function followUpTimeline({ repoUrl, branch, prUrl, artifact, prompt }: { repoUrl: string; branch: string; prUrl: string; artifact: Artifact; prompt: string }): DemoStep[] {
  const theme = themeFromPrompt(prompt);
  const detail = theme ? `public/index.html · ${THEME_LABELS[theme]} palette` : "public/index.html";
  return [
    { delayMs: 600, event: { type: "status", status: "RUNNING", message: "Resuming the same cloud agent" } },
    {
      delayMs: 1200,
      event: {
        type: "thinking",
        text: theme
          ? `Swap the brand palette to ${THEME_LABELS[theme]} through the CSS variables. Keep severity colors so risk still reads correctly.`
          : "Apply the change in place on the same branch, keep the data and citations, and re-run the smoke check.",
      },
    },
    { delayMs: 900, event: { type: "phase", step: 1, message: "Updating the experience" } },
    { delayMs: 500, event: { type: "tool", callId: "edit-2", name: "Edit", status: "running", detail } },
    { delayMs: 3600, event: { type: "tool", callId: "edit-2", name: "Edit", status: "completed", detail: "public/index.html" } },
    { delayMs: 400, event: { type: "artifact", artifact } },
    { delayMs: 400, event: { type: "phase", step: 2, message: "Validating the generated artifact" } },
    { delayMs: 300, event: { type: "tool", callId: "retest", name: "Shell", status: "running", detail: "npm test" } },
    { delayMs: 2400, event: { type: "tool", callId: "retest", name: "Shell", status: "completed", detail: "npm test · exit 0" } },
    {
      delayMs: 500,
      event: {
        type: "result",
        status: "finished",
        repoUrl,
        branch,
        prUrl,
        text: "Pushed another commit to the same branch. The pull request and its preview update after GitHub Actions finishes.",
      },
    },
    { delayMs: 300, event: { type: "phase", step: 3, message: "App updated from grounded demo data" } },
    { delayMs: 900, event: { type: "cost", chargedCents: 39, totalTokens: 61480 } },
  ];
}

export function timelineDuration(steps: DemoStep[]): number {
  return steps.reduce((total, step) => total + step.delayMs, 0);
}
