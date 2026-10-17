import { beforeEach, expect, test, vi } from "vitest";
const store = vi.hoisted(() => ({ writeSnapshot: vi.fn(), writeMarket: vi.fn(), prune: vi.fn() }));
vi.mock("@/lib/upload-store", () => ({ uploadStore: { writeSnapshot: store.writeSnapshot, writeMarket: store.writeMarket } }));
vi.mock("@/lib/intake-quota", () => ({ intakeQuota: { prune: store.prune } }));
import { GET } from "./route";
beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "synthetic-cron-key");
  store.writeSnapshot.mockReset().mockResolvedValue({ uploads: 0 });
  store.writeMarket.mockReset().mockResolvedValue({ added: 0, scans: 0 });
  store.prune.mockReset().mockResolvedValue(undefined);
});
const req = (auth = "Bearer synthetic-cron-key", query = "") =>
  new Request(`https://everloot.app/api/cron/snapshot${query}`, { headers: { authorization: auth } });
test("unauthorized cron cannot prune counters or rebuild", async () => {
  expect((await GET(req("wrong"))).status).toBe(401);
  expect(store.prune).not.toHaveBeenCalled();
  expect(store.writeSnapshot).not.toHaveBeenCalled();
  expect(store.writeMarket).not.toHaveBeenCalled();
});
test("authorized cron prunes stale counters after snapshot success", async () => {
  expect((await GET(req())).status).toBe(200);
  expect(store.prune).toHaveBeenCalledOnce();
});
test("quota cleanup failure is reported so stale storage cannot silently grow", async () => {
  store.prune.mockRejectedValue(new Error("quota database down"));
  expect((await GET(req())).status).toBe(500);
});
test("the market rollup runs with the snapshot and rebuilds with it", async () => {
  store.writeMarket.mockResolvedValue({ added: 2, scans: 5 });
  const body = await (await GET(req(undefined, "?rebuild=1"))).json();
  expect(body).toMatchObject({ ok: true, market: { added: 2, scans: 5 } });
  expect(store.writeMarket).toHaveBeenCalledWith({ rebuild: true });
});
test("a market failure is reported but does not block the corpus snapshot or cleanup", async () => {
  // Cleanup runs before the market step, so a market that times out cannot starve it.
  const order: string[] = [];
  store.prune.mockImplementation(async () => { order.push("prune"); });
  store.writeMarket.mockImplementation(async () => { order.push("market"); throw new Error("market down"); });
  const res = await GET(req());
  expect(order).toEqual(["prune", "market"]);
  expect(res.status).toBe(500);
  expect(store.writeSnapshot).toHaveBeenCalledOnce();
  expect(store.prune).toHaveBeenCalledOnce();
  expect(await res.json()).toMatchObject({ ok: false, error: "market rollup failed" });
});
