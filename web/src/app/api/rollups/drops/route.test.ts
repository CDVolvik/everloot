import { afterEach, beforeEach, expect, test, vi } from "vitest";

const store = vi.hoisted(() => ({ loadCorpus: vi.fn(), api: vi.fn(), computeRollups: vi.fn() }));
vi.mock("@/lib/upload-store", () => ({ uploadStore: { loadCorpus: store.loadCorpus } }));
vi.mock("@/lib/intake-quota", () => ({ intakeQuota: { api: store.api } }));

import { GET } from "./route";
import { ANON_PAGE } from "@/lib/data-guard";

const req = (query = "") => new Request(`https://everloot.app/api/rollups/drops${query}`);

beforeEach(() => {
  store.api.mockReset().mockResolvedValue({ allowed: true, retryAfter: 0 });
});
afterEach(() => { vi.unstubAllEnvs(); vi.doUnmock("@/lib/rollup-compute"); });

test("the drop API reports when its data was current, not only when it answered", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [], dataAsOf: "2026-10-09T10:00:00.000Z" });
  const body = await (await GET(req())).json();
  expect(body.dataAsOf).toBe("2026-10-09T10:00:00.000Z");
  expect(body.stats.dataAsOf).toBe("2026-10-09T10:00:00.000Z");
});

test("an unreadable store has no data time", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [], unreachable: true });
  const body = await (await GET(req())).json();
  expect(body.unreachable).toBe(true);
  expect(body.dataAsOf).toBeNull();
});

test("every answer carries the licence and credit line, in the body and the headers", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [], dataAsOf: "2026-10-09T10:00:00.000Z" });
  const res = await GET(req());
  expect((await res.json()).attribution).toMatchObject({ licence: "CC BY-SA 4.0", source: "https://everloot.app/database/drops" });
  expect(res.headers.get("x-everloot-credit")).toBe("Data from Everloot (https://everloot.app), CC BY-SA 4.0.");
  expect(store.api).not.toHaveBeenCalled();
});

test("guard on: the drop list is paged for anonymous callers and limited per IP", async () => {
  vi.stubEnv("EVERLOOT_DATA_GUARD", "1");
  vi.resetModules();
  const rate = (i: number) => ({ itemId: i, public: true });
  vi.doMock("@/lib/rollup-compute", () => ({
    computeRollups: async () => ({ rates: Array.from({ length: 700 }, (_, i) => rate(i)), measuredZeros: [], stats: { unreachable: false, dataAsOf: null } }),
  }));
  const { GET: paged } = await import("./route");
  const body = await (await paged(req())).json();
  expect(body.rates).toHaveLength(ANON_PAGE);
  expect(body).toMatchObject({ totalRates: 700, offset: 0, limit: ANON_PAGE });
  expect(body.next).toBe(`https://everloot.app/api/rollups/drops?offset=${ANON_PAGE}&limit=${ANON_PAGE}`);
  store.api.mockResolvedValue({ allowed: false, retryAfter: 60 });
  expect((await paged(req())).status).toBe(429);
});
