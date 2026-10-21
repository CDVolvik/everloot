import { describe, expect, test } from "vitest";
import { mergeCorpus, publicRecords } from "../src/corpus.js";
import { itemFactsFromRecords, lootWindowsFromRecords, rollupDrops } from "../src/drop-rollup.js";
import { observedEdges } from "../src/edges.js";
import { confirmedEntrances, instanceBosses, instanceFactsFromRecords } from "../src/instances.js";
import { itemPage } from "../src/item-page.js";
import { objectFactsFromRecords, objectPage } from "../src/object-page.js";
import { pendingForItem, pendingForNpc, pendingLootFromRecords } from "../src/pending-loot.js";
import { npcFactsFromRecords, npcPage, npcTraits, worldFactsFromRecords } from "../src/world-pages.js";

/** Rows of the kinds a Polestar Recorder file now gives, read under the same 3-voter rule as every other row. */

const hex = (c: string) => c.repeat(16);
const ps = (character: string, address: string) => `ps-${hex(character)}-${hex(address)}`;
const at = "2025-10-09T08:53:30.000Z";
const three = [ps("1", "a"), ps("2", "b"), ps("3", "c")];
/** Three Recorder ids that are one voter: three characters uploading from one address. */
const oneVoter = [ps("1", "a"), ps("2", "a"), ps("3", "a")];
const read = (rows: unknown[]) => publicRecords(mergeCorpus(undefined, rows));

const rare = (installId: string, positionKind = "vignette", x = 70.1) => ({
  kind: "npc_sighting", installId, eventId: "ps:1760000000:4:npc_sighting", capturedAt: at,
  npcId: 61, name: "Thuros Lightfingers", mapId: 1429, x, y: 79.2, level: 11, rank: "rare", positionKind,
});
const entrance = (installId: string, x = 42.5) => ({
  kind: "instance_entrance", installId, eventId: "ps:1760000000:5:instance_entrance", capturedAt: at,
  instanceMapId: 36, name: "Deadmines", instanceType: "party", difficulty: 1, mapId: 1436, x, y: 71.6,
});
const encounter = (installId: string, success = true, index = 6) => ({
  kind: "encounter", installId, eventId: `ps:1760000000:${index}:encounter`, capturedAt: at,
  encounterId: 1144, name: "Edwin VanCleef", instanceMapId: 36, difficulty: 1, size: 5, success, npcIds: [639],
});
const chest = (installId: string, x = 30.1) => ({
  kind: "object_sighting", installId, eventId: "ps:1760000000:7:object_sighting", capturedAt: at,
  objectId: 2843, name: "Battered Chest", mapId: 1436, x, y: 50.2,
});
const recorderLoot = (installId: string, index = 8, items = [{ itemId: 5, count: 2 }]) => ({
  kind: "loot", installId, eventId: `ps:1760000000:${index}:loot`, capturedAt: at, sourceNpcId: 61, items,
});

describe("rares seen through a vignette", () => {
  test("pin at 3 voters, not at 2, and three characters on one address are one voter", () => {
    expect(npcPage(61, worldFactsFromRecords(read(three.map((id, i) => rare(id, "vignette", 70 + i / 10))))).pins).toEqual([{ mapId: 1429, x: 70.1, y: 79.2, reporters: 3 }]);
    expect(npcPage(61, worldFactsFromRecords(read(three.slice(0, 2).map((id) => rare(id))))).pins).toEqual([]);
    expect(npcPage(61, worldFactsFromRecords(read(oneVoter.map((id) => rare(id))))).pins).toEqual([]);
  });

  test("a rare seen where the player stood never pins, and its rank still counts", () => {
    const records = read(three.map((id) => rare(id, "player")));
    expect(npcPage(61, worldFactsFromRecords(records)).pins).toEqual([]);
    expect(observedEdges(records, "2026-10-22T00:00:00Z").filter((e) => e.toKind === "zone")).toEqual([]);
    expect(npcTraits(worldFactsFromRecords(records).npcs)).toMatchObject({ level: 11, rank: "rare" });
  });

  test("a vignette position is the NPC's own: it is a zone edge and an item page pin like an NPC position", () => {
    const records = read(three.map((id) => rare(id)));
    expect(observedEdges(records, "2026-10-22T00:00:00Z").some((e) => e.fromId === 61 && e.toKind === "zone")).toBe(true);
    expect(itemFactsFromRecords(records).npcs).toHaveLength(3);
  });
});

describe("instance entrances", () => {
  test("an entrance is confirmed at 3 voters, at the median, with the agreed name and type", () => {
    const rows = instanceFactsFromRecords(read(three.map((id, i) => entrance(id, 42 + i)))).entrances;
    expect(confirmedEntrances(rows)).toEqual([{ instanceMapId: 36, name: "Deadmines", instanceType: "party", mapId: 1436, x: 43, y: 71.6, reporters: 3 }]);
  });

  test("2 voters, or one voter under three ids, confirm nothing", () => {
    expect(confirmedEntrances(instanceFactsFromRecords(read(three.slice(0, 2).map((id) => entrance(id)))).entrances)).toEqual([]);
    expect(confirmedEntrances(instanceFactsFromRecords(read(oneVoter.map((id) => entrance(id)))).entrances)).toEqual([]);
  });

  test("names in another language leave the name unset but keep the place", () => {
    const rows = read([entrance(three[0]!), entrance(three[1]!), { ...entrance(three[2]!), name: "Las Minas de la Muerte" }]);
    expect(confirmedEntrances(instanceFactsFromRecords(rows).entrances)[0]).toMatchObject({ name: null, reporters: 3 });
  });
});

describe("bosses per instance", () => {
  test("a boss is listed at 3 voters with its kills and agreed creature ids; wipes are not kills", () => {
    const rows = read([...three.map((id) => encounter(id)), encounter(three[0]!, false, 9)]);
    expect(instanceBosses(instanceFactsFromRecords(rows).encounters).get(36)).toEqual([
      { encounterId: 1144, name: "Edwin VanCleef", kills: 3, npcIds: [639], reporters: 3 },
    ]);
  });

  test("2 voters, or one voter under three ids, list no boss", () => {
    expect(instanceBosses(instanceFactsFromRecords(read(three.slice(0, 2).map((id) => encounter(id)))).encounters).size).toBe(0);
    expect(instanceBosses(instanceFactsFromRecords(read(oneVoter.map((id) => encounter(id)))).encounters).size).toBe(0);
  });
});

describe("treasures", () => {
  test("an object seen on the minimap pins at 3 voters on its page, with the agreed name", () => {
    const page = objectPage(2843, objectFactsFromRecords(read(three.map((id, i) => chest(id, 30 + i / 10)))));
    expect(page.name).toBe("Battered Chest");
    expect(page.pins).toEqual([{ mapId: 1436, x: 30.1, y: 50.2, reporters: 3 }]);
  });

  test("2 voters, or one voter under three ids, pin nothing", () => {
    expect(objectPage(2843, objectFactsFromRecords(read(three.slice(0, 2).map((id) => chest(id))))).pins).toBeUndefined();
    expect(objectPage(2843, objectFactsFromRecords(read(oneVoter.map((id) => chest(id))))).pins).toBeUndefined();
  });
});

describe("pending loot windows", () => {
  const rows = read([
    ...three.map((id) => recorderLoot(id)),
    recorderLoot(three[0]!, 9, [{ itemId: 5, count: 1 }, { itemId: 6, count: 3 }]),
  ]);

  test("are counted per source and per item, by voter", () => {
    const pending = pendingLootFromRecords(rows);
    expect(pendingForNpc(pending, 61)).toEqual({ windows: 4, reporters: 3 });
    expect(pendingForItem(pending, 5)).toEqual({ windows: 4, reporters: 3 });
    expect(pendingForItem(pending, 6)).toEqual({ windows: 1, reporters: 1 });
    expect(pending.sources.get("npc:61")?.items.get(5)).toMatchObject({ windows: 4, count: 7 });
    // One player's three characters: three windows, one reporter. The same event sent again counts once.
    expect(pendingForNpc(pendingLootFromRecords(read(oneVoter.map((id, i) => recorderLoot(id, 20 + i)))), 61)).toEqual({ windows: 3, reporters: 1 });
    expect(pendingForNpc(pendingLootFromRecords(read(oneVoter.map((id) => recorderLoot(id)))), 61)).toEqual({ windows: 1, reporters: 1 });
  });

  test("never reach the rates, even from 3 voters, and show on the NPC and item pages", () => {
    expect(lootWindowsFromRecords(rows)).toEqual([]);
    expect(rollupDrops(lootWindowsFromRecords(rows)).rates).toEqual([]);
    const items = itemFactsFromRecords(rows);
    expect(items.rates).toEqual([]);
    expect(itemPage(5, items)).toMatchObject({ drops: [], pendingLoot: { windows: 4, reporters: 3 } });
    expect(npcPage(61, npcFactsFromRecords(rows))).toMatchObject({ pins: [], pendingLoot: { windows: 4, reporters: 3 } });
  });

  test("leave the addon's own windows as they were, and count no addon row", () => {
    const addon = ["abcd-0001", "abcd-0002", "abcd-0003"].map((installId) => ({ ...recorderLoot(installId), installId, eventId: "epoch:1", sourceEvidence: "loot-api" }));
    const mixed = read([...addon, ...three.map((id) => recorderLoot(id))]);
    expect(rollupDrops(lootWindowsFromRecords(mixed)).rates).toEqual([expect.objectContaining({ sourceNpcId: 61, itemId: 5, kills: 3, reporters: 3 })]);
    expect(pendingForNpc(pendingLootFromRecords(mixed), 61)).toEqual({ windows: 3, reporters: 3 });
    expect(pendingForNpc(pendingLootFromRecords(read(addon.map(({ sourceEvidence: _, ...row }) => row))), 61)).toBeNull();
  });
});
