/**
 * Regenerates addon/tests/fixtures/EverlootPrices.lua: npx tsx scripts/write-prices-fixture.ts
 * The companion test pins its output to this file; addon/tests/market_contract.py loads it in Lua 5.1.
 */
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { renderPricesAddon, type RealmPrices } from "../src/prices";

const HOSTILE = 'x"] = 1 } os.execute("calc") --[[\n]]\\\0\r\t';

export const FIXTURE_REALMS: RealmPrices[] = [
  {
    realm: "Forever", dataAsOf: "2026-10-20T06:30:00.000Z",
    items: [[2589, 205, 200, 190, 40, "2026-10-20", 3], [765, null, 30, 33, 900, "2026-10-05", 4]],
  },
  { realm: HOSTILE, dataAsOf: "2026-10-20T06:30:00.000Z", items: [[1, 1, 1, 1, 1, "2026-10-20", 3]] },
];

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(new URL("../../addon/tests/fixtures/EverlootPrices.lua", import.meta.url), renderPricesAddon(FIXTURE_REALMS).lua);
}
