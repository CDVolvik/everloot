import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { writePricesAddon } from "../../companion/src/prices";
import { itemIdFrom, listRealms, mergeRealms, ownRealms, priceRows, readPricesFile, refreshMarket } from "../src/main/market";

const dirs: string[] = [];
const dir = () => { const d = mkdtempSync(join(tmpdir(), "everloot-market-")); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

test("own scans come first, followed realms fill in, duplicates by case drop, and the cap holds", () => {
  const merged = mergeRealms(["Nightslayer", "  "], ["nightslayer", "Dreamscythe", "Doomhowl"]);
  expect(merged).toEqual([{ realm: "Nightslayer", source: "scan" }, { realm: "Dreamscythe", source: "followed" }, { realm: "Doomhowl", source: "followed" }]);
  const many = mergeRealms([], Array.from({ length: 25 }, (_, i) => `Realm${i}`));
  expect(many).toHaveLength(20);
});

test("the realm list comes from the site's market endpoint without a realm", async () => {
  const send = vi.fn(async (url: string) => {
    expect(url).toBe("https://everloot.app/api/market/prices");
    return new Response(JSON.stringify({ ok: true, dataAsOf: "2026-10-18", realms: ["Doomhowl", 7, "Nightslayer"] }));
  });
  expect(await listRealms("https://everloot.app", send as unknown as typeof fetch)).toEqual({ realms: ["Doomhowl", "Nightslayer"], dataAsOf: "2026-10-18" });
  const down = vi.fn(async () => new Response("", { status: 503 }));
  await expect(listRealms("https://everloot.app", down as unknown as typeof fetch)).rejects.toThrow(/503/);
});

test("a refresh fetches scanned and followed realms and writes the slot addon; an unreadable file is skipped", async () => {
  const d = dir();
  const sv = join(d, "Everloot.lua");
  writeFileSync(sv, `EverlootDB = { ["version"] = "0.3.3", ["installId"] = "x", ["records"] = {}, ["lastScans"] = { ["Nightslayer"] = { ["at"] = "2026-10-18T00:00:00Z" } } }`);
  const asked: string[] = [];
  const send = vi.fn(async (url: string) => {
    const realm = new URL(url).searchParams.get("realm")!;
    asked.push(realm);
    return new Response(JSON.stringify({ ok: true, dataAsOf: "2026-10-18", realm, fields: [], items: [[1, 10, 9, 11, 5, "2026-10-17", 3]] }));
  });
  expect(ownRealms([sv, join(d, "missing.lua")])).toEqual(["Nightslayer"]);
  const r = await refreshMarket({ svFiles: [sv], followed: ["Doomhowl"], addonsDir: join(d, "AddOns"), endpoint: "https://everloot.app", send: send as unknown as typeof fetch });
  expect(asked).toEqual(["Nightslayer", "Doomhowl"]);
  expect(r.realms.map((x) => [x.realm, x.source])).toEqual([["Nightslayer", "scan"], ["Doomhowl", "followed"]]);
  expect(readFileSync(join(d, "AddOns", "EverlootPrices", "EverlootPrices.toc"), "utf8")).toContain("EverlootPrices");
});

test("the prices file in the game reads back per realm, and one item comes back on every realm that has it", () => {
  const addons = dir();
  expect(readPricesFile(addons)).toBeNull();
  writePricesAddon(addons, [
    { realm: "Forever", dataAsOf: "2026-10-20T06:30:00.000Z", items: [[2589, 205, 200, 190, 40, "2026-10-20", 3], [765, null, 30, 33, 900, "2026-10-05", 4], [25890, 1, 1, 1, 1, "2026-10-20", 3]] },
    { realm: "Doomhowl", dataAsOf: null, items: [[2589, 300, 250, 280, 12, "2026-10-19", 5]] },
  ]);
  const file = readPricesFile(addons)!;
  expect(file.realms).toEqual([{ realm: "forever", dataAsOf: "2026-10-20T06:30:00.000Z", items: 3 }, { realm: "doomhowl", dataAsOf: null, items: 1 }]);
  expect(priceRows(file, 2589).map((r) => [r.realm, r.market, r.min, r.historical, r.quantity, r.reporters])).toEqual([["forever", 205, 200, 190, 40, 3], ["doomhowl", 300, 250, 280, 12, 5]]);
  expect(priceRows(file, 765)[0]).toMatchObject({ market: null, min: 30, day: "2026-10-05" });
  // 258 is not 2589 or 25890: rows are matched whole.
  expect(priceRows(file, 258)).toEqual([]);
});

test("an item is given by id, by a link pasted from game chat, or by its everloot.app address", () => {
  expect(itemIdFrom(" 2589 ")).toBe(2589);
  expect(itemIdFrom("|cffffffff|Hitem:2589::::::::60:::::|h[Linen Cloth]|h|r")).toBe(2589);
  expect(itemIdFrom("https://everloot.app/database/items/19019")).toBe(19019);
  expect(itemIdFrom("Linen Cloth")).toBeNull();
  expect(itemIdFrom("")).toBeNull();
});
