import { requireRequester, RequestError } from "@/lib/config";
import { cancelAgent } from "@/lib/launch";
import { formatSdkError } from "@/lib/sdk-error";
import { getStoredRequest } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    requireRequester(request);
    const existing = await getStoredRequest(id);
    if (!existing) return Response.json({ error: "No request with that id." }, { status: 404 });
    await cancelAgent(id, existing.demo);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof RequestError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    const formatted = formatSdkError(error);
    return Response.json({ error: formatted.message, helpUrl: formatted.helpUrl }, { status: 502 });
  }
}
