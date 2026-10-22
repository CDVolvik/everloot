import { beforeEach, expect, test, vi } from "vitest";
const store = vi.hoisted(() => ({ snapshotWork: vi.fn(), writeCronRun: vi.fn(), writeSnapshot: vi.fn(), writeMarket: vi.fn(), writeCompletion: vi.fn(), prune: vi.fn() }));
vi.mock("@/lib/upload-store", () => ({ uploadStore: { snapshotWork: store.snapshotWork, writeCronRun: store.writeCronRun, writeSnapshot: store.writeSnapshot, writeMarket: store.writeMarket, writeCompletion: store.writeCompletion },
  sharingStore: { loadState: async () => ({ grants: [], suppressions: [] }) },
}));
vi.mock("@/lib/intake-quota", () => ({ intakeQuota: { prune: store.prune } }));
const keys = vi.hoisted(() => ({ pruneKeys: vi.fn() }));
vi.mock("@/lib/api-keys", () => ({ pruneKeys: keys.pruneKeys }));
const players = vi.hoisted(() => ({ prune: vi.fn() }));
vi.mock("@/lib/player-store", () => ({ playerStore: () => ({ prune: players.prune }) }));
const coverage = vi.hoisted(() => ({ writeCoverage: vi.fn() }));
vi.mock("@/lib/coverage-store", () => ({ writeCoverage: coverage.writeCoverage }));
import { GET } from "./route";
beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "synthetic-cron-key");
  store.snapshotWork.mockReset().mockResolvedValue({ idle: false, retryRollups: false });
  store.writeCronRun.mockReset().mockResolvedValue(undefined);
  store.writeSnapshot.mockReset().mockResolvedValue({ uploads: 0 });
  store.writeMarket.mockReset().mockResolvedValue({ added: 0, scans: 0 });
  store.writeCompletion.mockReset().mockResolvedValue({ added: 0, remaining: 0, trimmed: 0, rebuilding: false });
  store.prune.mockReset().mockResolvedValue(undefined);
  keys.pruneKeys.mockReset().mockResolvedValue(undefined);
  players.prune.mockReset().mockResolvedValue(undefined);
  coverage.writeCoverage.mockReset().mockResolvedValue({ written: false });
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

test("an idle run skips corpus and completion, day-gates market, and heartbeats", async () => {
  store.snapshotWork.mockResolvedValue({ idle: true, retryRollups: false, dataAsOf: "2026-10-01" });
  expect((await GET(req())).status).toBe(200);
  expect(store.writeSnapshot).not.toHaveBeenCalled();
  expect(store.writeCompletion).not.toHaveBeenCalled();
  expect(store.writeMarket).toHaveBeenCalledWith({ idle: true });
  expect(store.writeCronRun).toHaveBeenCalledWith(false, "2026-10-01");
  expect(store.prune).toHaveBeenCalledOnce();
});

test("the coverage score is written after a snapshot that changed, dated by the snapshot, and never on an idle run", async () => {
  store.snapshotWork.mockResolvedValue({ idle: true, retryRollups: false, dataAsOf: "2026-10-01" });
  expect(await (await GET(req())).json()).toMatchObject({ ok: true, coverage: { written: false } });
  expect(coverage.writeCoverage).not.toHaveBeenCalled();
  store.snapshotWork.mockResolvedValue({ idle: false, retryRollups: false, dataAsOf: "2026-10-01" });
  store.writeSnapshot.mockResolvedValue({ uploads: 9, added: 2, dataAsOf: "2026-10-02T00:00:00.000Z" });
  coverage.writeCoverage.mockResolvedValue({ written: true });
  expect(await (await GET(req())).json()).toMatchObject({ ok: true, coverage: { written: true } });
  expect(coverage.writeCoverage).toHaveBeenCalledWith({ added: 2, rebuild: false, dataAsOf: "2026-10-02T00:00:00.000Z" });
  expect(store.writeCronRun).toHaveBeenLastCalledWith(false, "2026-10-02T00:00:00.000Z");
});

test("a coverage failure is logged and the run, its heartbeat included, still succeeds", async () => {
  store.writeSnapshot.mockResolvedValue({ uploads: 9, added: 1, dataAsOf: "2026-10-02T00:00:00.000Z" });
  coverage.writeCoverage.mockRejectedValue(new Error("r2 down"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  const res = await GET(req());
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, coverage: null });
  expect(store.writeCronRun).toHaveBeenCalledOnce();
});

test("idle does not strand rollups left behind by failure or a bounded completion batch", async () => {
  store.snapshotWork.mockResolvedValue({ idle: true, retryRollups: true, dataAsOf: "2026-10-01" });
  store.writeCompletion.mockResolvedValue({ added: 1, remaining: 2, trimmed: 0, rebuilding: false });
  expect((await GET(req())).status).toBe(200);
  expect(store.writeSnapshot).not.toHaveBeenCalled();
  expect(store.writeMarket).toHaveBeenCalledWith({ rebuild: false });
  expect(store.writeCompletion).toHaveBeenCalledOnce();
  expect(store.writeCronRun).toHaveBeenCalledWith(true, "2026-10-01");
});

test("an explicit rebuild bypasses idle and a failed run never advances the heartbeat", async () => {
  store.snapshotWork.mockResolvedValue({ idle: true, retryRollups: false });
  store.writeMarket.mockRejectedValue(new Error("down"));
  expect((await GET(req(undefined, "?rebuild=1"))).status).toBe(500);
  expect(store.writeSnapshot).toHaveBeenCalledWith({ rebuild: true });
  expect(store.writeCronRun).not.toHaveBeenCalled();
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
test("the completion rollup runs after the market, rebuilds with it, and a failure is reported", async () => {
  store.writeCompletion.mockResolvedValue({ added: 3, remaining: 7, trimmed: 0, rebuilding: true });
  const body = await (await GET(req(undefined, "?rebuild=1"))).json();
  expect(body).toMatchObject({ ok: true, completion: { added: 3, remaining: 7, rebuilding: true } });
  expect(store.writeCompletion).toHaveBeenCalledWith({ rebuild: true, authority: expect.any(Function) });
  store.writeCompletion.mockRejectedValue(new Error("completion down"));
  const res = await GET(req());
  expect(res.status).toBe(500);
  expect(await res.json()).toMatchObject({ ok: false, error: "completion rollup failed" });
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

test("key retention runs only once the data guard is on, and its failure does not fail the snapshot", async () => {
  vi.stubEnv("EVERLOOT_DATA_GUARD", "");
  expect((await GET(req())).status).toBe(200);
  expect(keys.pruneKeys).not.toHaveBeenCalled();
  vi.stubEnv("EVERLOOT_DATA_GUARD", "1");
  expect((await GET(req())).status).toBe(200);
  expect(keys.pruneKeys).toHaveBeenCalledOnce();
  keys.pruneKeys.mockRejectedValue(new Error("down"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect((await GET(req())).status).toBe(200);
  vi.stubEnv("EVERLOOT_DATA_GUARD", "");
});
test("player rows are pruned only with the player pages on, and a failure does not fail the run", async () => {
  expect((await GET(req())).status).toBe(200);
  expect(players.prune).not.toHaveBeenCalled();
  vi.stubEnv("EVERLOOT_PLAYER_PAGES", "1");
  players.prune.mockRejectedValue(new Error("players down"));
  expect((await GET(req())).status).toBe(200);
  expect(players.prune).toHaveBeenCalledOnce();
  vi.unstubAllEnvs();
});
