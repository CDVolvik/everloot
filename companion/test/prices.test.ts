import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { adler32 } from "../src/bridge/lua";
import { fetchRealmPrices, readRealms, refreshPrices, renderPricesAddon, PRICES_ADDON } from "../src/prices";
import { FIXTURE_REALMS } from "../scripts/write-prices-fixture";

const FIXTURE = new URL("../../addon/tests/fixtures/EverlootPrices.lua", import.meta.url);

const SV = `EverlootDB = {
["installId"] = "abcd-1234-ef56-7890",
["lastScans"] = { ["Forever"] = { ["scanId"] = "abcd-1", ["at"] = 1 } },
["records"] = {
["auction_snapshot"] = { { ["realm"] = "Forever", ["items"] = {} } },
["gold_snapshot"] = { { ["realm"] = "Nightfall", ["character"] = "Thrall" } },
["loot"] = { { ["sourceNpcId"] = 5 } },
},
}`;

test("realms come from the player's own SavedVariables, once each", () => {
  expect(readRealms(SV)).toEqual(["Forever", "Nightfall"]);
  expect(readRealms("EverlootDB = {}")).toEqual([]);
});

const body = {
  ok: true, realm: "Forever", dataAsOf: "2026-10-20T06:30:00.000Z",
  fields: ["itemId", "market", "min", "historical", "quantity", "day", "reporters"],
  items: [[2589, 205, 200, 190, 40, "2026-10-20", 3], [765, null, 30, 33, 900, "2026-10-05", 4]],
};

test("a realm's prices are fetched and every tuple is checked", async () => {
  const send = vi.fn().mockResolvedValue(Response.json({ ...body, items: [...body.items, [1, "x"], [2, 1, 1, 1, 1, "bad day", 1]] }));
  const prices = await fetchRealmPrices("https://everloot.example", "Forever", send);
  expect(send.mock.calls[0][0]).toBe("https://everloot.example/api/market/prices?realm=Forever");
  expect(prices).toEqual({ realm: "Forever", dataAsOf: "2026-10-20T06:30:00.000Z", items: body.items });
});

test("a failed fetch is an error, never an empty price list", async () => {
  await expect(fetchRealmPrices("https://e.example", "Forever", vi.fn().mockResolvedValue(Response.json({ ok: false }, { status: 503 }))))
    .rejects.toThrow(/503/);
});

test("the slot addon holds one checksummed string per realm and matches the golden file", () => {
  const { toc, lua } = renderPricesAddon(FIXTURE_REALMS);
  expect(toc).toContain(`## Interface: 70058`);
  expect(toc).toContain(`${PRICES_ADDON}.lua`);
  const data = "2589,205,200,190,40,2026-10-20,3;765,,30,33,900,2026-10-05,4";
  expect(lua).toContain(`["data"] = "${data}"`);
  expect(lua).toContain(`["sum"] = ${adler32(data)}`);
  // Keys are lower-cased so the addon's GetRealmName():lower() finds them.
  expect(lua).toContain('["forever"] = {');
  // A hostile realm name stays a string literal.
  expect(lua).not.toMatch(/\n[^"\n]*os\.execute/);
  expect(lua).toBe(readFileSync(FIXTURE, "utf8").replace(/\r\n/g, "\n"));
});

test("refresh writes the slot addon for the realms in the file, and keeps the old one on any failure", async () => {
  const dir = mkdtempSync(join(tmpdir(), "everloot-prices-"));
  const sv = join(dir, "Everloot.lua");
  writeFileSync(sv, SV);
  const addons = join(dir, "AddOns");
  const ok = vi.fn(async (url: string) => Response.json({ ...body, realm: url.includes("Nightfall") ? "Nightfall" : "Forever" }));
  expect(await refreshPrices({ svFiles: [sv], addonsDir: addons, endpoint: "https://e.example", fetch: ok as unknown as typeof fetch }))
    .toEqual({ realms: 2, items: 4 });
  const written = join(addons, PRICES_ADDON, `${PRICES_ADDON}.lua`);
  const before = readFileSync(written, "utf8");
  expect(before).toContain('["nightfall"]');

  const down = vi.fn().mockResolvedValue(new Response("down", { status: 500 }));
  await expect(refreshPrices({ svFiles: [sv], addonsDir: addons, endpoint: "https://e.example", fetch: down })).rejects.toThrow(/500/);
  expect(readFileSync(written, "utf8")).toBe(before);
  expect(existsSync(join(addons, PRICES_ADDON, `${PRICES_ADDON}.toc`))).toBe(true);
});
