import { RequestError, parsePrompt, requireRequester } from "@/lib/config";
import { launchFollowUp } from "@/lib/launch";
import { formatSdkError } from "@/lib/sdk-error";
import { getStoredRequest } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const requester = requireRequester(request);
    const existing = await getStoredRequest(id);
    if (!existing) return Response.json({ error: "No request with that id." }, { status: 404 });
    if (existing.archived) {
      return Response.json(
        { error: "Unarchive this agent before sending a follow-up. Archived transcripts stay readable." },
        { status: 409 },
      );
    }
    if (existing.status === "running") {
      return Response.json(
        { error: "This agent is still working. Wait for it to finish, then send the follow-up." },
        { status: 409 },
      );
    }

    const body = (await request.json()) as { prompt?: unknown };
    const prompt = parsePrompt(body.prompt);
    const after = existing.events.length;
    await launchFollowUp({
      agentId: id,
      prompt,
      requester,
      repoUrl: existing.repoUrl,
      branch: existing.branch,
      prUrl: existing.prUrl,
      demo: existing.demo,
    });
    return Response.json({ agentId: id, after });
  } catch (error) {
    if (error instanceof RequestError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    const formatted = formatSdkError(error);
    return Response.json({ error: formatted.message, helpUrl: formatted.helpUrl }, { status: 502 });
  }
}
