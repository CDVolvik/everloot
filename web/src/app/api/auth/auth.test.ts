import { createHash } from "node:crypto";
import { beforeEach, afterEach, expect, test, vi } from "vitest";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: () => ({
  get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined,
  getAll: () => [...jar].map(([name, value]) => ({ name, value })),
  set: (name: string, value: string) => jar.set(name, value),
  delete: (name: string) => jar.delete(name),
}) }));
const token = "a".repeat(64);
const digest = createHash("sha256").update(token).digest("hex");
const user = { id: "00000000-0000-4000-8000-000000000001", bnet_id: "123", battletag: "Player#1234" };

beforeEach(() => {
  jar.clear();
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-key");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://everloot.app");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test("me reads the custom session, checks expiry, and returns only public account fields", async () => {
  jar.set("everloot_session", token);
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    if (url.pathname.endsWith("/sessions") && url.searchParams.get("token_hash") === `eq.${digest}` && url.searchParams.has("expires_at")) {
      return Response.json([{ user_id: user.id }]);
    }
    if (url.pathname.endsWith("/users")) return Response.json([{ ...user, access_token_encrypted: "must-not-leak" }]);
    if (url.pathname.endsWith("/entitlements")) return Response.json([{ plan: "free", status: "active" }]);
    return Response.json([], { status: 400 });
  });
  const { GET } = await import("./me/route");
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ user: { ...user, entitlements: [{ plan: "free", status: "active" }] } });
  expect(response.headers.get("cache-control")).toContain("no-store");
});

test("expired or unknown custom session is anonymous", async () => {
  jar.set("everloot_session", token);
  vi.stubGlobal("fetch", async () => Response.json([]));
  const { GET } = await import("./me/route");
  expect(await (await GET()).json()).toEqual({ user: null });
});

test("logout revokes the presented session without depending on Supabase Auth cookies", async () => {
  jar.set("everloot_session", token);
  let revoked = false;
  vi.stubGlobal("fetch", async (input: string, init: RequestInit) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/sessions") && init.method === "DELETE" && url.searchParams.get("token_hash") === `eq.${digest}`) {
      revoked = true;
      return new Response(null, { status: 204 });
    }
    return Response.json([]);
  });
  const { POST } = await import("./logout/route");
  const response = await POST(new Request("https://everloot.app/api/auth/logout", { method: "POST", headers: { origin: "https://everloot.app" } }));
  expect(revoked).toBe(true);
  expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
});

test("authentication fails closed on database outage", async () => {
  jar.set("everloot_session", token);
  vi.stubGlobal("fetch", async () => Response.json({ error: "unreachable" }, { status: 503 }));
  const { GET } = await import("./me/route");
  expect((await GET()).status).toBe(503);
});

test("callback persists only a session hash and sets a cookie after the database accepts it", async () => {
  vi.stubEnv("BNET_CLIENT_ID", "client");
  vi.stubEnv("BNET_CLIENT_SECRET", "secret");
  jar.set("bnet_oauth_state", "state");
  const writes: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", async (input: string, init: RequestInit) => {
    if (input === "https://oauth.battle.net/token") return Response.json({ access_token: "provider-token" });
    if (input === "https://oauth.battle.net/userinfo") return Response.json({ sub: "123", battletag: user.battletag });
    writes.push(JSON.parse(init.body as string));
    return input.includes("/users?") ? Response.json([user]) : new Response(null, { status: 201 });
  });
  const { GET } = await import("./bnet/callback/route");
  const response = await GET(new Request("https://everloot.app/api/auth/bnet/callback?code=code&state=state"));
  const cookie = response.cookies.get("everloot_session")?.value;
  expect(cookie).toMatch(/^[a-f0-9]{64}$/);
  expect(writes[1].token_hash).toBe(createHash("sha256").update(cookie!).digest("hex"));
  expect(JSON.stringify(writes)).not.toContain("provider-token");
  expect(JSON.stringify(writes)).not.toContain(cookie!);
  expect(jar.has("bnet_oauth_state")).toBe(false);
});

test("callback does not create a browser session when storage fails", async () => {
  vi.stubEnv("BNET_CLIENT_ID", "client");
  vi.stubEnv("BNET_CLIENT_SECRET", "secret");
  jar.set("bnet_oauth_state", "state");
  vi.stubGlobal("fetch", async (input: string) => {
    if (input.endsWith("/token")) return Response.json({ access_token: "provider-token" });
    if (input.endsWith("/userinfo")) return Response.json({ sub: "123", battletag: user.battletag });
    return input.includes("/users?") ? Response.json([user]) : new Response(null, { status: 503 });
  });
  const { GET } = await import("./bnet/callback/route");
  const response = await GET(new Request("https://everloot.app/api/auth/bnet/callback?code=code&state=state"));
  expect(response.cookies.get("everloot_session")).toBeUndefined();
  expect(response.headers.get("location")).toContain("auth_error=callback_failed");
});

test("callback rejects mismatched state before contacting the provider", async () => {
  jar.set("bnet_oauth_state", "expected");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const { GET } = await import("./bnet/callback/route");
  const response = await GET(new Request("https://everloot.app/api/auth/bnet/callback?code=code&state=wrong"));
  expect(response.headers.get("location")).toContain("auth_error=invalid_state");
  expect(fetch).not.toHaveBeenCalled();
});
