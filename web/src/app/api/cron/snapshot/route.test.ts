import { beforeEach, expect, test, vi } from "vitest";
const store = vi.hoisted(() => ({ writeSnapshot: vi.fn(), prune: vi.fn() }));
vi.mock("@/lib/upload-store", () => ({ uploadStore: { writeSnapshot: store.writeSnapshot } }));
vi.mock("@/lib/intake-quota", () => ({ intakeQuota: { prune: store.prune } }));
import { GET } from "./route";
beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "synthetic-cron-key");
  store.writeSnapshot.mockReset().mockResolvedValue({ uploads: 0 });
  store.prune.mockReset().mockResolvedValue(undefined);
});
const req = (auth = "Bearer synthetic-cron-key") => new Request("https://everloot.app/api/cron/snapshot", { headers: { authorization: auth } });
test("unauthorized cron cannot prune counters or rebuild", async () => {
  expect((await GET(req("wrong"))).status).toBe(401);
  expect(store.prune).not.toHaveBeenCalled();
  expect(store.writeSnapshot).not.toHaveBeenCalled();
});
test("authorized cron prunes stale counters after snapshot success", async () => {
  expect((await GET(req())).status).toBe(200);
  expect(store.prune).toHaveBeenCalledOnce();
});
test("quota cleanup failure is reported so stale storage cannot silently grow", async () => {
  store.prune.mockRejectedValue(new Error("quota database down"));
  expect((await GET(req())).status).toBe(500);
});
