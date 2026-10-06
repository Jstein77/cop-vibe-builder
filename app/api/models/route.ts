import { getApiKey, isDemoMode } from "@/lib/config";
import { formatSdkError } from "@/lib/sdk-error";
import { selectModel } from "@/lib/select-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (isDemoMode()) {
    return Response.json({
      demo: true,
      models: [
        {
          id: "demo",
          displayName: "Demo model",
          description: "Simulated catalog. With a real key, this list comes from Cursor.models.list().",
        },
      ],
      defaultModelId: "demo",
    });
  }

  try {
    const sdk = await import("@cursor/sdk");
    const models = await sdk.Cursor.models.list({ apiKey: getApiKey() });
    const selection = selectModel(models);
    return Response.json({
      demo: false,
      models: models.map((model) => ({
        id: model.id,
        displayName: model.displayName,
        description: model.description,
      })),
      defaultModelId: selection.id,
    });
  } catch (error) {
    const formatted = formatSdkError(error);
    return Response.json({ error: formatted.message, helpUrl: formatted.helpUrl }, { status: 502 });
  }
}
