import { expect, test } from "vitest";
import { emptyLedger, mergeLedger, WIKI_PAGE_PREFIX } from "../src/item-names.js";
import { fileNameGaps, formatNameGaps, itemGaps, NAME_GAPS_SCHEMA, questGaps } from "../src/name-gaps.js";

const B1 = "1.60.1.70450";
const page = (title: string) => `${WIKI_PAGE_PREFIX}${title}`;

test("every item gets one reason: the source of its name, or the addon when no source names it", () => {
  const ledger = mergeLedger(emptyLedger(), {
    at: "2026-10-21T00:00:00Z", build: B1,
    files: new Map([[25, "Worn Shortsword"], [41, "Fel Ash Sample"], [732, "Okra"], [30_000, "Later Sword"]].map(([id, name]) => [id as number, { name: name as string, quality: 1 }])),
    wikiDump: "2023-11-13",
    wiki: new Map([[25, "Worn Shortsword"], [647, "Destiny"], [732, "Ripe Okra"], [30_000, "Later Sword"]].map(([id, name]) => [id as number, [{ name: name as string, page: page(String(name)) }]])),
  });
  const k = itemGaps(ledger, B1, [25, 41, 647, 732, 30_000, 17]);
  expect(k.total).toBe(6);
  expect(Object.fromEntries(k.buckets.map((b) => [b.reason, [b.route, b.sample]]))).toEqual({
    "files and wiki agree": ["shown", [25, 30_000]],
    "game files only": ["shown", [41]],
    "wiki only": ["shown", [647]],
    "files and wiki differ (the files' name shows)": ["shown", [732]],
    "no name in the files or the wiki": ["players", [17]],
  });
  // Listed by route: what shows first, then what waits on the addon.
  expect(k.buckets.at(-1)!.route).toBe("players");
});

test("a quest without a wiki title waits on the addon; one whose wiki pages disagree still shows", () => {
  const titles = new Map([
    [2, [{ name: "Sharptalon's Claw", page: page("Sharptalon's_Claw") }]],
    [1, [{ name: "The Escape", page: page("The_Escape") }, { name: "Into the Fray", page: page("Into_the_Fray") }]],
    [65593, [{ name: "Later Quest", page: page("Later_Quest") }]],
  ]);
  const k = questGaps(B1, [1, 2, 28, 65593], titles);
  expect(k.buckets).toEqual([
    { reason: "wiki title", route: "shown", count: 2, sample: [2, 65593] },
    { reason: "wiki pages differ (the first one's title shows)", route: "shown", count: 1, sample: [1] },
    { reason: "no wiki title (the game files hold none)", route: "players", count: 1, sample: [28] },
  ]);
});

test("a set or spell is named when its row has a name", () => {
  const rows = new Map<number, Record<string, unknown>>([[1, { Name_lang: "The Gladiator" }], [1570, { Name_lang: "[DNT] Test Set" }], [2, { Name_lang: "" }]]);
  expect(fileNameGaps("item_set", "Item sets", rows).buckets).toEqual([
    { reason: "named in the game files", route: "shown", count: 2, sample: [1, 1570] },
    { reason: "no name in the game files", route: "none", count: 1, sample: [2] },
  ]);
});

test("the report prints ids and counts per route, never a name", () => {
  const rows = new Map<number, Record<string, unknown>>([[1, { Name_lang: "The Gladiator" }], [2, { Name_lang: "" }]]);
  const md = formatNameGaps({ schema: NAME_GAPS_SCHEMA, build: B1, kinds: [fileNameGaps("item_set", "Item sets", rows)] });
  expect(md).toContain("| Item sets | 2 | 1 | 0 | 1 |");
  expect(md).toContain("| no name in the game files | none | 1 | 2 |");
  expect(md).not.toContain("Gladiator");
});
