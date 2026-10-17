import { afterEach, beforeEach, expect, test, vi } from "vitest";

const auth = vi.hoisted(() => ({ getUser: vi.fn(), authQuery: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser: auth.getUser, authQuery: auth.authQuery, siteUrl: () => "https://everloot.app" }));

import { DELETE, GET, POST } from "./route";
import { hashKey, KEY_PATTERN } from "@/lib/api-keys";

const USER = { id: "11111111-2222-4333-8444-555555555555", bnet_id: "1", battletag: "Thrall#1" };
const KEY_ID = "0b6f1c1e-3f43-4a4e-9a51-3d2a1f0c9e11";
const call = (method: string, query = "", body?: object, origin = "https://everloot.app") =>
  new Request(`https://everloot.app/api/keys${query}`, { method, headers: { origin, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

beforeEach(() => {
  vi.stubEnv("EVERLOOT_DATA_GUARD", "1");
  auth.getUser.mockReset().mockResolvedValue(USER);
  auth.authQuery.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); });

test("nothing works until the data guard is on", async () => {
  vi.stubEnv("EVERLOOT_DATA_GUARD", "");
  for (const res of [await GET(call("GET")), await POST(call("POST", "", {})), await DELETE(call("DELETE", `?id=${KEY_ID}`))]) {
    expect(res.status).toBe(503);
  }
  expect(auth.authQuery).not.toHaveBeenCalled();
});

test("keys need a Battle.net sign-in", async () => {
  auth.getUser.mockResolvedValue(null);
  const res = await GET(call("GET"));
  expect(res.status).toBe(401);
  expect(await res.json()).toMatchObject({ signIn: "/api/auth/bnet" });
});

test("making a key shows it once and stores only its hash, under the signed-in account", async () => {
  auth.authQuery.mockResolvedValue(KEY_ID);
  const res = await POST(call("POST", "", { label: "  my\u0007 bot  " }));
  expect(res.status).toBe(201);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  const made = await res.json();
  expect(made.token).toMatch(KEY_PATTERN);
  expect(made).toMatchObject({ ok: true, id: KEY_ID, hint: made.token.slice(-4) });
  const [path, init] = auth.authQuery.mock.calls[0];
  expect(path).toBe("rpc/create_api_key");
  expect(JSON.parse(init.body)).toEqual({ p_user_id: USER.id, p_token_hash: hashKey(made.token), p_hint: made.token.slice(-4), p_label: "my bot" });
  expect(init.body).not.toContain(made.token);
});

test("a sixth live key is refused", async () => {
  auth.authQuery.mockResolvedValue(null);
  const res = await POST(call("POST", "", {}));
  expect(res.status).toBe(409);
  expect((await res.json()).error).toContain("Revoke one first");
});

test("another site cannot make or revoke keys with the visitor's cookie", async () => {
  expect((await POST(call("POST", "", {}, "https://evil.example"))).status).toBe(403);
  expect((await DELETE(call("DELETE", `?id=${KEY_ID}`, undefined, "https://evil.example"))).status).toBe(403);
  expect(auth.authQuery).not.toHaveBeenCalled();
});

test("the list shows the account's own keys only", async () => {
  auth.authQuery.mockResolvedValue([{ id: KEY_ID, hint: "abcd", label: "", scopes: ["read:public"], created_at: "2026-10-19T00:00:00Z", last_used_at: null, revoked_at: null, expires_at: null }]);
  const body = await (await GET(call("GET"))).json();
  expect(body).toMatchObject({ ok: true, limit: 5, keys: [{ id: KEY_ID, hint: "abcd" }] });
  expect(auth.authQuery.mock.calls[0][0]).toContain(`user_id=eq.${USER.id}`);
  expect(auth.authQuery.mock.calls[0][0]).not.toContain("token_hash");
});

test("revoking marks the key revoked for this account only; a key that is not theirs is a 404", async () => {
  auth.authQuery.mockResolvedValueOnce([{ id: KEY_ID }]);
  expect((await DELETE(call("DELETE", `?id=${KEY_ID}`))).status).toBe(200);
  const [path, init] = auth.authQuery.mock.calls[0];
  expect(path).toContain(`id=eq.${KEY_ID}`);
  expect(path).toContain(`user_id=eq.${USER.id}`);
  expect(path).toContain("revoked_at=is.null");
  expect(init.method).toBe("PATCH");
  expect(Object.keys(JSON.parse(init.body))).toEqual(["revoked_at"]);
  auth.authQuery.mockResolvedValueOnce([]);
  expect((await DELETE(call("DELETE", `?id=${KEY_ID}`))).status).toBe(404);
  expect((await DELETE(call("DELETE", "?id=not-a-uuid"))).status).toBe(400);
});

test("storage trouble is a 503, never a silent success", async () => {
  auth.authQuery.mockRejectedValue(new Error("down"));
  expect((await POST(call("POST", "", {}))).status).toBe(503);
  expect((await GET(call("GET"))).status).toBe(503);
});
