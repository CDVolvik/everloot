import { createHash, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const auth = vi.hoisted(() => ({ getUser: vi.fn(), authQuery: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser: auth.getUser, authQuery: auth.authQuery, siteUrl: () => "https://everloot.app" }));
const store = vi.hoisted(() => ({ loadCensus: vi.fn() }));
vi.mock("@/lib/upload-store", () => ({ uploadStore: { loadCensus: store.loadCensus } }));

import { POST } from "./route";
import { POST as MAKE_CODE } from "../link-codes/route";

const SECRET = "k".repeat(40);
const USER = { id: "11111111-2222-4333-8444-555555555555", name: "Thrall#1" };
const LINK_ID = "2b6f1c1e-3f43-4a4e-9a51-3d2a1f0c9e22";
const KEY = `evl_${"a".repeat(64)}`;
const GUID = "Player-4395-0A1B2C3D";
const row = {
  kind: "character_link", installId: "install-1234", capturedAt: "2026-10-21T18:00:00.000Z", eventId: "character_link:1", code: "el-7k3q-9p",
  name: "Thrallina", realm: "Forever Pioneer", race: "Orc", class: "SHAMAN", level: 24, faction: "Horde", guid: GUID, completionKey: "0a1b2c3d",
};

const send = (body: unknown, headers: Record<string, string> = { origin: "https://everloot.app" }) =>
  POST(new Request("https://everloot.app/api/me/characters/links", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  }));
const makeCode = (headers: Record<string, string> = { origin: "https://everloot.app" }) =>
  MAKE_CODE(new Request("https://everloot.app/api/me/characters/link-codes", { method: "POST", headers }));
const redeemed = (link_status: string) => [{ link_ref: LINK_ID, link_status, refusal: null }];
const refused = (refusal: string) => [{ link_ref: null, link_status: null, refusal }];
/** Every call the database saw, as text, so a test can say what never reached it. */
const sentToDatabase = () => JSON.stringify(auth.authQuery.mock.calls);

beforeEach(() => {
  vi.stubEnv("EVERLOOT_CHARACTER_LINKS", "1");
  vi.stubEnv("EVERLOOT_CHARACTER_KEY", SECRET);
  auth.getUser.mockReset().mockResolvedValue(USER);
  auth.authQuery.mockReset();
  store.loadCensus.mockReset().mockResolvedValue({ rows: [], dataAsOf: "2026-10-21T18:00:00.000Z" });
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("the switch", () => {
  test("off (anything but exactly 1), both endpoints are 404 and nothing is read or written", async () => {
    for (const value of ["", "0", "true", " 1"]) {
      vi.stubEnv("EVERLOOT_CHARACTER_LINKS", value);
      expect((await send({ records: [row] })).status).toBe(404);
      expect((await send({ records: [row] }, { authorization: `Bearer ${KEY}` })).status).toBe(404);
      expect((await makeCode()).status).toBe(404);
    }
    expect(auth.authQuery).not.toHaveBeenCalled();
    expect(auth.getUser).not.toHaveBeenCalled();
    expect(store.loadCensus).not.toHaveBeenCalled();
  });
});

describe("who may send", () => {
  test("a session write needs this site's Origin: another site or none is 403", async () => {
    expect((await send({ records: [row] }, { origin: "https://evil.example" })).status).toBe(403);
    expect((await send({ records: [row] }, {})).status).toBe(403);
    expect((await makeCode({ origin: "https://evil.example" })).status).toBe(403);
    expect((await makeCode({})).status).toBe(403);
    expect(auth.authQuery).not.toHaveBeenCalled();
  });

  test("signed out is 401 with where to sign in", async () => {
    auth.getUser.mockResolvedValue(null);
    const res = await send({ records: [row] });
    expect(res.status).toBe(401);
    expect((await res.json()).signIn).toBe("/sign-in?returnTo=%2Faccount");
    expect((await makeCode()).status).toBe(401);
  });

  test("a key needs link:own: without it 403, unknown or revoked 401, nothing redeemed", async () => {
    auth.authQuery.mockResolvedValueOnce([{ account: null, refusal: "no_scope" }]);
    expect((await send({ records: [row] }, { authorization: `Bearer ${KEY}` })).status).toBe(403);
    auth.authQuery.mockResolvedValueOnce([{ account: null, refusal: "unknown_key" }]);
    const unknown = await send({ records: [row] }, { authorization: `Bearer ${KEY}` });
    expect(unknown.status).toBe(401);
    expect(unknown.headers.get("www-authenticate")).toContain("invalid_token");
    expect(auth.authQuery.mock.calls.map((c) => c[0])).toEqual(["rpc/link_account_for_key", "rpc/link_account_for_key"]);
    expect(JSON.parse(auth.authQuery.mock.calls[0][1].body)).toEqual({ p_token_hash: createHash("sha256").update(KEY).digest("hex") });
  });

  test("a key with link:own links for its own account, with no Origin and no session", async () => {
    auth.authQuery.mockResolvedValueOnce([{ account: USER.id, refusal: null }]).mockResolvedValueOnce(redeemed("linked"));
    const res = await send({ records: [row] }, { authorization: `Bearer ${KEY}` });
    expect(res.status).toBe(200);
    expect((await res.json()).results[0].status).toBe("linked");
    expect(auth.getUser).not.toHaveBeenCalled();
    expect(JSON.parse(auth.authQuery.mock.calls[1][1].body).p_user_id).toBe(USER.id);
  });

  test("a key cannot make codes: only the signed-in site can", async () => {
    auth.getUser.mockResolvedValue(null);
    expect((await makeCode({ authorization: `Bearer ${KEY}` })).status).toBe(403);
    expect((await makeCode({ authorization: `Bearer ${KEY}`, origin: "https://everloot.app" })).status).toBe(401);
    expect(auth.authQuery).not.toHaveBeenCalled();
  });
});

describe("linking", () => {
  test("the GUID never reaches the database: it goes as HMAC(key, 'link:' + guid), with the code's hash", async () => {
    auth.authQuery.mockResolvedValueOnce(redeemed("linked"));
    const res = await send({ records: [row] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([{ index: 0, status: "linked", name: "Thrallina", realm: "Forever Pioneer", message: expect.stringContaining("private") }]);
    expect(auth.authQuery.mock.calls[0][0]).toBe("rpc/redeem_link");
    expect(JSON.parse(auth.authQuery.mock.calls[0][1].body)).toEqual({
      p_user_id: USER.id, p_code_hash: createHash("sha256").update("EL-7K3Q-9P").digest("hex"),
      p_link_key: createHmac("sha256", SECRET).update(`link:${GUID}`).digest("hex"), p_ruleset: "forever",
      p_realm: "Forever Pioneer", p_name: "Thrallina", p_race: "Orc", p_class: "SHAMAN", p_faction: "Horde", p_level: 24,
      p_completion_key: "0a1b2c3d", p_install_id: "install-1234",
    });
    for (const secret of [GUID, "0A1B2C3D", "Player-", "el-7k3q-9p", "EL-7K3Q-9P"]) expect(sentToDatabase()).not.toContain(secret);
    expect(JSON.stringify(body)).not.toContain(GUID);
  });

  test("a second account's claim comes back frozen", async () => {
    auth.authQuery.mockResolvedValueOnce(redeemed("frozen"));
    const body = await (await send({ records: [row] })).json();
    expect(body.results[0]).toMatchObject({ status: "frozen", message: expect.stringContaining("frozen on both accounts") });
  });

  test("expired, used, foreign and unknown codes, a hidden character and the limits are refused with a reason", async () => {
    const cases: Array<[string, RegExp]> = [
      ["code_expired", /expired/], ["code_used", /already used/], ["code_foreign", /not one of yours/], ["code_unknown", /not one of yours/],
      ["suppressed", /hide request/], ["name_linked", /Unlink it first/], ["link_limit", /50 linked characters/],
    ];
    for (const [refusal, message] of cases) {
      auth.authQuery.mockResolvedValueOnce(refused(refusal));
      const body = await (await send({ records: [row] })).json();
      expect(body.results[0], refusal).toEqual({ index: 0, status: "refused", message: expect.stringMatching(message) });
    }
  });

  test("a row the census knows as another race, class or faction is refused before the database is asked", async () => {
    const characterKey = createHmac("sha256", SECRET).update(GUID).digest("hex");
    store.loadCensus.mockResolvedValue({ rows: [{ kind: "census_self", characterKey, race: "Troll", class: "SHAMAN", faction: "Horde" }], dataAsOf: null });
    const body = await (await send({ records: [row] })).json();
    expect(body.results[0]).toMatchObject({ status: "refused", message: expect.stringContaining("census") });
    expect(auth.authQuery).not.toHaveBeenCalled();
  });

  test("when the census cannot be read, nothing is linked and the player can retry", async () => {
    store.loadCensus.mockResolvedValue({ rows: [], dataAsOf: null, unreachable: true });
    expect((await send({ records: [row] })).status).toBe(503);
    expect(auth.authQuery).not.toHaveBeenCalled();
  });

  test("without the character key (unset or short) nothing is linked", async () => {
    for (const value of ["", "short"]) {
      vi.stubEnv("EVERLOOT_CHARACTER_KEY", value);
      expect((await send({ records: [row] })).status).toBe(503);
    }
    expect(auth.authQuery).not.toHaveBeenCalled();
  });

  test("other kinds and malformed rows are refused one by one; an empty or oversized batch is a 400", async () => {
    auth.authQuery.mockResolvedValueOnce(redeemed("linked"));
    const body = await (await send({ records: [{ ...row, kind: "player_seen" }, { ...row, guid: "nope" }, row] })).json();
    expect(body.results.map((r: { status: string }) => r.status)).toEqual(["refused", "refused", "linked"]);
    expect(auth.authQuery).toHaveBeenCalledOnce();
    for (const bad of [{}, { records: [] }, { records: Array(11).fill(row) }, { records: "x" }]) expect((await send(bad)).status).toBe(400);
  });

  test("storage failing is a 503, never a false success", async () => {
    auth.authQuery.mockRejectedValueOnce(new Error("down"));
    expect((await send({ records: [row] })).status).toBe(503);
  });
});

describe("making a code", () => {
  test("a code is shown once and only its hash is sent; a taken hash is drawn again", async () => {
    auth.authQuery.mockResolvedValueOnce([{ code_expires_at: null, refusal: "code_taken" }])
      .mockResolvedValueOnce([{ code_expires_at: "2026-10-21T18:15:00+00:00", refusal: null }]);
    const res = await makeCode();
    expect(res.status).toBe(201);
    const { code, expiresAt } = await res.json();
    expect(code).toMatch(/^EL-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{2}$/);
    expect(expiresAt).toBe("2026-10-21T18:15:00.000Z");
    expect(auth.authQuery).toHaveBeenCalledTimes(2);
    const sent = JSON.parse(auth.authQuery.mock.calls[1][1].body);
    expect(sent).toEqual({ p_user_id: USER.id, p_code_hash: createHash("sha256").update(code).digest("hex") });
    expect(sentToDatabase()).not.toContain(code);
  });

  test("past 10 a day it is a 429", async () => {
    auth.authQuery.mockResolvedValueOnce([{ code_expires_at: null, refusal: "daily_limit" }]);
    const res = await makeCode();
    expect(res.status).toBe(429);
    expect((await res.json()).error).toContain("10 codes");
  });
});
