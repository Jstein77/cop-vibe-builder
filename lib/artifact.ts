export type ArtifactMeta = {
  name?: string;
  slug?: string;
  description?: string;
  insights?: string[];
};

const META_BLOCK = /<app-artifact>\s*([\s\S]*?)\s*<\/app-artifact>/i;

export function slugify(value: string, max = 42): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, max)
    .replace(/-$/, "");
}

export function isValidDeploymentName(value: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,50}[a-z0-9])?$/.test(value);
}

/** Reads the `<app-artifact>{json}</app-artifact>` block the agent ends its final message with. */
export function parseArtifactMeta(text: string | undefined): ArtifactMeta {
  if (!text) return {};
  const match = text.match(META_BLOCK);
  if (!match) return {};
  try {
    const raw = JSON.parse(match[1]) as Record<string, unknown>;
    return {
      name: typeof raw.name === "string" ? raw.name.slice(0, 80) : undefined,
      slug: typeof raw.slug === "string" ? slugify(raw.slug) || undefined : undefined,
      description: typeof raw.description === "string" ? raw.description.slice(0, 240) : undefined,
      insights: Array.isArray(raw.insights) ? raw.insights.slice(0, 5).map((item) => String(item).slice(0, 160)) : undefined,
    };
  } catch {
    return {};
  }
}

export function stripArtifactMeta(text: string): string {
  return text.replace(META_BLOCK, "").trim();
}

export function looksLikeHtmlDocument(html: string): boolean {
  return /<html[\s>]/i.test(html) && /<\/html>/i.test(html);
}

/** `https://github.com/org/repo` + branch -> GitHub contents API URL for public/index.html. */
export function githubContentsUrl(repoUrl: string, branch: string, filePath = "public/index.html"): string | null {
  let parsed: URL;
  try {
    parsed = new URL(repoUrl);
  } catch {
    return null;
  }
  if (parsed.hostname !== "github.com") return null;
  const [owner, repo] = parsed.pathname.replace(/^\/|\.git$/g, "").split("/");
  if (!owner || !repo) return null;
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
}
