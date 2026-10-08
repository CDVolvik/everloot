import { beforeEach, expect, test, vi } from "vitest";
const store = vi.hoisted(() => ({ putUpload: vi.fn(), lookup: vi.fn() }));
vi.mock("@/lib/upload-store", () => ({ uploadStore: { putUpload: store.putUpload }, sharingStore: { lookup: store.lookup } }));
vi.mock("@/lib/intake-quota", () => ({ intakeQuota: { request: async () => ({ allowed: true, retryAfter: 0 }), install: async () => ({ allowed: true, retryAfter: 0 }) } }));
import { POST } from "./route";
const token = "a".repeat(64), tokenHash = "b".repeat(64);
const grant = { tokenHash, installId: "named-install", realm: "Moon Guard", subjectType: "character", subject: "Thrall",
  categories: ["gold"], expiresAt: "2099-01-01T00:00:00Z", revokedAt: null };
const gold = { kind: "gold_snapshot", installId: "named-install", eventId: "epoch:1", capturedAt: "2026-10-07T00:00:00Z",
  character: "Thrall", realm: "Moon Guard", currentCopper: 1, peakCopper: 1 };
const request = (extra = {}) => new Request("https://everloot.app/api/intake", { method: "POST", body: JSON.stringify({ addonVersion: "0.2.0", records: [gold], ...extra }) });
beforeEach(() => { store.putUpload.mockReset().mockResolvedValue(true); store.lookup.mockReset().mockResolvedValue(grant); });
test("an explicit category and current verified matching grant are both required", async () => {
  expect((await POST(request())).status).toBe(422);
  expect((await POST(request({ sharing: { gold: true } }))).status).toBe(422);
  expect(store.putUpload).not.toHaveBeenCalled();
  const response = await POST(request({ sharing: { gold: true }, grantTokens: [token], publicationGrants: ["forged"] }));
  expect(response.status).toBe(200);
  expect(store.putUpload).toHaveBeenCalledWith(expect.any(String), "named-install", { addonVersion: "0.2.0", records: [gold] }, [tokenHash]);
});
test("forged, expired and wrong-owner grants cannot publish names", async () => {
  for (const value of [null, { ...grant, revokedAt: "2026-10-07T00:00:00Z" }, { ...grant, expiresAt: "2020-01-01T00:00:00Z" }, { ...grant, subject: "Other" }]) {
    store.lookup.mockResolvedValue(value);
    expect((await POST(request({ sharing: { gold: true }, grantTokens: [token] }))).status).toBe(422);
  }
  expect(store.putUpload).not.toHaveBeenCalled();
});
test("streamed bytes are bounded even without Content-Length", async () => {
  const response = await POST(new Request("https://everloot.app/api/intake", { method: "POST", body: " ".repeat(1_000_001) }));
  expect(response.status).toBe(413);
  expect(store.putUpload).not.toHaveBeenCalled();
});
