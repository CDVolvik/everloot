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
