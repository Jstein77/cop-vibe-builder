import { RequestError, requireRequester } from "@/lib/config";
import { deployRequest } from "@/lib/release";
import { formatSdkError } from "@/lib/sdk-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    requireRequester(request);
    const body = (await request.json()) as { deploymentName?: unknown; confirmed?: unknown };
    if (body.confirmed !== true) throw new RequestError("Confirm the production deployment first.");
    if (typeof body.deploymentName !== "string") throw new RequestError("Add a deployment name.");
    const deployment = await deployRequest(id, body.deploymentName.trim());
    return Response.json({ deployment });
  } catch (error) {
    if (error instanceof RequestError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    const formatted = formatSdkError(error);
    return Response.json({ error: formatted.message, helpUrl: formatted.helpUrl }, { status: 502 });
  }
}
