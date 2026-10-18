import { createHash, createHmac } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { memoryAdapter } from "better-auth/adapters/memory";
import { authV2Enabled, createAuth } from "./auth";
import type { RateLimitStore } from "./db";

afterEach(() => vi.unstubAllGlobals());

const env = {
  NODE_ENV: "test",
  BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters",
  BETTER_AUTH_URL: "https://everloot.app",
  BNET_CLIENT_ID: "client",
  BNET_CLIENT_SECRET: "secret",
} as NodeJS.ProcessEnv;

// Battle.net's discovery document advertises id-token signing, so the plugin treats it as OIDC.
const discovery = {
  issuer: "https://oauth.battle.net",
  authorization_endpoint: "https://oauth.battle.net/authorize",
  token_endpoint: "https://oauth.battle.net/token",
  userinfo_endpoint: "https://oauth.battle.net/userinfo",
  jwks_uri: "https://oauth.battle.net/jwks/certs",
  id_token_signing_alg_values_supported: ["RS256"],
};

type Userinfo = () => Response | Promise<Response>;
const thrall: Userinfo = () => Response.json({ sub: "123", id: 123, battletag: "Thrall#1" });

function stubBattlenet(userinfo: Userinfo) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://oauth.battle.net/.well-known/openid-configuration") return Response.json(discovery);
    // Only an access token: with no id_token there is nothing to verify against the JWKS.
    if (url.startsWith(discovery.token_endpoint)) return Response.json({ access_token: "at", token_type: "bearer", expires_in: 86400 });
    if (url.startsWith(discovery.userinfo_endpoint)) return userinfo();
    throw new Error(`Unexpected fetch: ${url}`);
  }));
}

// Same contract as pgRateLimitStore: a fixed window that starts at the first request.
function mapRateLimitStore() {
  const store = new Map<string, { count: number; lastRequest: number }>();
  const rateLimitStore: RateLimitStore = {
    async consume(key, { window, max }) {
      const now = Date.now();
      const row = store.get(key);
      const next = !row || now - row.lastRequest >= window * 1000
        ? { count: 1, lastRequest: now }
        : { count: row.count + 1, lastRequest: row.lastRequest };
      store.set(key, next);
      if (next.count <= max) return { allowed: true, retryAfter: null };
      return { allowed: false, retryAfter: Math.ceil((next.lastRequest + window * 1000 - now) / 1000) };
    },
  };
  return { store, rateLimitStore };
}

type Row = Record<string, unknown>;

function startSignIn(auth: ReturnType<typeof createAuth>, headers: Record<string, string> = {}) {
  return auth.handler(new Request("https://everloot.app/api/auth/sign-in/social", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://everloot.app", ...headers },
    body: JSON.stringify({ provider: "battlenet", callbackURL: "/" }),
  }));
}

function cookieHeader(response: Response) {
  return response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

async function signInWithBattlenet(options: {
  seed?: { users?: Row[]; auth_account?: Row[] };
  userinfo?: Userinfo;
} = {}) {
  stubBattlenet(options.userinfo ?? thrall);
  const db: Record<string, Row[]> = {
    users: [...options.seed?.users ?? []],
    auth_session: [],
    auth_account: [...options.seed?.auth_account ?? []],
    auth_verification: [],
  };
  const { store, rateLimitStore } = mapRateLimitStore();
  const auth = createAuth({ database: memoryAdapter(db), rateLimitStore, env });
  const start = await startSignIn(auth);
  const { url } = await start.json() as { url: string };
  const state = new URL(url).searchParams.get("state");
  const response = await auth.handler(new Request(
    `https://everloot.app/api/auth/callback/battlenet?code=c&state=${encodeURIComponent(state ?? "")}`,
    { headers: { cookie: cookieHeader(start) } },
  ));
  const cookies = response.headers.getSetCookie().join("\n");
  return { cookies, db, store, response };
}

test("a Battle.net sign-in creates a session cookie and stores no provider tokens", async () => {
  const { cookies, db } = await signInWithBattlenet();
  expect(cookies).toMatch(/everloot\.session_token=/);
  // The memory adapter keeps rows under their database column names, as Postgres will.
  expect(db.auth_account[0]).toMatchObject({ provider_id: "battlenet", account_id: "123", access_token: null, refresh_token: null, id_token: null });
  expect(db.auth_session[0]).toMatchObject({ ip_address: null, user_agent: null });
});

const LEGACY_ID = "5f0c1f0e-6b7a-4c53-9a1e-0d4f4b2f9a11";
const legacyUser = {
  id: LEGACY_ID, name: "Thrall#1", email: "bnet-123@users.everloot.invalid",
  email_verified: false, created_at: new Date("2025-01-01"), updated_at: new Date("2025-01-01"),
};
// What the migration's backfill gives a Battle.net user, with provider tokens a legacy row could still hold.
const legacyAccount = {
  id: "a-legacy-account", user_id: LEGACY_ID, provider_id: "battlenet", account_id: "123",
  access_token: "old-at", refresh_token: "old-rt", id_token: "old-it",
  created_at: new Date("2025-01-01"), updated_at: new Date("2025-01-01"),
};

test("a legacy Battle.net account keeps its id on sign-in and its provider tokens are cleared", async () => {
  const { db } = await signInWithBattlenet({ seed: { users: [legacyUser], auth_account: [{ ...legacyAccount }] } });
  expect(db.auth_session).toHaveLength(1);
  expect(db.auth_session[0].user_id).toBe(LEGACY_ID);
  expect(db.users).toHaveLength(1);
  expect(db.auth_account).toHaveLength(1);
  expect(db.auth_account[0]).toMatchObject({ user_id: LEGACY_ID, access_token: null, refresh_token: null, id_token: null });
});

test("a legacy account is never linked by an unverified placeholder email", async () => {
  // A users row with no auth_account row: the placeholder email must not be enough to claim it.
  const { cookies, db, response } = await signInWithBattlenet({ seed: { users: [legacyUser] } });
  expect(response.headers.get("location")).toContain("error=account_not_linked");
  expect(cookies).not.toMatch(/session_token=/);
  expect(db.auth_session).toEqual([]);
  expect(db.users).toHaveLength(1);
  expect(db.auth_account).toEqual([]);
});

test.each([
  ["answers 500", () => new Response("nope", { status: 500 })],
  ["is unreachable", () => { throw new TypeError("fetch failed"); }],
] as [string, Userinfo][])("when Battle.net userinfo %s, no user or session is created", async (_, userinfo) => {
  const { cookies, db } = await signInWithBattlenet({ userinfo });
  expect(cookies).not.toMatch(/session_token=/);
  expect(db.users).toEqual([]);
  expect(db.auth_account).toEqual([]);
  expect(db.auth_session).toEqual([]);
});

test("rate-limit keys are an HMAC under the auth secret, never the address or its plain hash", async () => {
  stubBattlenet(thrall);
  const { store, rateLimitStore } = mapRateLimitStore();
  const db = { users: [], auth_session: [], auth_account: [], auth_verification: [] };
  const auth = createAuth({ database: memoryAdapter(db), rateLimitStore, env });
  const statuses: number[] = [];
  for (let i = 0; i < 5; i++) statuses.push((await startSignIn(auth, { "x-forwarded-for": "203.0.113.9" })).status);
  expect(statuses).toEqual([200, 200, 200, 429, 429]);
  const raw = "203.0.113.9|/sign-in/social";
  // Without the secret, anyone could hash every IPv4 address and read the table back.
  expect([...store.keys()]).toEqual([createHmac("sha256", env.BETTER_AUTH_SECRET ?? "").update(raw).digest("hex")]);
  expect(store.has(createHash("sha256").update(raw).digest("hex"))).toBe(false);
  expect(JSON.stringify([...store])).not.toContain("203.0.113.9");
});

test("the limiter keys on the Vercel client address first, so a forged or multi-valued X-Forwarded-For shares nothing", async () => {
  stubBattlenet(thrall);
  const { rateLimitStore } = mapRateLimitStore();
  const db = { users: [], auth_session: [], auth_account: [], auth_verification: [] };
  const auth = createAuth({ database: memoryAdapter(db), rateLimitStore, env });
  const statuses: number[] = [];
  // One caller rotating X-Forwarded-For (sometimes a chain) is still one caller.
  for (const xff of ["198.51.100.1", "198.51.100.2", "198.51.100.3, 10.0.0.1", "198.51.100.4"]) {
    statuses.push((await startSignIn(auth, { "x-vercel-forwarded-for": "203.0.113.9", "x-forwarded-for": xff })).status);
  }
  expect(statuses).toEqual([200, 200, 200, 429]);
  // A different caller behind the same proxy chain gets its own bucket.
  expect((await startSignIn(auth, { "x-vercel-forwarded-for": "203.0.113.10", "x-forwarded-for": "198.51.100.3, 10.0.0.1" })).status).toBe(200);
});

test("an empty BETTER_AUTH_URL falls back to the site URL", async () => {
  stubBattlenet(thrall);
  const db = { users: [], auth_session: [], auth_account: [], auth_verification: [] };
  const auth = createAuth({ database: memoryAdapter(db), rateLimitStore: mapRateLimitStore().rateLimitStore, env: { ...env, BETTER_AUTH_URL: " " } });
  const response = await startSignIn(auth);
  expect(response.status).toBe(200);
  const { url } = await response.json() as { url: string };
  expect(new URL(url).searchParams.get("redirect_uri")).toBe("https://everloot.app/api/auth/callback/battlenet");
});

test("a sign-in start keeps its state in a cookie and writes no database row", async () => {
  stubBattlenet(thrall);
  const db = { users: [], auth_session: [], auth_account: [], auth_verification: [] };
  const auth = createAuth({ database: memoryAdapter(db), rateLimitStore: mapRateLimitStore().rateLimitStore, env });
  const response = await startSignIn(auth);
  expect(response.status).toBe(200);
  expect(response.headers.getSetCookie().join(";")).toMatch(/everloot.oauth_state=/);
  expect(db.auth_verification).toEqual([]);
});

test("Battle.net is not offered unless both its client id and secret are set", async () => {
  stubBattlenet(thrall);
  const db = { users: [], auth_session: [], auth_account: [], auth_verification: [] };
  const { rateLimitStore } = mapRateLimitStore();
  const auth = createAuth({ database: memoryAdapter(db), rateLimitStore, env: { ...env, BNET_CLIENT_SECRET: " " } });
  const response = await startSignIn(auth);
  expect(response.status).toBe(404);
});

test("authV2Enabled is only on for exactly 1", () => {
  expect(authV2Enabled({ EVERLOOT_AUTH_V2: "1" })).toBe(true);
  expect(authV2Enabled({ EVERLOOT_AUTH_V2: "true" })).toBe(false);
  expect(authV2Enabled({})).toBe(false);
});
