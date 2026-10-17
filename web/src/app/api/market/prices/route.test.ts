import { beforeEach, expect, test, vi } from "vitest";
import { emptyMarket, foldMarket } from "../../../../../../kb/src/market";

const store = vi.hoisted(() => ({ loadMarket: vi.fn() }));
vi.mock("@/lib/upload-store", () => ({ uploadStore: { loadMarket: store.loadMarket } }));

import { GET } from "./route";

const NOW = new Date();
const day = NOW.toISOString().slice(0, 10);
const scans = ["install-secret-1", "install-secret-2", "install-secret-3"].map((installId, i) => ({
  kind: "auction_snapshot", installId, eventId: `e:${i}`, capturedAt: NOW.toISOString(), realm: "Forever",
  scanId: `s-${i}`, part: 1, parts: 1, items: [[2589, 2, 40, 100 * (i + 1), 100 * (i + 1) + 5]],
}));
const state = foldMarket(emptyMarket(), scans, NOW);
const req = (query = "") => new Request(`https://everloot.app/api/market/prices${query}`);

beforeEach(() => store.loadMarket.mockReset().mockResolvedValue({ state, dataAsOf: "2026-10-20T12:00:00.000Z" }));

test("a realm's prices are compact tuples with the data age and the rule", async () => {
  const res = await GET(req("?realm=forever"));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({
    ok: true, realm: "Forever", dataAsOf: "2026-10-20T12:00:00.000Z",
    fields: ["itemId", "market", "min", "historical", "quantity", "day", "reporters"],
    items: [[2589, 205, 200, 205, 40, day, 3]],
  });
  expect(body.rule).toContain("3 installs");
});

test("without a realm it lists the realms that have scans", async () => {
  expect(await (await GET(req())).json()).toMatchObject({ ok: true, realms: ["Forever"] });
});

test("install ids never leave the site", async () => {
  for (const query of ["", "?realm=Forever"]) {
    expect(JSON.stringify(await (await GET(req(query))).json())).not.toContain("install-secret");
  }
});

test("an unreadable rollup is unavailable, not an empty market", async () => {
  store.loadMarket.mockResolvedValue({ state: null, dataAsOf: null, unreachable: true });
  const res = await GET(req("?realm=Forever"));
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ ok: false });
});

test("a realm name is bounded", async () => {
  expect((await GET(req(`?realm=${"x".repeat(61)}`))).status).toBe(400);
});
