import { expect, test } from "vitest";
import { openDb } from "../src/db.js";
import { importWagoTable, WAGO_TABLES, wagoCsvUrl, wagoRows } from "../src/importers/wago.js";

const items = WAGO_TABLES.find((t) => t.table === "ItemSparse")!;
const CSV = [
  "ID,Display_lang,OverallQualityID,ItemLevel,RequiredLevel,Other",
  '19019,"Thunderfury, Blessed Blade of the Windseeker",5,80,60,x',
  "17,,1,1,1,x",
].join("\n");

test("maps configured columns and skips rows without a name", () => {
  const rows = wagoRows(items, CSV, "1.60.1.69977", "2026-09-27T00:00:00.000Z");
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    kind: "item",
    extId: "19019",
    name: "Thunderfury, Blessed Blade of the Windseeker",
    gameVersion: "forever",
    sourceUrl: wagoCsvUrl("ItemSparse", "1.60.1.69977"),
    data: { build: "1.60.1.69977", quality: "5", itemLevel: "80", requiredLevel: "60" },
  });
});

test("fails loudly when an expected column is missing", () => {
  expect(() => wagoRows(items, "ID,Name\n1,A", "b", "t")).toThrow("Display_lang");
});

test("importWagoTable stores rows as non-publishable Blizzard game data", async () => {
  const db = openDb(":memory:");
  const fakeFetch = async () => new Response(CSV, { status: 200 });
  expect(await importWagoTable(db, items, "1.60.1.69977", fakeFetch as typeof fetch)).toBe(1);
  expect(await importWagoTable(db, items, "1.60.1.69977", fakeFetch as typeof fetch)).toBe(1);
  const r = db.prepare("SELECT count(*) AS n, max(licence) AS licence FROM entities").get();
  expect(r).toEqual({ n: 1, licence: "blizzard-game-data" });
});

test("HTTP errors are reported with the table and build", async () => {
  const db = openDb(":memory:");
  const notFound = async () => new Response("nope", { status: 404 });
  await expect(importWagoTable(db, items, "9.9.9", notFound as typeof fetch)).rejects.toThrow("ItemSparse 9.9.9: HTTP 404");
});
