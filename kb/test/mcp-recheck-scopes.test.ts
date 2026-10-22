import { expect, test } from "vitest";
import type { DB } from "../src/db.js";
import type { RecheckScope } from "../src/coverage.js";
import { createToolHandlers } from "../src/mcp-server.js";

const capturedAt = "2026-09-01T00:00:00.000Z";

const rows = ["a", "b", "c"].map((installId) => ({
  kind: "npc_sighting", positionKind: "npc", installId, npcId: 42, name: "Hogger",
  mapId: 12, x: 40, y: 20, capturedAt,
}));

const call = (recheck?: readonly RecheckScope[]) => createToolHandlers({} as DB, {
  corpus: async () => ({ records: rows, dataAsOf: capturedAt }),
  recheck,
}).npc_page({ npcId: 42 });

test("page tools count only reports after a recheck scope's date, as the coverage score does", async () => {
  const scoped = await call([{ since: "2026-09-15T00:00:00.000Z", source: "blue-post test", ids: [42] }]);
  const text = typeof scoped === "string" ? scoped : scoped.text;
  expect(text).toContain("No agreed name");
  expect(text).not.toContain("Hogger");
});

test("without scopes the same reports still agree, so the scope is the only difference", async () => {
  const unscoped = await call();
  const text = typeof unscoped === "string" ? unscoped : unscoped.text;
  expect(text).toContain("Hogger");
});

const objects = ["a", "b", "c"].map((installId) => ({
  kind: "object_sighting", installId, objectId: 77, name: "Copper Vein",
  mapId: 12, x: 40, y: 20, capturedAt,
}));

const callObject = (recheck?: readonly RecheckScope[]) => createToolHandlers({} as DB, {
  corpus: async () => ({ records: objects, dataAsOf: capturedAt }),
  recheck,
}).object_page({ objectId: 77 });

test("the object page cuts its names and pins by the same scope", async () => {
  const scoped = await callObject([{ since: "2026-09-15T00:00:00.000Z", source: "blue-post test", ids: [77] }]);
  const scopedText = typeof scoped === "string" ? scoped : scoped.text;
  expect(scopedText).toContain("No agreed name yet");
  expect(scopedText).not.toContain("Copper Vein");
  expect(scopedText).not.toContain("Seen on the minimap");

  const unscoped = await callObject();
  const unscopedText = typeof unscoped === "string" ? unscoped : unscoped.text;
  expect(unscopedText).toContain("Copper Vein");
  expect(unscopedText).toContain("Seen on the minimap");
});
