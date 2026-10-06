import type { SDKAgent } from "@cursor/sdk";

import { githubContentsUrl, looksLikeHtmlDocument } from "@/lib/artifact";

const MAX_BYTES = 600_000;

export type LiveHtml = { html: string; source: "artifact" | "github" };

/**
 * The agent is told to write public/index.html on its branch and to copy the same
 * file to /opt/cursor/artifacts/index.html. The artifact copy needs no GitHub
 * credentials, so it is tried first. The branch read is the fallback, and it uses
 * GITHUB_TOKEN when the template repo is private.
 */
export async function readLiveHtml(options: {
  agent: SDKAgent;
  repoUrl?: string;
  branch?: string;
}): Promise<LiveHtml> {
  const failures: string[] = [];

  try {
    const artifacts = await options.agent.listArtifacts();
    const candidates = artifacts
      .filter((item) => /(^|\/)index\.html$/i.test(item.path) && item.sizeBytes <= MAX_BYTES)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    if (candidates[0]) {
      const html = (await options.agent.downloadArtifact(candidates[0].path)).toString("utf8");
      if (looksLikeHtmlDocument(html)) return { html, source: "artifact" };
      failures.push(`artifact ${candidates[0].path} is not an HTML document`);
    } else {
      failures.push("no index.html artifact");
    }
  } catch (error) {
    failures.push(`artifacts: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (options.repoUrl && options.branch) {
    const url = githubContentsUrl(options.repoUrl, options.branch);
    if (url) {
      try {
        const token = process.env.GITHUB_TOKEN?.trim();
        const response = await fetch(url, {
          headers: {
            Accept: "application/vnd.github.raw+json",
            "X-GitHub-Api-Version": "2022-11-28",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (response.ok) {
          const html = await response.text();
          if (html.length <= MAX_BYTES && looksLikeHtmlDocument(html)) return { html, source: "github" };
          failures.push("branch public/index.html is not a usable HTML document");
        } else {
          failures.push(`GitHub ${response.status} for public/index.html on ${options.branch}`);
        }
      } catch (error) {
        failures.push(`GitHub: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } else {
    failures.push("no branch to read from");
  }

  throw new Error(`The agent finished, but App Studio could not read public/index.html (${failures.join("; ")}).`);
}
