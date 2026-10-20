import { afterEach, beforeEach, expect, test, vi } from "vitest";

const auth = vi.hoisted(() => ({ getUser: vi.fn(), authQuery: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser: auth.getUser, authQuery: auth.authQuery, siteUrl: () => "https://everloot.app" }));

import { DELETE, GET, POST } from "./route";
import { cleanLabel, hashKey, KEY_PATTERN } from "@/lib/api-keys";

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
  auth.authQuery.mockResolvedValue([{ key_ref: KEY_ID, refusal: null }]);
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

test("with saved builds on, a key can also read its owner's builds; otherwise the call is unchanged", async () => {
  auth.authQuery.mockResolvedValue([{ key_ref: KEY_ID, refusal: null }]);
  await POST(call("POST", "", { label: "desktop", builds: true }));
  expect(JSON.parse(auth.authQuery.mock.calls[0][1].body)).not.toHaveProperty("p_scopes");
  vi.stubEnv("EVERLOOT_SAVED_BUILDS", "1");
  await POST(call("POST", "", { label: "desktop", builds: true }));
  expect(JSON.parse(auth.authQuery.mock.calls[1][1].body).p_scopes).toEqual(["read:public", "read:own"]);
  await POST(call("POST", "", { label: "bot", builds: "yes" }));
  expect(JSON.parse(auth.authQuery.mock.calls[2][1].body)).not.toHaveProperty("p_scopes");
  auth.authQuery.mockResolvedValue([]);
  expect(await (await GET(call("GET"))).json()).toMatchObject({ ownScope: true });
});

test("a sixth live key is refused, and so is an eleventh key made in one day", async () => {
  auth.authQuery.mockResolvedValue([{ key_ref: null, refusal: "live_limit" }]);
  const res = await POST(call("POST", "", {}));
  expect(res.status).toBe(409);
  expect((await res.json()).error).toContain("Revoke one first");
  auth.authQuery.mockResolvedValue([{ key_ref: null, refusal: "daily_limit" }]);
  const churn = await POST(call("POST", "", {}));
  expect(churn.status).toBe(429);
  expect((await churn.json()).error).toContain("10 keys in the last day");
  // An answer the database should never give is an error, not a key.
  auth.authQuery.mockResolvedValue([{ key_ref: null, refusal: null }]);
  expect((await POST(call("POST", "", {}))).status).toBe(503);
});

test("labels are cut at 60 whole characters, never inside an emoji", () => {
  const label = cleanLabel("🐉".repeat(70));
  expect(Array.from(label)).toHaveLength(60);
  expect(label).toBe("🐉".repeat(60));
  expect(cleanLabel("a".repeat(59) + "🐉🐉")).toBe("a".repeat(59) + "🐉");
  expect(cleanLabel(42)).toBe("");
});

test("a revoked key can be deleted with its counts; a live one must be revoked first", async () => {
  auth.authQuery.mockResolvedValueOnce([{ id: KEY_ID }]);
  expect((await DELETE(call("DELETE", `?id=${KEY_ID}&erase=1`))).status).toBe(200);
  const [path, init] = auth.authQuery.mock.calls[0];
  expect(init.method).toBe("DELETE");
  expect(path).toContain(`user_id=eq.${USER.id}`);
  expect(path).toContain("revoked_at=not.is.null");
  auth.authQuery.mockResolvedValueOnce([]);
  const live = await DELETE(call("DELETE", `?id=${KEY_ID}&erase=1`));
  expect(live.status).toBe(404);
  expect((await live.json()).error).toContain("Revoke it first");
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
