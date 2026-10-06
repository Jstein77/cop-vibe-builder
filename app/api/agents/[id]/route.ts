import { refreshCloudRequest } from "@/lib/catalog";
import { isDemoMode } from "@/lib/config";
import { formatSdkError } from "@/lib/sdk-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const request = await refreshCloudRequest(id);
    if (!request) {
      return Response.json({ error: "No request with that id." }, { status: 404 });
    }
    return Response.json({ demo: isDemoMode(), request });
  } catch (error) {
    const formatted = formatSdkError(error);
    const status = (error as { status?: number }).status ?? 502;
    return Response.json({ error: formatted.message, helpUrl: formatted.helpUrl }, { status });
  }
}
