import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { openDb } from "../src/db.js";
import { areaToUiMap, checkoutCommit, importPfquest, JUNK_NAME, JUNK_QUEST_TITLE, parseLuaData, PFQUEST_COMMIT } from "../src/importers/pfquest.js";
import { validate } from "../src/validate.js";
import { mapSnapshot, pfquestCheckout } from "./pfquest-fixture.js";

const NOW = new Date("2026-10-21T12:00:00Z");

test("parseLuaData reads keyed, positional and nested entries, numbers, strings and escapes", () => {
  const t = parseLuaData(`pfDB["units"]["data"] = {\n  [3] = { ["lvl"] = "5-6", ["coords"] = { [1] = { 40.5, -1, 12, 0 } } }, -- note\n  ["n"] = 'It\\'s \\"x\\"\\65', true; }`);
  expect(t.get(3)).toEqual(new Map<number | string, unknown>([["lvl", "5-6"], ["coords", new Map([[1, new Map([[1, 40.5], [2, -1], [3, 12], [4, 0]])]])]]));
  expect(t.get("n")).toBe(`It's "x"A`);
  expect(t.get(1)).toBe(true);
});

test("parseLuaData refuses anything that is not plain data", () => {
  for (const text of [
    `pfDB["a"]["b"] = { os.execute("x") }`,
    `pfDB["a"]["b"] = { [1] = x }`,
    `pfDB["a"]["b"] = { 1 + 2 }`,
    `pfDB["a"]["b"] = { 1 }\nos.exit()`,
    `pfDB["a"]["b"] = { "open`,
    `local t = { 1 }`,
    `pfDB["a"]["b"] = ${"{".repeat(40)}${"}".repeat(40)}`,
  ]) expect(() => parseLuaData(text), text).toThrow();
});

test("the junk rule drops GM, test and placeholder names and keeps ordinary ones", () => {
  for (const name of ["Waypoint (Only GM can see it)", "[UNUSED] Brother Milius", "<TEST> HEY MISTER WILSON!", "<NYI> <TXT> Stormwind Commendation", "Shambling Skeleton UNUSED", "OLDRecruit's Belt"]) {
    expect(JUNK_NAME.test(name), name).toBe(true);
  }
  for (const name of ["Test of Faith", "Old Blanchy", "Field Rat", "Captain's Chest"]) expect(JUNK_NAME.test(name), name).toBe(false);
});

test("the quest rule drops the developers' test quests and keeps real ones, quotes and the word Test included", () => {
  // Titles as pfQuest's quest list gives them (ids 1 and 9065, 1263, 5101, 7681, 8274 and 9378).
  for (const title of ["The \"Chow\" Quest (123)aa", "The Burning Inn <CHANGE TO GOSSIP>", "Lee's Ultimate Test Quest... of Doom!", "Hunter test quest2", "Test Kill Quest", "DND FLAG The Dread Citadel - Naxxramas"]) {
    expect(JUNK_QUEST_TITLE.test(title), title).toBe(true);
  }
  for (const title of ["The \"Seam\" Report", "Test of Faith", "The Test of Righteousness", "The Gordok Taste Test", "Toxic Test", "Rat Problem (Part 2)", "Wanted: <Name>", "Dread Citadel - Naxxramas"]) {
    expect(JUNK_QUEST_TITLE.test(title), title).toBe(false);
  }
});

test("the checkout's commit is read from .git without running git, loose or packed", () => {
  const dir = pfquestCheckout();
  expect(checkoutCommit(dir)).toBe(PFQUEST_COMMIT);
  writeFileSync(join(dir, ".git", "HEAD"), "ref: refs/heads/master\n");
  writeFileSync(join(dir, ".git", "packed-refs"), `# pack-refs\n${PFQUEST_COMMIT} refs/heads/master\n`);
  expect(checkoutCommit(dir)).toBe(PFQUEST_COMMIT);
  mkdirSync(join(dir, ".git", "refs", "heads"), { recursive: true });
  writeFileSync(join(dir, ".git", "refs", "heads", "master"), `${"a".repeat(40)}\n`);
  expect(checkoutCommit(dir)).toBe("a".repeat(40));
});

test("a checkout at another commit is refused unless the caller allows it", async () => {
  const dir = pfquestCheckout("b".repeat(40));
  await expect(importPfquest(openDb(":memory:"), dir)).rejects.toThrow(/not the pinned pfQuest commit 104f3567/);
  const run = await importPfquest(openDb(":memory:"), dir, { allowOtherCommit: true, now: NOW });
  expect(run.commit).toBe("b".repeat(40));
});

test("areas map to UiMaps through UiMapAssignment, lowest order first, then AreaTable's parents", () => {
  expect(areaToUiMap(mapSnapshot())).toEqual(new Map([[12, 1429], [14, 1411], [5000, 1429]]));
});

test("the fixture imports as pfquest-classic rows, junk and unnamed entries left out", async () => {
  const db = openDb(":memory:");
  const run = await importPfquest(db, pfquestCheckout(), { snapshotPath: mapSnapshot(), now: NOW });
  expect(run.rows).toEqual({ units: 3, objects: 2, items: 3, quests: 2 });
  // Quest 303 is the developers' "Chow" test quest: its title ends in a build number the junk rule did not know.
  expect(run.skipped).toEqual({ junk: 5, unnamed: 1 });
  // Area 87 has no UiMap of its own; pfQuest's zone table puts it in area 12. Instance area 1581 has none.
  expect(run.spawns).toEqual({ total: 5, mapped: 4, unmappedAreas: { 1581: 1 } });

  const rows = db.prepare("SELECT kind, ext_id, name, body, data, game_version, source_url, licence, retrieved_at FROM entities ORDER BY kind, ext_id").all() as Record<string, string>[];
  expect(rows.map((r) => `${r.kind}/${r.ext_id} ${r.name}`)).toEqual([
    "item/200 Rat Tail", "item/201 Copper Ore", "item/202 Simple Flour",
    "npc/10 Field Rat", "npc/11 Ridge Watcher", "npc/12 Cellar Lurker", "npc/object:100 Copper Seam", "npc/object:101 Captain's Chest",
    "quest/300 Rat Problem", "quest/302 The \"Seam\" Report",
  ]);
  for (const r of rows) {
    expect(r.game_version).toBe("classic");
    expect(r.body).toBe("");
    expect(r.licence).toMatch(/^pfQuest addon MIT; database derived from VMaNGOS \(GPL-2.0\)/);
    expect(r.source_url).toMatch(new RegExp(`^https://github\\.com/shagu/pfQuest/blob/${PFQUEST_COMMIT}/db/\\w+\\.lua$`));
    expect(r.retrieved_at).toBe("2026-10-21");
    // Quest objective and description text is Blizzard's prose: never stored.
    expect(r.data).not.toMatch(/prose/);
  }
  const data = (kind: string, extId: string) => JSON.parse(rows.find((r) => r.kind === kind && r.ext_id === extId)!.data);
  expect(data("npc", "10")).toEqual({
    entity: "unit", minLevel: 5, maxLevel: 6, refs: [],
    spawns: [{ x: 40.5, y: 60.25, areaId: 12, uiMapId: 1429, respawnSecs: 300 }, { x: 42, y: 62, areaId: 87, uiMapId: 1429, respawnSecs: 300 }],
  });
  expect(data("npc", "11")).toMatchObject({ minLevel: 10, maxLevel: 10, rank: 1, faction: "H", refs: [{ ref: 900, chance: 100 }] });
  expect(data("npc", "12").spawns).toEqual([{ x: 20, y: 30, areaId: 1581, respawnSecs: 7200 }]);
  expect(data("npc", "object:100")).toEqual({ entity: "object", id: 100, refs: [], spawns: [{ x: 30, y: 40, areaId: 12, uiMapId: 1429, respawnSecs: 60 }] });
  expect(data("item", "200")).toEqual({ entity: "item", drops: [{ npc: 10, chance: 25.5 }], refs: [{ ref: 900, chance: 3 }], vendors: [] });
  expect(data("item", "201").drops).toEqual([{ object: 100, chance: 80 }]);
  expect(data("item", "202").vendors).toEqual([{ npc: 11, count: 0 }]);
  expect(data("quest", "300")).toEqual({
    entity: "quest", lvl: 5, min: 3, race: 77, pre: [299], start: { U: [10] }, end: { U: [11] }, obj: { I: [200], U: [10] },
  });
  // The release build validates the whole source database first, these rows included.
  expect(validate(db)).toEqual([]);
});

test("without a client snapshot every spawn keeps its area id only", async () => {
  const run = await importPfquest(openDb(":memory:"), pfquestCheckout(), { now: NOW });
  expect(run.spawns).toEqual({ total: 5, mapped: 0, unmappedAreas: { 12: 2, 14: 1, 87: 1, 1581: 1 } });
});
