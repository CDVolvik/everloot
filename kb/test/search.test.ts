import { expect, test } from "vitest";
import { openDb } from "../src/db.js";
import { replaceSourceRows, type EntityInput } from "../src/entities.js";
import { getByName, getEntity, search } from "../src/search.js";

const row = (extId: string, name: string, body = "", extra: Partial<EntityInput> = {}): EntityInput => ({
  kind: "lore_page",
  extId,
  name,
  body,
  gameVersion: "lore",
  sourceUrl: `https://example.test/${extId}`,
  retrievedAt: "2023-11-13",
  ...extra,
});

async function seed() {
  const db = openDb(":memory:");
  await replaceSourceRows(db, "curated", ["lore_page", "item"], [
    row("1", "Thunderfury", "Warchief Thrall once held Thunderfury aloft."),
    row("2", "Blessed Blade of the Windseeker", "Thunderfury Thunderfury Thunderfury. Forged from Thunderfury winds."),
    row("3", "Thunderfury, Blessed Blade", "A sword. Thunderfury.", { kind: "item", gameVersion: "retail" }),
  ]);
  return db;
}

test("an exact-name match ranks first even when another page repeats the words", async () => {
  const hits = search(await seed(), "Thunderfury");
  expect(hits.length).toBeGreaterThan(0);
  expect(hits[0].name).toBe("Thunderfury");
});

test("question words do not block the match", async () => {
  const hits = search(await seed(), "where is Thunderfury");
  expect(hits.map((h) => h.name)).toContain("Thunderfury");
});

test("a question still puts the exact name first, not a page that repeats it", async () => {
  // Found live: "Who is Thrall?" answered with "Dormant Thrall" because the boost compared the raw question.
  const hits = search(await seed(), "Who is Thunderfury?");
  expect(hits[0].name).toBe("Thunderfury");
  const plural = search(await seed(), "tell me about the Blessed Blade of the Windseeker");
  expect(plural[0].name).toBe("Blessed Blade of the Windseeker");
});

test("a name of exactly the asked words beats one that only matches after dropping stopwords", async () => {
  // The real release answered "Who is Thrall?" with the quest page "Find Thrall!" ("find" is a stopword).
  const db = openDb(":memory:");
  await replaceSourceRows(db, "curated", ["lore_page"], [
    row("1", "Find Thunderfury!", "Thunderfury Thunderfury Thunderfury, a quest."),
    row("2", "Thunderfury", "A sword of legend, long and storied, held by many over the ages."),
  ]);
  expect(search(db, "Who is Thunderfury?", 1)[0].name).toBe("Thunderfury");
});

test("at the same rank, Everloot's curated entry comes before a copied wiki page", async () => {
  const db = openDb(":memory:");
  // The wiki copy goes in first, so it has the lower id and wins every tie the SQL order breaks.
  await replaceSourceRows(db, "warcraft-wiki-2023", ["lore_page"], [row("10", "Forever launch date", "Forever launch date, Forever launch date, as the wiki had it.")]);
  await replaceSourceRows(db, "curated", ["lore_page"], [row("forever-launch-date", "Forever launch date", "Launches November 4.")]);
  const hits = search(db, "Forever launch date");
  expect(hits.map((h) => h.sourceId)).toEqual(["curated", "warcraft-wiki-2023"]);
  // An exact name still beats a curated entry that only shares words.
  await replaceSourceRows(db, "curated", ["lore_page"], [row("forever-notes", "Notes on the Forever launch date", "Forever launch date.")]);
  expect(search(db, "Forever launch date")[0].sourceId).toBe("warcraft-wiki-2023");
});

test("hits carry gameVersion and retrievedAt", async () => {
  const hits = search(await seed(), "Thunderfury");
  expect(hits[0]).toMatchObject({ gameVersion: "lore", retrievedAt: "2023-11-13" });
  const item = hits.find((h) => h.kind === "item");
  expect(item).toMatchObject({ gameVersion: "retail" });
});

test("kind and version filters narrow the results", async () => {
  const db = await seed();
  expect(search(db, "Thunderfury", 10, { kinds: ["item"] }).map((h) => h.kind)).toEqual(["item"]);
  expect(search(db, "Thunderfury", 10, { versions: ["retail"] }).map((h) => h.gameVersion)).toEqual(["retail"]);
  expect(search(db, "Thunderfury", 10, { kinds: ["npc"] })).toHaveLength(0);
});

test("getEntity returns one row by id, unknown id gives undefined", async () => {
  const db = await seed();
  const [first] = search(db, "Thunderfury");
  expect(getEntity(db, first.id)).toMatchObject({ id: first.id, name: first.name });
  expect(getEntity(db, -1)).toBeUndefined();
});

test("getByName matches the full name case-insensitively", async () => {
  const db = await seed();
  expect(getByName(db, "thunderfury").map((r) => r.name)).toEqual(["Thunderfury"]);
  expect(getByName(db, "Thunderfury", "item")).toHaveLength(0);
  expect(getByName(db, "No Such Page")).toHaveLength(0);
});

test("paging is a stable prefix: page cuts at different limits never repeat or skip a hit", async () => {
  const db = openDb(":memory:");
  const rows: EntityInput[] = [];
  for (let i = 1; i <= 70; i++) rows.push(row(String(100 + i), `Grommash Grommash Grommash Hold ${i}`, `Grommash fought here ${"again ".repeat(i % 7)}`));
  rows.push(row("9", "Grommash!", ""));
  await replaceSourceRows(db, "curated", ["lore_page"], rows);
  const all = search(db, "the grommash", 80).map((h) => h.id);
  expect(new Set(all).size).toBe(all.length);
  expect(search(db, "the grommash", 20).map((h) => h.id)).toEqual(all.slice(0, 20));
  expect(search(db, "the grommash", 60).map((h) => h.id)).toEqual(all.slice(0, 60));
  expect(all[0]).toBe(search(db, "the grommash", 1)[0].id);
});

test("a punctuated exact name still ranks first when bm25 buries it past the window", async () => {
  const db = openDb(":memory:");
  const rows: EntityInput[] = [];
  for (let i = 1; i <= 60; i++) {
    rows.push(row(String(100 + i), `Kel Thuzad chronicle ${i}`, `${"kel thuzad ".repeat(20)}volume ${i}`));
  }
  rows.push(row("1", "Kel'Thuzad", "A lich of legend.", { data: { type: "npc" } }));
  await replaceSourceRows(db, "curated", ["lore_page"], rows);
  expect(search(db, "kel thuzad", 10)[0].name).toBe("Kel'Thuzad");
  expect(search(db, "kel thuzad", 1)[0].name).toBe("Kel'Thuzad");
  expect(search(db, "kel thuzad", 10, { kinds: ["item"] }).some((h) => h.name === "Kel'Thuzad")).toBe(false);
  expect(search(db, "kel thuzad", 10, { versions: ["retail"] }).some((h) => h.name === "Kel'Thuzad")).toBe(false);
  // The type filter applies to the exact-name lookup too.
  expect(search(db, "kel thuzad", 10, { types: ["npc"] })[0].name).toBe("Kel'Thuzad");
  expect(search(db, "kel thuzad", 10, { types: ["item"] }).some((h) => h.name === "Kel'Thuzad")).toBe(false);
});

test("a curly-apostrophe exact name still ranks first when bm25 buries it", async () => {
  const db = openDb(":memory:");
  const rows: EntityInput[] = [];
  for (let i = 1; i <= 60; i++) {
    rows.push(row(String(100 + i), `Kel Thuzad chronicle ${i}`, `${"kel thuzad ".repeat(20)}volume ${i}`));
  }
  rows.push(row("1", "Kel’Thuzad", "A lich of legend."));
  await replaceSourceRows(db, "curated", ["lore_page"], rows);
  expect(search(db, "kel thuzad", 10)[0].name).toBe("Kel’Thuzad");
  expect(search(db, "kel thuzad", 1)[0].name).toBe("Kel’Thuzad");
  expect(search(db, "kel thuzad", 10, { kinds: ["item"] }).some((h) => h.name === "Kel’Thuzad")).toBe(false);
});

test("the normalized lookup is skipped when the pool already holds the exact name", async () => {
  const countPrepares = (db: ReturnType<typeof openDb>): (() => number) => {
    let n = 0;
    const orig = db.prepare.bind(db);
    (db as unknown as { prepare: unknown }).prepare = (...args: [string, ...unknown[]]) => {
      n += 1;
      return (orig as (...a: unknown[]) => unknown)(...args);
    };
    return () => n;
  };

  const direct = await seed();
  const directCount = countPrepares(direct);
  expect(search(direct, "Thunderfury")[0].name).toBe("Thunderfury");
  expect(directCount()).toBe(1);

  const buried = openDb(":memory:");
  const rows: EntityInput[] = [];
  for (let i = 1; i <= 60; i++) {
    rows.push(row(String(100 + i), `Kel Thuzad chronicle ${i}`, `${"kel thuzad ".repeat(20)}volume ${i}`));
  }
  rows.push(row("1", "Kel'Thuzad", "A lich of legend."));
  await replaceSourceRows(buried, "curated", ["lore_page"], rows);
  const buriedCount = countPrepares(buried);
  expect(search(buried, "kel thuzad", 10)[0].name).toBe("Kel'Thuzad");
  expect(buriedCount()).toBe(2);
});
