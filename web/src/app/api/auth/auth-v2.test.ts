import { afterEach, beforeEach, expect, test, vi } from "vitest";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const v2 = vi.hoisted(() => ({
  enabled: true,
  fake: {
    handler: vi.fn(),
    api: { getSession: vi.fn(), signOut: vi.fn() },
  },
}));
vi.mock("@/lib/auth/auth", () => ({ authV2Enabled: () => v2.enabled, getAuth: () => v2.fake }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "everloot.session_token=t" }) }));

import { GET as meGET } from "./me/route";
import { GET as bnetGET } from "./bnet/route";
import { POST as logoutPOST } from "./logout/route";
import { GET as allGET, POST as allPOST } from "./[...all]/route";

beforeEach(() => {
  v2.enabled = true;
  v2.fake.handler.mockReset();
  Object.values(v2.fake.api).forEach((fn) => fn.mockReset());
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-key");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://everloot.app");
  vi.stubEnv("BNET_CLIENT_ID", "client");
  vi.stubEnv("BNET_CLIENT_SECRET", "secret");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test("v2 me returns id and name from the Better Auth session", async () => {
  v2.fake.api.getSession.mockResolvedValue({ user: { id: USER_ID, name: "Thrall#1", email: "bnet-1@users.everloot.invalid" } });
  vi.stubGlobal("fetch", async () => Response.json([]));
  const response = await meGET();
  expect(await response.json()).toEqual({ user: { id: USER_ID, name: "Thrall#1", entitlements: [] } });
  expect(v2.fake.api.getSession.mock.calls[0][0].headers.get("cookie")).toContain("everloot.session_token");
});

test("v2 me is anonymous without a session", async () => {
  v2.fake.api.getSession.mockResolvedValue(null);
  expect(await (await meGET()).json()).toEqual({ user: null });
});

test("v2 fails closed when the database is down", async () => {
  v2.fake.api.getSession.mockRejectedValue(new Error("ECONNREFUSED"));
  expect((await meGET()).status).toBe(503);
});

test("v2 bnet start goes through the router with the caller address, so the rate limiter sees it", async () => {
  const headers = new Headers({ "content-type": "application/json" });
  headers.append("set-cookie", "everloot.oauth_state=s; Path=/; HttpOnly");
  headers.append("set-cookie", "everloot.other=o; Path=/; HttpOnly");
  v2.fake.handler.mockResolvedValue(
    new Response(JSON.stringify({ url: "https://oauth.battle.net/authorize?x=1", redirect: true }), { headers }),
  );
  const res = await bnetGET(new Request("https://everloot.app/api/auth/bnet", {
    headers: {
      "x-vercel-forwarded-for": "203.0.113.9", "x-forwarded-for": "203.0.113.9", "x-real-ip": "203.0.113.9",
      cookie: "a=b", "x-ignored": "1",
    },
  }));
  expect(res.headers.get("location")).toBe("https://oauth.battle.net/authorize?x=1");
  expect(res.headers.getSetCookie()).toEqual(["everloot.oauth_state=s; Path=/; HttpOnly", "everloot.other=o; Path=/; HttpOnly"]);
  const forwarded = v2.fake.handler.mock.calls[0][0] as Request;
  expect(forwarded.method).toBe("POST");
  expect(forwarded.url).toBe("https://everloot.app/api/auth/sign-in/social");
  expect(Object.fromEntries(forwarded.headers)).toEqual({
    "content-type": "application/json", origin: "https://everloot.app",
    "x-vercel-forwarded-for": "203.0.113.9", "x-forwarded-for": "203.0.113.9", "x-real-ip": "203.0.113.9", cookie: "a=b",
  });
  expect(await forwarded.json()).toEqual({ provider: "battlenet", callbackURL: "/" });
});

test("v2 bnet start ignores an empty BETTER_AUTH_URL and uses the site URL", async () => {
  vi.stubEnv("BETTER_AUTH_URL", " ");
  v2.fake.handler.mockResolvedValue(Response.json({ url: "https://oauth.battle.net/authorize?x=1", redirect: true }));
  await bnetGET(new Request("https://everloot.app/api/auth/bnet"));
  expect((v2.fake.handler.mock.calls[0][0] as Request).url).toBe("https://everloot.app/api/auth/sign-in/social");
});

test("v2 bnet start passes a refusal through instead of redirecting", async () => {
  v2.fake.handler.mockResolvedValue(Response.json({ message: "Too many requests" }, { status: 429 }));
  const res = await bnetGET(new Request("https://everloot.app/api/auth/bnet"));
  expect(res.status).toBe(429);
  expect(res.headers.get("location")).toBeNull();
});

test("v2 bnet start is 503 until Battle.net is configured", async () => {
  vi.stubEnv("BNET_CLIENT_SECRET", "");
  const res = await bnetGET(new Request("https://everloot.app/api/auth/bnet"));
  expect(res.status).toBe(503);
  expect(v2.fake.handler).not.toHaveBeenCalled();
});

test("v2 logout signs out through Better Auth and refuses other origins", async () => {
  const headers = new Headers();
  headers.append("set-cookie", "everloot.session_token=; Max-Age=0; Path=/");
  v2.fake.api.signOut.mockResolvedValue(new Response(JSON.stringify({ success: true }), { headers }));
  const send = (origin: string) =>
    logoutPOST(new Request("https://everloot.app/api/auth/logout", { method: "POST", headers: { origin } }));

  expect((await send("https://evil.example")).status).toBe(403);
  expect(v2.fake.api.signOut).not.toHaveBeenCalled();

  const res = await send("https://everloot.app");
  expect(await res.json()).toEqual({ ok: true });
  expect(res.headers.getSetCookie()).toEqual(["everloot.session_token=; Max-Age=0; Path=/"]);
});

test("v2 logout fails closed when sign-out errors", async () => {
  v2.fake.api.signOut.mockRejectedValue(new Error("ECONNREFUSED"));
  const res = await logoutPOST(new Request("https://everloot.app/api/auth/logout", { method: "POST" }));
  expect(res.status).toBe(503);
});

test("the catch-all route hands only the Battle.net callback and the error page to Better Auth", async () => {
  v2.fake.handler.mockImplementation(async () => new Response("handled"));
  for (const path of ["/api/auth/callback/battlenet?code=c&state=s", "/api/auth/error?error=state_mismatch"]) {
    expect(await (await allGET(new Request(`https://everloot.app${path}`))).text()).toBe("handled");
  }
  expect(v2.fake.handler).toHaveBeenCalledTimes(2);
});

test.each([
  ["GET", "/api/auth/get-session"],
  ["POST", "/api/auth/update-user"],
  ["POST", "/api/auth/sign-in/social"],
  ["POST", "/api/auth/sign-out"],
  ["GET", "/api/auth/list-accounts"],
  ["POST", "/api/auth/callback/battlenet"],
  ["GET", "/api/auth/callback/github"],
  ["GET", "/api/auth/anything-at-all"],
])("the catch-all route answers %s %s with 404 and never reaches Better Auth", async (method, path) => {
  const request = new Request(`https://everloot.app${path}`, { method });
  const response = await (method === "GET" ? allGET : allPOST)(request);
  expect(response.status).toBe(404);
  expect(v2.fake.handler).not.toHaveBeenCalled();
});

test("with the flag off the catch-all route is 404", async () => {
  v2.enabled = false;
  const request = new Request("https://everloot.app/api/auth/callback/battlenet");
  expect((await allGET(request)).status).toBe(404);
  expect((await allPOST(request)).status).toBe(404);
  expect(v2.fake.handler).not.toHaveBeenCalled();
});
