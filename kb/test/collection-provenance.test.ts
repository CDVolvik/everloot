import { expect, test } from "vitest";
import { itemFactsFromRecords, lootWindowsFromRecords } from "../src/drop-rollup.js";
import { npcPage, worldFactsFromRecords } from "../src/world-pages.js";

test("legacy target guesses are retained elsewhere but excluded from source rollups", () => {
  const row = { kind: "loot", installId: "a", sourceNpcId: 42, items: [{ itemId: 7, count: 2 }] };
  expect(lootWindowsFromRecords([row])).toEqual([]);
  expect(lootWindowsFromRecords([{ ...row, sourceEvidence: "loot-api" }])).toHaveLength(1);
});

test("player and unknown positions can agree on NPC names without becoming spawn pins", () => {
  for (const positionKind of [undefined, "player", "npc", "interaction", "nearby"]) {
    const rows = ["a", "b", "c"].map(installId => ({
      kind: "npc_sighting", installId, npcId: 42, name: "Hogger", mapId: 12, x: 40, y: 20, positionKind,
    }));
    const pinned = positionKind === "npc" || positionKind === "interaction";
    const page = npcPage(42, worldFactsFromRecords(rows));
    expect(page.name).toBe("Hogger");
    expect(page.pins).toHaveLength(pinned ? 1 : 0);
    expect(itemFactsFromRecords(rows).npcs).toHaveLength(pinned ? 3 : 0);
  }
});
