import { execFile } from "node:child_process";

import type { PrCheckSummary, PrStatus } from "@/lib/types";

export class PrReadError extends Error {}

export type PullRef = { owner: string; repo: string; number: number };

export function parsePullUrl(url: string | undefined): PullRef | null {
  if (!url) return null;
  const match = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  return match ? { owner: match[1], repo: match[2], number: Number(match[3]) } : null;
}

type GitHubPull = {
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  draft?: boolean;
  merged?: boolean;
  merged_at?: string | null;
  merged_by?: { login?: string } | null;
  merge_commit_sha?: string | null;
  head?: { sha?: string };
};
type GitHubReview = { user?: { login?: string } | null; state: string };
type GitHubCheckRuns = { check_runs?: Array<{ status: string; conclusion: string | null }> };
type GitHubStatus = { statuses?: Array<{ state: string }> };

const GH_CANDIDATES = ["gh", "/opt/homebrew/bin/gh", "/usr/local/bin/gh", "/usr/bin/gh"];

function runGh(binary: string, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(binary, ["api", "-H", "Accept: application/vnd.github+json", path], { timeout: 10_000, maxBuffer: 4_000_000 }, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stderr: String(stderr) }));
      else resolve(stdout);
    });
  });
}

async function viaGh(path: string): Promise<unknown> {
  let lastMissing = false;
  for (const binary of GH_CANDIDATES) {
    try {
      return JSON.parse(await runGh(binary, path));
    } catch (error) {
      const failure = error as NodeJS.ErrnoException & { stderr?: string };
      if (failure.code === "ENOENT") {
        lastMissing = true;
        continue;
      }
      const detail = (failure.stderr || failure.message || "").trim().split("\n")[0];
      if (/auth login|not logged in|authentication/i.test(detail)) {
        throw new PrReadError("The GitHub CLI is not signed in on the server. Run `gh auth login` or set GITHUB_TOKEN.");
      }
      if (/HTTP 404|Not Found/i.test(detail)) {
        throw new PrReadError("GitHub returned 404. The signed-in GitHub CLI account cannot see this repository.");
      }
      throw new PrReadError(`GitHub CLI: ${detail || "request failed"}`);
    }
  }
  throw new PrReadError(
    lastMissing ? "GITHUB_TOKEN is not set and the GitHub CLI (gh) was not found on the server." : "Could not reach GitHub.",
  );
}

async function viaToken(token: string, path: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`https://api.github.com/${path}`, {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new PrReadError(`Could not reach GitHub: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (response.status === 401) throw new PrReadError("GITHUB_TOKEN was rejected by GitHub (401).");
  if (response.status === 403 || response.status === 404) {
    throw new PrReadError(`GitHub returned ${response.status}. GITHUB_TOKEN needs read access to this private repository.`);
  }
  if (!response.ok) throw new PrReadError(`GitHub returned ${response.status}.`);
  return response.json();
}

function api(path: string): Promise<unknown> {
  const token = process.env.GITHUB_TOKEN?.trim();
  return token ? viaToken(token, path) : viaGh(path);
}

function summarizeChecks(runs: GitHubCheckRuns | null, statuses: GitHubStatus | null): PrCheckSummary {
  const summary: PrCheckSummary = { total: 0, passed: 0, failed: 0, pending: 0 };
  for (const run of runs?.check_runs ?? []) {
    summary.total += 1;
    if (run.status !== "completed") summary.pending += 1;
    else if (["success", "neutral", "skipped"].includes(run.conclusion ?? "")) summary.passed += 1;
    else summary.failed += 1;
  }
  for (const status of statuses?.statuses ?? []) {
    summary.total += 1;
    if (status.state === "pending") summary.pending += 1;
    else if (status.state === "success") summary.passed += 1;
    else summary.failed += 1;
  }
  return summary;
}

function summarizeReviews(reviews: GitHubReview[]): Pick<PrStatus, "review" | "approvers"> {
  const latest = new Map<string, string>();
  for (const review of reviews) {
    const login = review.user?.login;
    if (!login || review.state === "COMMENTED" || review.state === "PENDING") continue;
    latest.set(login, review.state);
  }
  const states = [...latest.entries()];
  if (states.some(([, state]) => state === "CHANGES_REQUESTED")) return { review: "changes-requested", approvers: [] };
  const approvers = states.filter(([, state]) => state === "APPROVED").map(([login]) => login);
  return { review: approvers.length ? "approved" : "pending", approvers };
}

async function readFromGitHub(ref: PullRef, url: string): Promise<PrStatus> {
  const base = `repos/${ref.owner}/${ref.repo}`;
  const pull = (await api(`${base}/pulls/${ref.number}`)) as GitHubPull;
  const headSha = pull.head?.sha;
  const [reviews, runs, statuses] = await Promise.all([
    (api(`${base}/pulls/${ref.number}/reviews?per_page=100`) as Promise<GitHubReview[]>).catch(() => [] as GitHubReview[]),
    headSha ? (api(`${base}/commits/${headSha}/check-runs?per_page=100`) as Promise<GitHubCheckRuns>).catch(() => null) : null,
    headSha ? (api(`${base}/commits/${headSha}/status`) as Promise<GitHubStatus>).catch(() => null) : null,
  ]);
  const merged = Boolean(pull.merged || pull.merged_at);
  return {
    number: pull.number,
    title: pull.title,
    url: pull.html_url || url,
    state: merged ? "merged" : pull.state,
    draft: Boolean(pull.draft),
    mergedBy: pull.merged_by?.login || undefined,
    mergedAt: pull.merged_at || undefined,
    mergeSha: merged ? pull.merge_commit_sha || undefined : undefined,
    headSha,
    checks: summarizeChecks(runs, statuses),
    ...summarizeReviews(Array.isArray(reviews) ? reviews : []),
    source: process.env.GITHUB_TOKEN?.trim() ? "token" : "gh",
  };
}

/**
 * PR_WATCH_MOCK rehearses the watcher without GitHub:
 * "open", "merged", "error", or "merge-after-<seconds>" (approved halfway, merged at the end).
 */
function readMock(mode: string, ref: PullRef, url: string, since: number): PrStatus {
  if (mode === "error") throw new PrReadError("GitHub returned 404. GITHUB_TOKEN needs read access to this private repository.");
  const after = mode.match(/^merge-after-(\d+)$/);
  const elapsed = (Date.now() - since) / 1000;
  const merged = mode === "merged" || (after ? elapsed >= Number(after[1]) : false);
  const approved = merged || (after ? elapsed >= Number(after[1]) / 2 : false);
  return {
    number: ref.number,
    title: "Add the generated app",
    url,
    state: merged ? "merged" : "open",
    draft: false,
    mergedBy: merged ? "jstein77" : undefined,
    mergedAt: merged ? new Date().toISOString() : undefined,
    checks: { total: 0, passed: 0, failed: 0, pending: 0 },
    review: approved ? "approved" : "pending",
    approvers: approved ? ["cop-platform-reviewer"] : [],
    source: "mock",
  };
}

const cache = new Map<string, { at: number; value: Promise<PrStatus> }>();

export async function readPullRequest(url: string, options: { since: number }): Promise<PrStatus> {
  const ref = parsePullUrl(url);
  if (!ref) throw new PrReadError(`Not a GitHub pull request URL: ${url}`);
  const mock = process.env.PR_WATCH_MOCK?.trim();
  if (mock) return readMock(mock, ref, url, options.since);

  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < 3_000) return hit.value;
  const value = readFromGitHub(ref, url);
  cache.set(url, { at: Date.now(), value });
  value.catch(() => cache.delete(url));
  return value;
}
