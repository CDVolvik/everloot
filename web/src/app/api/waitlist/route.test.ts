import { beforeEach, expect, test, vi } from "vitest";

const deps = vi.hoisted(() => ({ request: vi.fn(), putWaitlist: vi.fn() }));
vi.mock("@/lib/intake-quota", () => ({ intakeQuota: { request: deps.request } }));
vi.mock("@/lib/upload-store", () => ({ uploadStore: { putWaitlist: deps.putWaitlist } }));

import { POST } from "./route";

const signup = (email = "Player@Example.com") =>
  new Request("https://everloot.app/api/waitlist", { method: "POST", body: JSON.stringify({ toolSlug: "auctions", email }) });

beforeEach(() => {
  deps.request.mockReset().mockResolvedValue({ allowed: true, retryAfter: 0 });
  deps.putWaitlist.mockReset().mockResolvedValue(true);
});

test("a signup passes the shared request quota before it is stored", async () => {
  const response = await POST(signup());
  expect(response.status).toBe(200);
  expect(deps.request).toHaveBeenCalledTimes(1);
  expect(deps.putWaitlist).toHaveBeenCalledWith(expect.objectContaining({ toolSlug: "auctions", email: "player@example.com" }));
});

test("a denied quota is 429 with retry-after and stores nothing", async () => {
  deps.request.mockResolvedValue({ allowed: false, retryAfter: 120 });
  const response = await POST(signup());
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("120");
  expect(deps.putWaitlist).not.toHaveBeenCalled();
});

test("quota storage failure fails closed and stores nothing", async () => {
  deps.request.mockRejectedValue(new Error("Quota storage unavailable"));
  const response = await POST(signup());
  expect(response.status).toBe(503);
  expect(deps.putWaitlist).not.toHaveBeenCalled();
});
