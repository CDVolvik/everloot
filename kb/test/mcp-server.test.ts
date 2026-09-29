import { expect, test } from "vitest";
import { openDb } from "../src/db.js";
import { replaceSourceRows, type EntityInput } from "../src/entities.js";
import {
  SERVER_NAME,
  SERVER_VERSION,
  createKnowledgeServer,
  handleGetByName,
  handleGetEntity,
  handleSearch,
} from "../src/mcp-server.js";

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
    row("2", "Thunderfury, Blessed Blade", "A sword.", { kind: "item", gameVersion: "retail" }),
  ]);
  return db;
}

test("search handler answers questions and shows provenance", async () => {
  const text = handleSearch(await seed(), { query: "where is Thunderfury", limit: 8 });
  expect(text).toContain("Thunderfury");
  expect(text).toContain("https://example.test/1");
  expect(text).toContain("CC-BY-SA-4.0");
});

test("search handler says so when nothing matches", async () => {
  expect(handleSearch(await seed(), { query: "xyznothinghere", limit: 8 })).toContain("No matches");
});

test("get_entity handler returns the row or names the missing id", async () => {
  const db = await seed();
  const [first] = (await import("../src/search.js")).search(db, "Thunderfury");
  expect(handleGetEntity(db, { id: first.id })).toContain("Thunderfury");
  expect(handleGetEntity(db, { id: -1 })).toContain("-1");
});

test("get_by_name handler matches exactly and suggests search otherwise", async () => {
  const db = await seed();
  expect(handleGetByName(db, { name: "thunderfury" })).toContain("[lore_page/lore] Thunderfury");
  expect(handleGetByName(db, { name: "Thunderfury", kind: "npc" })).toContain("search_knowledge");
});

test("the server registers under the Everloot name", async () => {
  const server = createKnowledgeServer(await seed());
  expect(server).toBeTruthy();
  expect(SERVER_NAME).toBe("everloot-knowledge");
  expect(SERVER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
});
