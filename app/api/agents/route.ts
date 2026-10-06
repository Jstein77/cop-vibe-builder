import { isDemoMode } from "@/lib/config";
import { listVisibleRequests } from "@/lib/catalog";
import { formatSdkError } from "@/lib/sdk-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const requests = await listVisibleRequests();
    return Response.json({ demo: isDemoMode(), requests });
  } catch (error) {
    const formatted = formatSdkError(error);
    return Response.json({ error: formatted.message, helpUrl: formatted.helpUrl }, { status: 502 });
  }
}
