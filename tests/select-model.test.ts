import assert from "node:assert/strict";
import test from "node:test";

import { selectModel } from "../lib/select-model";
import type { SDKModel } from "@cursor/sdk";

function model(partial: Pick<SDKModel, "id"> & Partial<SDKModel>): SDKModel {
  return {
    displayName: partial.id,
    ...partial,
  };
}

test("selectModel uses composer-2.5 only when the catalog includes it", () => {
  const models = [
    model({ id: "auto-smart", parameters: [{ id: "optimize_for", values: [{ value: "balanced" }, { value: "cost" }] }] }),
    model({ id: "composer-2.5", displayName: "Composer 2.5" }),
  ];
  assert.deepEqual(selectModel(models), { id: "composer-2.5" });
});

test("selectModel falls back to auto-smart with an explicit optimize_for value", () => {
  const models = [
    model({
      id: "auto-smart",
      parameters: [{ id: "optimize_for", values: [{ value: "cost" }, { value: "balanced" }] }],
    }),
  ];
  assert.deepEqual(selectModel(models), {
    id: "auto-smart",
    params: [{ id: "optimize_for", value: "balanced" }],
  });
});

test("selectModel uses the first catalog model when neither preferred id is present", () => {
  const models = [model({ id: "team-model", displayName: "Team model" })];
  assert.deepEqual(selectModel(models), { id: "team-model" });
});

test("selectModel rejects an id that Cursor.models.list() did not return", () => {
  const models = [model({ id: "composer-2.5" })];
  assert.throws(() => selectModel(models, "not-a-real-model"), /not in Cursor\.models\.list/);
});

test("selectModel honors a requested catalog id", () => {
  const models = [model({ id: "composer-2.5" }), model({ id: "other-model" })];
  assert.deepEqual(selectModel(models, "other-model"), { id: "other-model" });
});
