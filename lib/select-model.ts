import type { ModelSelection, SDKModel } from "@cursor/sdk";

/**
 * Pick a model from the live catalog returned by Cursor.models.list().
 * Ids that are not in that list are never returned.
 */
export function selectModel(models: SDKModel[], requestedId?: string): ModelSelection {
  if (models.length === 0) {
    throw new Error("Cursor.models.list() returned no models for this API key.");
  }

  const requested = requestedId?.trim();
  const chosen = requested
    ? models.find((model) => model.id === requested || model.aliases?.includes(requested))
    : undefined;

  if (requested && !chosen) {
    throw new Error(
      `Model "${requested}" is not in Cursor.models.list(). Available: ${models.map((model) => model.id).join(", ")}`,
    );
  }

  const model = chosen ?? preferCatalogModel(models);
  return selectionFor(model);
}

export function preferCatalogModel(models: SDKModel[]): SDKModel {
  return (
    models.find((model) => model.id === "composer-2.5") ??
    models.find((model) => model.id === "auto-smart") ??
    models[0]
  );
}

function selectionFor(model: SDKModel): ModelSelection {
  if (model.id !== "auto-smart") return { id: model.id };

  const parameter = model.parameters?.find((item) => item.id === "optimize_for");
  const value =
    parameter?.values.find((item) => item.value === "balanced")?.value ??
    parameter?.values[0]?.value;

  if (!parameter || !value) {
    throw new Error(
      "Cursor Router (auto-smart) is in the catalog without an optimize_for value. Pick another model from Cursor.models.list().",
    );
  }

  return { id: model.id, params: [{ id: parameter.id, value }] };
}
