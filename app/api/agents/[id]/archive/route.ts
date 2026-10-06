import { RequestError, requireRequester } from "@/lib/config";
import { setArchived } from "@/lib/launch";
import { formatSdkError } from "@/lib/sdk-error";
import { getStoredRequest } from "@/lib/store";
import { summarize } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    requireRequester(request);
    const existing = await getStoredRequest(id);
    if (!existing) return Response.json({ error: "No request with that id." }, { status: 404 });
    const body = (await request.json()) as { archived?: unknown };
    if (typeof body.archived !== "boolean") {
      throw new RequestError("Pass archived: true or false.");
    }
    const updated = await setArchived(id, body.archived, existing.demo);
    return Response.json({ request: summarize(updated) });
  } catch (error) {
    if (error instanceof RequestError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    const formatted = formatSdkError(error);
    return Response.json({ error: formatted.message, helpUrl: formatted.helpUrl }, { status: 502 });
  }
}
