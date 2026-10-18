import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { listRealms, mergeRealms, ownRealms, refreshMarket } from "../src/main/market";

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
