import { expect, test } from "vitest";
import { mayShowSetName } from "../src/game-name-rule.js";
import { emptyLedger, mergeLedger, WIKI_PAGE_PREFIX } from "../src/item-names.js";
import { SHOWN_MAX_ITEM_ID } from "../src/item-name-rule.js";
import { fileNameGaps, formatNameGaps, itemGaps, NAME_GAPS_SCHEMA, questGaps } from "../src/name-gaps.js";

const B1 = "1.60.1.70450";
const page = (title: string) => `${WIKI_PAGE_PREFIX}${title}`;
const routeOf = (k: ReturnType<typeof itemGaps>, reason: string) => k.buckets.find((b) => b.reason === reason);

test("every item gets one reason and one route, the same tiers the item name rule reads", () => {
  const ledger = mergeLedger(emptyLedger(), {
    at: "2026-10-21T00:00:00Z", build: B1,
    files: new Map([[25, "Worn Shortsword"], [41, "Fel Ash Sample"], [732, "Okra"], [883, "Deprecated Hammer"], [SHOWN_MAX_ITEM_ID, "Later Sword"]].map(([id, name]) => [id as number, { name: name as string, quality: 1 }])),
    wikiDump: "2023-11-13",
    wiki: new Map([[25, "Worn Shortsword"], [647, "Destiny"], [732, "Ripe Okra"], [883, "Deprecated Hammer"], [SHOWN_MAX_ITEM_ID, "Later Sword"]].map(([id, name]) => [id as number, [{ name: name as string, page: page(String(name)) }]])),
  });
  const k = itemGaps(ledger, B1, [25, 41, 647, 732, 883, SHOWN_MAX_ITEM_ID, 17]);
  expect(k.total).toBe(7);
  expect(routeOf(k, "files and wiki agree")).toEqual({ reason: "files and wiki agree", route: "shown", count: 1, sample: [25] });
  expect(routeOf(k, "name in the game files only")?.route).toBe("decision");
  expect(routeOf(k, "name in the wiki only")?.sample).toEqual([647]);
  expect(routeOf(k, "files and wiki give different names")?.sample).toEqual([732]);
  expect(routeOf(k, `files and wiki agree, id ${SHOWN_MAX_ITEM_ID} or above`)?.route).toBe("decision");
  expect(routeOf(k, "placeholder or internal name")).toMatchObject({ route: "never", sample: [883] });
  expect(routeOf(k, "no name in the files or the wiki")).toMatchObject({ route: "players", sample: [17] });
  // Listed by route: shown first, hidden last.
  expect(k.buckets.map((b) => b.route)).toEqual(["shown", "decision", "decision", "decision", "decision", "players", "never"]);
});

test("a quest blank is a wiki disagreement, an id out of range, or a title only players can give", () => {
  const titles = new Map([
    [2, [{ name: "Sharptalon's Claw", page: page("Sharptalon's_Claw") }]],
    [1, [{ name: "The Escape", page: page("The_Escape") }, { name: "Into the Fray", page: page("Into_the_Fray") }]],
    [65593, [{ name: "Later Quest", page: page("Later_Quest") }]],
  ]);
  const k = questGaps(B1, [1, 2, 28, 65593], titles);
  expect(k.buckets).toEqual([
    { reason: "wiki title for an id the build lists", route: "shown", count: 1, sample: [2] },
    { reason: "wiki pages give different titles", route: "decision", count: 1, sample: [1] },
    { reason: "wiki title, id 10000 or above", route: "decision", count: 1, sample: [65593] },
    { reason: "no wiki title (the game files hold none)", route: "players", count: 1, sample: [28] },
  ]);
});

test("set and spell names held back by the relations rule are told apart from missing and internal names", () => {
  const rows = new Map<number, Record<string, unknown>>([
    [1, { Name_lang: "The Gladiator" }], [4, { Name_lang: "Shadowcraft Armor" }], [1570, { Name_lang: "Twilight Invoker's Vestments" }],
    [2, { Name_lang: "" }], [3, { Name_lang: "[DNT] Test Set" }],
  ]);
  const k = fileNameGaps("item_set", "Item sets", rows, [1, 1570, 99], mayShowSetName, 1000);
  expect(k.total).toBe(6);
  expect(Object.fromEntries(k.buckets.map((b) => [b.reason, b.sample]))).toEqual({
    "named in the files, used by a relation": [1],
    "named in the files, no item relation points to it": [4],
    "named in the files, id 1000 or above": [1570],
    // A relation to an id the table does not name counts as missing, like an empty name.
    "no name in the game files": [2, 99],
    "placeholder or internal name": [3],
  });
});

test("the report prints ids and counts per route, never a name", () => {
  const rows = new Map<number, Record<string, unknown>>([[1, { Name_lang: "The Gladiator" }], [2, { Name_lang: "" }]]);
  const md = formatNameGaps({ schema: NAME_GAPS_SCHEMA, build: B1, kinds: [fileNameGaps("item_set", "Item sets", rows, [1], mayShowSetName, 1000)] });
  expect(md).toContain("| Item sets | 2 | 1 | 0 | 0 | 1 | 0 |");
  expect(md).toContain("| no name in the game files | none | 1 | 2 |");
  expect(md).not.toContain("Gladiator");
});
