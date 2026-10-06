import { RequestError, isDemoMode, parsePrompt, parseTags, requireRequester } from "@/lib/config";
import { launchCreate } from "@/lib/launch";
import { getStoredRequest } from "@/lib/store";
import { summarize } from "@/lib/types";
import { formatSdkError } from "@/lib/sdk-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const requester = requireRequester(request);
    const body = (await request.json()) as { prompt?: unknown; tags?: unknown; modelId?: unknown };
    const prompt = parsePrompt(body.prompt);
    const tags = parseTags(body.tags);
    const modelId = typeof body.modelId === "string" ? body.modelId : undefined;
    const created = await launchCreate({ prompt, requester, tags, modelId });
    const fresh = await getStoredRequest(created.agentId);
    return Response.json({
      demo: isDemoMode(),
      request: summarize(fresh ?? created),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown): Response {
  if (error instanceof RequestError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  const formatted = formatSdkError(error);
  const helpUrl = "helpUrl" in (error as object) ? (error as { helpUrl?: string }).helpUrl : formatted.helpUrl;
  return Response.json({ error: formatted.message, helpUrl }, { status: 502 });
}
