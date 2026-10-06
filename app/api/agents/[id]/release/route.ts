import { RequestError, requireRequester } from "@/lib/config";
import { pollRelease, simulateMerge } from "@/lib/release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(error: unknown): Response {
  if (error instanceof RequestError) return Response.json({ error: error.message }, { status: error.status });
  return Response.json({ error: error instanceof Error ? error.message : "Could not read the release." }, { status: 502 });
}

/** Current deployment, plus the pull request's state while the release waits for a merge. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    return Response.json(await pollRelease(id));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    requireRequester(request);
    const body = (await request.json().catch(() => ({}))) as { action?: unknown };
    if (body.action !== "simulate-merge") throw new RequestError("Unknown release action.");
    return Response.json(await simulateMerge(id));
  } catch (error) {
    return failure(error);
  }
}
