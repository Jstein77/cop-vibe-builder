import { listStoredRequests } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves a generated app full page, by agent id or by its deployment name.
 * The sandbox CSP gives agent-written HTML an opaque origin, so it cannot call
 * this app's API with the viewer's session.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const requests = await listStoredRequests();
  const match =
    requests.find((item) => item.agentId === id) ??
    requests
      .filter((item) => item.deployment?.name === id || item.artifact?.slug === id)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];

  if (!match?.artifact) {
    return new Response("No generated app with that name.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return new Response(match.artifact.html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "sandbox allow-scripts; default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:",
    },
  });
}
