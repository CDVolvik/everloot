import { expect, test } from "vitest";
import type { DB } from "../src/db.js";
import type { RecheckScope } from "../src/coverage.js";
import { answerSources, answerSourcesFactsFromRecords } from "../src/answer-sources.js";
import { nearResult, type NearFacts } from "../src/world-map-near.js";
import type { WorldMapData } from "../src/world-map-data.js";
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

const entrances = ["a", "b", "c"].map((installId) => ({
  kind: "instance_entrance", installId, instanceMapId: 100, name: "The Test Dungeon",
  instanceType: "party", mapId: 1411, x: 50, y: 50, capturedAt,
}));

const map = {
  zones: [{ uiMapId: 1411, name: "Test Zone", continentId: 1, bounds: { left: 0, top: 0, right: 1000, bottom: 1000 } }],
  heldBackZones: [],
  entrances: [{ mapId: 100, name: "The Test Dungeon", raid: false, continentId: 1, worldX: 500, worldY: 500 }],
} as unknown as WorldMapData;

const callNear = (recheck?: readonly RecheckScope[]) => nearResult(
  { zone: "Test Zone", x: 50, y: 50, radius: 100 }, map,
  { npcs: [], vendors: [], recheck, entrances } as NearFacts,
);

test("world_map_near drops entrance confirmations the scope withholds", () => {
  const scoped = callNear([{ since: "2026-09-15T00:00:00.000Z", source: "blue-post test", ids: [100] }]);
  expect(scoped.ok).toBe(true);
  if (scoped.ok) expect(scoped.entrances[0]?.confirmed).toBeUndefined();

  const unscoped = callNear();
  expect(unscoped.ok).toBe(true);
  if (unscoped.ok) expect(unscoped.entrances[0]?.confirmed).toBe(3);
});

const answer = (recheck?: readonly RecheckScope[]) => answerSources(
  { prepare: () => ({ all: () => [] }) } as unknown as DB,
  { question: "Where is Hogger?", limit: 5 },
  answerSourcesFactsFromRecords(rows, recheck ?? []),
  capturedAt,
).evidence;

test("answer_sources does not cite an NPC name the scope withholds", () => {
  expect(answer([{ since: "2026-09-15T00:00:00.000Z", source: "blue-post test", ids: [42] }]).some((e) => e.claim.includes("Hogger"))).toBe(false);
  expect(answer().some((e) => e.claim.includes("Hogger"))).toBe(true);
});

const callRelations = (recheck?: readonly RecheckScope[]) => createToolHandlers({} as DB, {
  corpus: async () => ({ records: rows, dataAsOf: capturedAt }),
  recheck,
}).entity_relations({ kind: "npc", id: 42, direction: "both", limit: 20 });

test("entity relations cut the destination facts the same scope withholds", async () => {
  const scoped = await callRelations([{ since: "2026-09-15T00:00:00.000Z", source: "blue-post test", ids: [42] }]);
  const text = typeof scoped === "string" ? scoped : scoped.text;
  expect(text).not.toContain("Located in");
  expect(text).not.toContain("zone 12");

  const unscoped = await callRelations();
  const unscopedText = typeof unscoped === "string" ? unscoped : unscoped.text;
  expect(unscopedText).toContain("Located in: zone 12");
});
