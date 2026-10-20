import { afterEach, beforeEach, expect, test, vi } from "vitest";

const auth = vi.hoisted(() => ({ getUser: vi.fn(), authQuery: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser: auth.getUser, authQuery: auth.authQuery, siteUrl: () => "https://everloot.app" }));

import { POST as profile } from "./route";
import { POST as status } from "../status/route";
import { POST as mainCharacter } from "../main-character/route";
import { POST as activeCharacter } from "../active-character/route";
import { GET as shell } from "../shell/route";

const USER = { id: "11111111-2222-4333-8444-555555555555", name: "Thrall#1234" };
const JAINA = "2b6f1c1e-3f43-4a4e-9a51-3d2a1f0c9e22";
const PROFILE = { handle: "Thrall", displayName: "", publicProfile: true, showCharacters: true, showBuilds: false, showStatus: true };
const call = (path: string, body?: unknown, origin = "https://everloot.app") =>
  new Request(`https://everloot.app/api/me/${path}`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const writes = [
  () => profile(call("profile", PROFILE)),
  () => status(call("status", { text: "Raiding" })),
  () => mainCharacter(call("main-character", { characterId: JAINA })),
  () => activeCharacter(call("active-character", { characterId: JAINA })),
];

beforeEach(() => {
  vi.stubEnv("EVERLOOT_PROFILES", "1");
  auth.getUser.mockReset().mockResolvedValue(USER);
  auth.authQuery.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); });

test("with the switch off every route is a 404 and nothing is read", async () => {
  vi.stubEnv("EVERLOOT_PROFILES", "true");
  for (const write of writes) expect((await write()).status).toBe(404);
  expect((await shell()).status).toBe(404);
  expect(auth.getUser).not.toHaveBeenCalled();
  expect(auth.authQuery).not.toHaveBeenCalled();
});

test("signed out is a 401 with where to sign in; another site's write is a 403", async () => {
  auth.getUser.mockResolvedValue(null);
  for (const write of writes) {
    const res = await write();
    expect(res.status).toBe(401);
    expect((await res.json()).signIn).toBe("/sign-in?returnTo=%2Fsettings");
  }
  expect((await shell()).status).toBe(401);
  auth.getUser.mockResolvedValue(USER);
  expect((await profile(call("profile", PROFILE, "https://evil.example"))).status).toBe(403);
  expect((await activeCharacter(call("active-character", { characterId: JAINA }, "https://evil.example"))).status).toBe(403);
  // A write with no Origin is refused too.
  const bare = (path: string, body: unknown) => new Request(`https://everloot.app/api/me/${path}`, { method: "POST", body: JSON.stringify(body) });
  expect((await profile(bare("profile", PROFILE))).status).toBe(403);
  expect((await status(bare("status", { text: "x" }))).status).toBe(403);
  expect((await mainCharacter(bare("main-character", { characterId: JAINA }))).status).toBe(403);
  expect((await activeCharacter(bare("active-character", { characterId: JAINA }))).status).toBe(403);
  expect(auth.authQuery).not.toHaveBeenCalled();
});

test("the profile is saved under the signed-in account, lower case", async () => {
  auth.authQuery.mockResolvedValueOnce([{ refusal: null }]);
  const res = await profile(call("profile", PROFILE));
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  expect((await res.json()).profile).toMatchObject({ handle: "thrall", displayName: null, publicProfile: true, showBuilds: false });
  expect(auth.authQuery.mock.calls[0][0]).toBe("rpc/save_profile");
  expect(JSON.parse(auth.authQuery.mock.calls[0][1].body)).toEqual({
    p_user_id: USER.id, p_handle: "thrall", p_display_name: null, p_public: true, p_show_characters: true, p_show_builds: false, p_show_status: true,
  });
});

test("taken, reserved and too many changes say why; bad shapes are a 400 before the database", async () => {
  const refuse = (refusal: string) => auth.authQuery.mockResolvedValueOnce([{ refusal }]);
  refuse("handle_taken");
  const taken = await profile(call("profile", PROFILE));
  expect([taken.status, (await taken.json()).error]).toEqual([409, "That handle is taken. Pick another."]);
  refuse("handle_reserved");
  expect((await profile(call("profile", PROFILE))).status).toBe(409);
  refuse("handle_limit");
  const limited = await profile(call("profile", PROFILE));
  expect([limited.status, (await limited.json()).error]).toEqual([429, "You changed your handle 5 times today. Try again tomorrow."]);
  auth.authQuery.mockReset();
  for (const body of [{ ...PROFILE, handle: "ab" }, { ...PROFILE, handle: "admin" }, { ...PROFILE, handle: "", publicProfile: true }, { ...PROFILE, showStatus: "on" }]) {
    expect((await profile(call("profile", body))).status).toBe(400);
  }
  expect((await status(call("status", { text: "x".repeat(81) }))).status).toBe(400);
  expect((await status(call("status", { emoji: "🔥🔥" }))).status).toBe(400);
  expect((await mainCharacter(call("main-character", { characterId: "nope" }))).status).toBe(400);
  expect((await activeCharacter(call("active-character", {}))).status).toBe(400);
  expect((await activeCharacter(call("active-character"))).status).toBe(400);
  expect(auth.authQuery).not.toHaveBeenCalled();
});

test("status: set with a clear-after, and cleared when empty", async () => {
  auth.authQuery.mockResolvedValue(true);
  const clearsAt = new Date(Date.now() + 30 * 60_000).toISOString();
  const res = await status(call("status", { emoji: "🔥", text: "Raiding", clearsAt }));
  expect(await res.json()).toEqual({ status: { emoji: "🔥", text: "Raiding", clearsAt } });
  expect(JSON.parse(auth.authQuery.mock.calls[0][1].body)).toEqual({ p_user_id: USER.id, p_emoji: "🔥", p_text: "Raiding", p_clears_at: clearsAt });
  expect(await (await status(call("status", { emoji: "", text: "" }))).json()).toEqual({ status: null });
});

test("main and active character: the owner's only, null allowed", async () => {
  auth.authQuery.mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(true).mockResolvedValueOnce(true);
  expect(await (await activeCharacter(call("active-character", { characterId: JAINA }))).json()).toEqual({ activeCharacterId: JAINA });
  expect(auth.authQuery.mock.calls[0]).toEqual(["rpc/set_active_character", expect.objectContaining({ body: JSON.stringify({ p_user_id: USER.id, p_id: JAINA }) })]);
  expect((await activeCharacter(call("active-character", { characterId: JAINA }))).status).toBe(404);
  expect(await (await mainCharacter(call("main-character", { characterId: null }))).json()).toEqual({ mainCharacterId: null });
  expect(auth.authQuery.mock.calls[2][0]).toBe("rpc/set_main_character");
  expect((await mainCharacter(call("main-character", { characterId: JAINA }))).status).toBe(200);
});

test("the shell: profile, characters in name order, active falls back to main, never another account's", async () => {
  const thrall = "3b6f1c1e-3f43-4a4e-9a51-3d2a1f0c9e33";
  auth.authQuery.mockImplementation(async (path: string) => path.startsWith("user_profiles")
    ? [{ handle: "thrall", display_name: null, status_emoji: "🔥", status_text: "MC", status_clears_at: null, public_profile: true,
      show_characters: true, show_builds: true, show_status: true, main_character_id: thrall, active_character_id: "9b6f1c1e-3f43-4a4e-9a51-3d2a1f0c9e99" }]
    : [{ id: thrall, name: "thrall", class_slug: "warrior", realm: null, note: "secret" }, { id: JAINA, name: "Jaina", class_slug: "mage", realm: "Pioneer", note: null }]);
  const res = await shell();
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  expect(await res.json()).toEqual({
    userId: USER.id, name: "Thrall#1234", handle: "thrall", displayName: "Thrall", status: { emoji: "🔥", text: "MC", clearsAt: null },
    publicProfile: true,
    characters: [{ id: JAINA, name: "Jaina", classSlug: "mage", realm: "Pioneer" }, { id: thrall, name: "thrall", classSlug: "warrior", realm: null }],
    mainCharacterId: thrall, activeCharacterId: thrall,
  });
  for (const [path] of auth.authQuery.mock.calls) expect(path).toContain(`user_id=eq.${USER.id}`);
  // A player who never saved a profile gets the defaults.
  auth.authQuery.mockImplementation(async (path: string) => (path.startsWith("user_profiles") ? [] : []));
  expect(await (await shell()).json()).toMatchObject({ handle: null, displayName: "Thrall", status: null, publicProfile: false, mainCharacterId: null, activeCharacterId: null });
  auth.authQuery.mockRejectedValue(new Error("down"));
  expect((await shell()).status).toBe(503);
});
