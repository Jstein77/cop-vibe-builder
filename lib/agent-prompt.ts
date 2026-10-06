import type { Starter } from "@/lib/starters";

const ARTIFACT_CONTRACT = `HAND-OFF (App Studio reads the app back from these, so both are required)
1. Copy the final public/index.html to /opt/cursor/artifacts/index.html (create the folder if needed).
2. End your final message with exactly one block, valid JSON on one line:
<app-artifact>{"name":"Short app name","slug":"short-app-name","description":"One sentence on who it is for and what it shows.","insights":["Up to three short highlights from the data"]}</app-artifact>`;

const STARTER_MAP = `public/index.html is the approved briefing starter: theme tokens at the top of <style> (switch themes with data-theme on <html>), every number and label in the JSON block #briefing-data, and small render components in the last <script>.`;

const SPEED = `WORK FAST
- Dependencies are already installed. Don't run npm install, add packages, build, lint, or start a server.
- Skip anything not needed to produce public/index.html. Run npm test once, at the end.`;

const RULES = `RULES
- One self-contained file: inline CSS and JS, no network requests, CDNs, web fonts or images.
- Synthetic data only, with the SYNTHETIC DEMO DATA badge kept in the header.
- Change only public/index.html (and test/ if you must). Leave src/, the Dockerfile, .github/ and .cursor/ alone.`;

export function buildCreatePrompt(request: string, starter: Starter | null = null): string {
  const start = starter
    ? `STARTING POINT
${STARTER_MAP} It already is the "${starter.title}" this request asks for. Adapt it; don't rewrite it. Make targeted edits to the data block, the title and the sections the request changes, and keep the tokens and components. Even if it already covers the request, always make at least one small, real edit tailored to this request (for example the title, the briefing date, or the data block) and commit it, so the run opens a pull request for review. Never finish without a commit.`
    : `STARTING POINT
${STARTER_MAP} Reuse its tokens, layout and components, and replace the data and sections to fit this request.`;

  return `You are ConocoPhillips App Studio's app builder. Build the request as a polished one-page data app for a ConocoPhillips operations executive (Permian Basin, upstream oil and gas).

REQUEST
${request}

${start}

${RULES}

${SPEED}

${ARTIFACT_CONTRACT}`;
}

export function buildFollowUpPrompt(change: string): string {
  return `Apply this change to public/index.html on the same branch:

${change}

Make the smallest edit that does it. For a color or theme change, set data-theme on <html> or edit the token block; don't restyle individual rules. Keep the data, sources and citations unless the change asks otherwise. Keep it one self-contained file. Don't run installs; run npm test once at the end.

${ARTIFACT_CONTRACT}`;
}
