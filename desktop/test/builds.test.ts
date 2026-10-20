import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { BUILDS_EVERY_MS, createBuildsSync, fetchBuilds, gameBuilds, renderBuildsAddon, writeBuildsAddon, type GameBuild } from "../src/main/builds";

const dirs: string[] = [];
const dir = () => { const d = mkdtempSync(join(tmpdir(), "everloot-builds-")); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const KEY = `evl_${"ab".repeat(32)}`;
const CODE = "EL1-mage-1482-1.60.1.70450-OTAwMDE6Miw5MDAwMjoxOjEsOTAwMDQ6Mg";
const CODE2 = "EL1-mage-0-1.60.1.70450-MToxLDI6MQ";
/** Text a player can type into a build name: quotes, a backslash, a newline, a long-bracket close, a comment opener, a control byte. */
const TRICKY = 'Fire "burst" |T \\ v2\n]] --[[ end\r\x01';

/** The site's answer, as GET /api/me/builds sends it. */
const answer = {
  characters: [
    { id: "c1", name: "Ærîn", classSlug: "mage", realm: "Nightslayer", note: null },
    { id: "c2", name: 'Quote"Bank', classSlug: "priest", realm: null, note: "alt" },
  ],
  builds: [
    { id: "b1", slug: "aaaaaaaa", name: "Leveling", notes: "first", classSlug: "mage", characterId: "c1", code: CODE, code2: null, gameBuild: "1.60.1.70450", shared: true, active: false, link: "https://everloot.app/b/aaaaaaaa", updatedAt: "2026-10-20T10:00:00.000Z" },
    { id: "b2", slug: "bbbbbbbb", name: TRICKY, notes: "never in the file", classSlug: "mage", characterId: "c1", code: CODE, code2: CODE2, gameBuild: "1.60.1.70450", shared: false, active: true, link: null, updatedAt: "2026-10-20T12:00:00.000Z" },
    { id: "b3", slug: "cccccccc", name: "No label", notes: null, classSlug: "mage", characterId: null, code: CODE, code2: "not a code", gameBuild: "1.60.1.70450", shared: true, active: false, link: null, updatedAt: "2026-10-19T08:00:00.000Z" },
    { id: "b4", slug: "dddddddd", name: "Broken", notes: null, classSlug: "mage", characterId: null, code: "EL1-mage-0-1.60.1-%%%", code2: null, gameBuild: "1.60.1", shared: true, active: false, link: null, updatedAt: "2026-10-21T08:00:00.000Z" },
  ],
};

test("builds are joined with their character labels, newest first, and a build the addon could not load is left out", () => {
  const builds = gameBuilds(answer);
  expect(builds.map((b) => b.name)).toEqual([TRICKY, "Leveling", "No label"]);
  expect(builds[0]).toEqual({ name: TRICKY, character: "Ærîn", class: "mage", code: CODE, code2: CODE2, active: true, gameBuild: "1.60.1.70450" });
  expect(builds[2]).toMatchObject({ character: null, code2: null });
  expect(JSON.stringify(builds)).not.toContain("never in the file");
  expect(() => gameBuilds({ characters: [] })).toThrow(/without builds/);
});

/** The golden file the addon's plan test loads in Lua 5.1 (addon/tests/plan_contract.py). */
const FIXTURE = new URL("../../addon/tests/fixtures/EverlootBuilds.lua", import.meta.url);
const FIXTURE_BUILDS: GameBuild[] = [
  { name: "Arcane leveling", character: "Aerin", class: "mage", code: CODE, code2: null, active: false, gameBuild: "1.60.1.70450" },
  { name: TRICKY, character: "aERIN", class: "mage", code: CODE, code2: CODE2, active: true, gameBuild: "1.60.1.70450" },
  { name: "Healer", character: "Aerin", class: "priest", code: "EL1-priest-0-1.60.1.70450-MToxLDI6MQ", code2: null, active: false, gameBuild: "1.60.1.70450" },
  { name: "Frost AoE", character: null, class: "mage", code: "EL1-mage-1482-1.59.0.69000-OTAwMDE6MQ", code2: null, active: false, gameBuild: "1.59.0.69000" },
  { name: "Alt's build", character: "Ærîn", class: "mage", code: CODE, code2: null, active: false, gameBuild: "1.60.1.70450" },
];

test("the slot addon: a TOC like the other two and one data file, every string escaped", () => {
  const { toc, lua } = renderBuildsAddon(FIXTURE_BUILDS, "2026-10-20T12:00:00.000Z");
  expect(toc).toContain("## Interface: 16001\n");
  expect(toc).toContain("## Title: Everloot Builds\n");
  expect(toc.trimEnd().endsWith("\ndata.lua")).toBe(true);
  expect(lua).toContain('EverlootBuildsData = {\n  version = 1,\n  syncedAt = "2026-10-20T12:00:00.000Z",');
  // The name stays one Lua string: the quote and backslash are escaped, the newline is \n, the control bytes are \ddd.
  expect(lua).toContain('name = "Fire \\"burst\\" |T \\\\ v2\\n]] --[[ end\\013\\001"');
  expect(lua).toContain('character = "Ærîn"');
  // No character label means no character field, and the second set only when there is one.
  expect(lua).toContain('{ name = "Frost AoE", class = "mage", code = ');
  expect(lua.match(/code2 = /g)).toHaveLength(1);
  if (process.env.EVERLOOT_WRITE_FIXTURES === "1") writeFileSync(FIXTURE, lua);
  expect(readFileSync(FIXTURE, "utf8").replace(/\r\n/g, "\n")).toBe(lua);
});

test("written through a temp file, and not written again when the builds are the same", () => {
  const addons = dir();
  const folder = join(addons, "EverlootBuilds");
  expect(writeBuildsAddon(addons, renderBuildsAddon(FIXTURE_BUILDS, "2026-10-20T12:00:00.000Z"))).toBe(true);
  expect(readdirSync(folder).sort()).toEqual(["EverlootBuilds.toc", "data.lua"]);
  const before = statSync(join(folder, "data.lua")).mtimeMs;
  writeFileSync(join(folder, "data.lua.tmp"), "stale");
  // A later sync with the same builds: nothing is written, the sync time in the file stays the earlier one.
  expect(writeBuildsAddon(addons, renderBuildsAddon(FIXTURE_BUILDS, "2026-10-20T12:15:00.000Z"))).toBe(false);
  expect(statSync(join(folder, "data.lua")).mtimeMs).toBe(before);
  expect(readFileSync(join(folder, "data.lua"), "utf8")).toContain("12:00:00.000Z");
  // A change rewrites it, and the rename takes the temp file's place.
  expect(writeBuildsAddon(addons, renderBuildsAddon(FIXTURE_BUILDS.slice(1), "2026-10-20T12:30:00.000Z"))).toBe(true);
  expect(readFileSync(join(folder, "data.lua"), "utf8")).not.toContain("Arcane leveling");
  expect(readdirSync(folder).sort()).toEqual(["EverlootBuilds.toc", "data.lua"]);
});

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

test("the request goes to /api/me/builds with the key as a bearer token, and each refusal says why", async () => {
  const send = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => json(200, answer));
  expect(await fetchBuilds("https://everloot.app/", KEY, send as unknown as typeof fetch)).toHaveLength(3);
  expect(String(send.mock.calls[0][0])).toBe("https://everloot.app/api/me/builds");
  expect((send.mock.calls[0][1]?.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);

  const refused = async (res: Response | Error) => {
    const s = vi.fn(async () => { if (res instanceof Error) throw res; return res; });
    return fetchBuilds("https://everloot.app", KEY, s as unknown as typeof fetch).then(() => null, (e: { kind: string; message: string; retryAfterMs: number }) => e);
  };
  expect(await refused(json(401, { error: "API key is not valid or was revoked" }))).toMatchObject({ kind: "error", message: expect.stringMatching(/does not know your key/) });
  expect(await refused(json(403, { error: "This key can't read your saved builds" }))).toMatchObject({ kind: "forbidden", message: "This key can't read your saved builds." });
  expect(await refused(json(404, { error: "Not found" }))).toMatchObject({ kind: "unavailable", message: "Saved builds aren't available yet." });
  expect(await refused(json(429, { error: "slow down" }, { "retry-after": "600" }))).toMatchObject({ kind: "error", retryAfterMs: 600_000, message: expect.stringMatching(/10 min/) });
  expect(await refused(new TypeError("fetch failed"))).toMatchObject({ kind: "error", message: expect.stringMatching(/Could not reach/) });
  expect(await refused(json(500, {}))).toMatchObject({ kind: "error", message: expect.stringMatching(/\(500\)/) });
});

function setup(options: { key?: boolean; gameFolder?: boolean; responses?: (Response | Error)[] } = {}) {
  const data = dir(), addons = join(dir(), "Interface", "AddOns");
  if (options.key !== false) { mkdirSync(data, { recursive: true }); writeFileSync(join(data, "everloot-key.txt"), `${KEY}\n`); }
  const queue = [...(options.responses ?? [])];
  const send = vi.fn(async () => { const r = queue.shift() ?? json(200, answer); if (r instanceof Error) throw r; return r; });
  const logs: string[] = [];
  let clock = new Date("2026-10-20T12:00:00.000Z");
  const sync = createBuildsSync({
    dataFolder: data, endpoint: () => "https://everloot.app", addonsDir: () => (options.gameFolder === false ? null : addons),
    ready: () => true, paused: () => false, onChange: () => {}, log: (level, text) => logs.push(`${level} ${text}`),
    send: send as unknown as typeof fetch, now: () => clock,
  });
  return { sync, send, logs, addons, advance: (ms: number) => { clock = new Date(clock.getTime() + ms); } };
}

test("a sync writes the slot addon and says when; without a key or a game folder nothing is asked", async () => {
  const t = setup();
  const status = await t.sync.sync();
  expect(status).toMatchObject({ state: "ok", syncedAt: "2026-10-20T12:00:00.000Z", builds: 3, message: "3 build(s) written" });
  expect(readFileSync(join(t.addons, "EverlootBuilds", "data.lua"), "utf8")).toContain('name = "Leveling", character = "Ærîn"');
  expect(t.logs).toEqual(["info builds: 3 saved build(s) written; /reload in game to see them"]);
  t.advance(BUILDS_EVERY_MS);
  expect(await t.sync.tick()).toMatchObject({ state: "ok", message: "3 build(s), no change" });

  const none = setup({ key: false });
  expect(await none.sync.sync()).toMatchObject({ state: "off" });
  expect(none.send).not.toHaveBeenCalled();
  const noFolder = setup({ gameFolder: false });
  expect(await noFolder.sync.sync()).toMatchObject({ state: "error", message: "Pick the game folder first." });
  expect(noFolder.send).not.toHaveBeenCalled();
});

test("a key without read:own shows the reason, a site with the switch off stays quiet, a 429 waits for Retry-After", async () => {
  const forbidden = setup({ responses: [json(403, { error: "This key can't read your saved builds" })] });
  expect(await forbidden.sync.sync()).toMatchObject({ state: "forbidden", syncedAt: null });
  expect(forbidden.logs).toEqual(["error builds: This key can't read your saved builds."]);
  expect(existsSync(join(forbidden.addons, "EverlootBuilds"))).toBe(false);

  const off = setup({ responses: [json(404, {})] });
  expect(await off.sync.sync()).toMatchObject({ state: "unavailable" });
  expect(off.logs).toEqual([]);

  const busy = setup({ responses: [json(429, {}, { "retry-after": "1800" })] });
  expect(await busy.sync.sync()).toMatchObject({ state: "error" });
  busy.advance(BUILDS_EVERY_MS);
  expect(busy.sync.tick()).toBeNull();
  busy.advance(BUILDS_EVERY_MS);
  expect(await busy.sync.tick()).toMatchObject({ state: "ok" });
  expect(busy.send).toHaveBeenCalledTimes(2);
});

test("a failed sync keeps the file the last one wrote; two calls at once make one request", async () => {
  const t = setup({ responses: [json(200, answer), new TypeError("offline")] });
  await t.sync.sync();
  const file = join(t.addons, "EverlootBuilds", "data.lua");
  const before = readFileSync(file, "utf8");
  expect(await t.sync.sync()).toMatchObject({ state: "error", syncedAt: "2026-10-20T12:00:00.000Z" });
  expect(readFileSync(file, "utf8")).toBe(before);

  const once = setup();
  const [a, b] = [once.sync.sync(), once.sync.sync()];
  expect(a).toBe(b);
  await a;
  expect(once.send).toHaveBeenCalledTimes(1);
});
