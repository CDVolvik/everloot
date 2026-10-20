import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { INTERFACE } from "../../../companion/src/bridge/answers";
import { luaString } from "../../../companion/src/bridge/lua";
import type { BuildsStatus } from "../shared/types";
import { readAccountKey } from "./account";

/**
 * The player's saved talent builds into the game: read from everloot.app/api/me/builds with the
 * account key (it needs the "Read my saved builds" permission) and written into the EverlootBuilds
 * slot addon, which `/everloot plan` lists after the next /reload. Nothing goes the other way.
 * Design: docs/design/specs/2026-10-20-saved-builds-design.md, "Desktop App and addon (step 2)".
 */

export const BUILDS_ADDON = "EverlootBuilds";
export const BUILDS_DATA = "data.lua";
/** How often the app syncs while it runs. */
export const BUILDS_EVERY_MS = 15 * 60 * 1000;
/** The site's caps: 200 builds per account, names up to 60 characters, codes up to 400. */
const MAX_BUILDS = 200;
const MAX_NAME = 60;
const MAX_CHARACTER = 24;
const MAX_CODE = 400;
/** The share code's shape, as the site's save_build checks it. */
const CODE = /^EL1-[a-z]+-\d+-[0-9.]+-[A-Za-z0-9_-]+$/;

/** One build as the file carries it: what the addon needs to list it and load it, nothing more. */
export interface GameBuild { name: string; character: string | null; class: string; code: string; code2: string | null; active: boolean; gameBuild: string }

const str = (v: unknown): v is string => typeof v === "string";
const clip = (s: string, n: number) => [...s].slice(0, n).join("");

/**
 * The builds from the site's answer, joined with their character labels. Anything malformed is left
 * out rather than failing the sync: a build the addon could not load is no use in the game.
 */
export function gameBuilds(body: unknown): GameBuild[] {
  const b = (body && typeof body === "object" ? body : {}) as { characters?: unknown; builds?: unknown };
  if (!Array.isArray(b.builds)) throw new Error("everloot.app sent an answer without builds");
  const labels = new Map<string, string>();
  for (const c of Array.isArray(b.characters) ? b.characters : []) {
    const { id, name } = (c ?? {}) as { id?: unknown; name?: unknown };
    if (str(id) && str(name) && name.trim()) labels.set(id, clip(name.trim(), MAX_CHARACTER));
  }
  const rows = (b.builds as unknown[]).flatMap((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    if (!str(r.name) || !str(r.classSlug) || !str(r.code) || !str(r.gameBuild)) return [];
    if (r.code.length > MAX_CODE || !CODE.test(r.code)) return [];
    const code2 = str(r.code2) && r.code2.length <= MAX_CODE && CODE.test(r.code2) ? r.code2 : null;
    const build: GameBuild = {
      name: clip(r.name.trim(), MAX_NAME) || "Untitled build",
      character: str(r.characterId) ? labels.get(r.characterId) ?? null : null,
      class: r.classSlug.toLowerCase(),
      code: r.code,
      code2,
      active: r.active === true,
      gameBuild: r.gameBuild,
    };
    return [{ build, updatedAt: str(r.updatedAt) ? r.updatedAt : "" }];
  });
  // Newest first, so the numbers in game start with what the player worked on last.
  rows.sort((x, y) => (x.updatedAt < y.updatedAt ? 1 : x.updatedAt > y.updatedAt ? -1 : 0));
  return rows.slice(0, MAX_BUILDS).map((r) => r.build);
}

/** The slot addon: a TOC and `data.lua`, which sets the one global `EverlootBuildsData`. Every string goes through luaString. */
export function renderBuildsAddon(builds: GameBuild[], syncedAt: string): { toc: string; lua: string } {
  const toc = [
    `## Interface: ${INTERFACE}`,
    "## Title: Everloot Builds",
    "## Notes: Written by the Everloot Desktop App. Your saved talent builds, listed by /everloot plan after /reload.",
    "## Author: Everloot",
    "",
    BUILDS_DATA,
    "",
  ].join("\n");
  const rows = builds.map((b) => {
    const fields = [
      `name = ${luaString(b.name)}`,
      b.character !== null ? `character = ${luaString(b.character)}` : null,
      `class = ${luaString(b.class)}`,
      `code = ${luaString(b.code)}`,
      b.code2 !== null ? `code2 = ${luaString(b.code2)}` : null,
      `active = ${b.active ? "true" : "false"}`,
      `gameBuild = ${luaString(b.gameBuild)}`,
    ].filter((f) => f !== null);
    return `    { ${fields.join(", ")} },`;
  });
  const lua = [
    "-- Written by the Everloot Desktop App. Do not edit: the next sync replaces this file.",
    "EverlootBuildsData = {",
    "  version = 1,",
    `  syncedAt = ${luaString(syncedAt)},`,
    "  builds = {",
    ...rows,
    "  },",
    "}",
    "",
  ].join("\n");
  return { toc, lua };
}

/** The file without its sync time, so a sync that brings the same builds is seen as no change. */
const withoutTime = (lua: string) => lua.replace(/^ {2}syncedAt = .*$/m, "");

/**
 * Writes the slot addon, each file through a temp file and a rename, so the game never loads half a
 * file. A file whose content is already there is not written again. Returns whether anything changed.
 */
export function writeBuildsAddon(addonsDir: string, rendered: { toc: string; lua: string }): boolean {
  const dir = join(addonsDir, BUILDS_ADDON);
  const read = (name: string) => { try { return readFileSync(join(dir, name), "utf8"); } catch { return null; } };
  const files: [string, string, (s: string) => string][] = [
    [`${BUILDS_ADDON}.toc`, rendered.toc, (s) => s],
    [BUILDS_DATA, rendered.lua, withoutTime],
  ];
  let changed = false;
  for (const [name, text, same] of files) {
    const old = read(name);
    if (old !== null && same(old) === same(text)) continue;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${name}.tmp`), text);
    renameSync(join(dir, `${name}.tmp`), join(dir, name));
    changed = true;
  }
  return changed;
}

/** Why a sync did not write anything, in words the page shows as they are. */
export class BuildsError extends Error {
  constructor(readonly kind: Exclude<BuildsStatus["state"], "off" | "running" | "ok">, message: string, readonly retryAfterMs = 0) { super(message); }
}

/** GET /api/me/builds with the key. Only this request carries it. */
export async function fetchBuilds(endpoint: string, key: string, send: typeof fetch = fetch): Promise<GameBuild[]> {
  let res: Response;
  try {
    res = await send(`${endpoint.replace(/\/$/, "")}/api/me/builds`, {
      headers: { authorization: `Bearer ${key}`, accept: "application/json", "user-agent": "everloot-desktop" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new BuildsError("error", "Could not reach everloot.app to sync your builds. Trying again later.");
  }
  if (res.status === 401) throw new BuildsError("error", "everloot.app does not know your key, or it was revoked. Paste a new one under Settings > Account.");
  if (res.status === 403) throw new BuildsError("forbidden", "This key can't read your saved builds.");
  if (res.status === 404) throw new BuildsError("unavailable", "Saved builds aren't available yet.");
  if (res.status === 429) {
    const seconds = Number(res.headers.get("retry-after"));
    const wait = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : BUILDS_EVERY_MS;
    throw new BuildsError("error", `Your key has used its requests for now. Trying again in ${Math.max(1, Math.round(wait / 60_000))} min.`, wait);
  }
  if (!res.ok) throw new BuildsError("error", `everloot.app could not send your builds (${res.status}). Trying again later.`);
  let body: unknown;
  try { body = await res.json(); } catch { throw new BuildsError("error", "everloot.app sent an answer the app could not read."); }
  try { return gameBuilds(body); } catch (err) { throw new BuildsError("error", err instanceof Error ? err.message : String(err)); }
}

export interface BuildsSyncOptions {
  dataFolder: string;
  endpoint(): string;
  /** Interface/AddOns, or null before a game folder is set. */
  addonsDir(): string | null;
  /** Nothing runs before the player pressed Start; the timer also skips while the app is paused. */
  ready(): boolean;
  paused(): boolean;
  onChange(): void;
  log(level: "info" | "error", text: string): void;
  send?: typeof fetch;
  now?: () => Date;
}

/** The sync: on demand, after a key is saved, and every 15 minutes from `start`. Never without a key. */
export function createBuildsSync(o: BuildsSyncOptions) {
  const now = o.now ?? (() => new Date());
  let status: BuildsStatus = { state: "off", message: "", syncedAt: null, builds: null };
  let running: Promise<BuildsStatus> | null = null;
  let notBefore = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  const set = (next: Partial<BuildsStatus>) => { status = { ...status, ...next }; o.onChange(); };

  async function run(): Promise<BuildsStatus> {
    const key = readAccountKey(o.dataFolder);
    if (!key) { set({ state: "off", message: "" }); return status; }
    const dir = o.addonsDir();
    if (!dir) { set({ state: "error", message: "Pick the game folder first." }); return status; }
    set({ state: "running", message: "Syncing…" });
    try {
      const builds = await fetchBuilds(o.endpoint(), key, o.send);
      const at = now().toISOString();
      const changed = writeBuildsAddon(dir, renderBuildsAddon(builds, at));
      notBefore = 0;
      set({ state: "ok", message: changed ? `${builds.length} build(s) written` : `${builds.length} build(s), no change`, syncedAt: at, builds: builds.length });
      if (changed) o.log("info", `builds: ${builds.length} saved build(s) written; /reload in game to see them`);
    } catch (err) {
      const e = err instanceof BuildsError ? err : new BuildsError("error", `Could not write the builds file: ${err instanceof Error ? err.message : String(err)}`);
      notBefore = e.retryAfterMs ? now().getTime() + e.retryAfterMs : 0;
      set({ state: e.kind, message: e.message });
      // "Not available yet" is the site's switch being off: quiet, not an error in the log.
      if (e.kind !== "unavailable") o.log("error", `builds: ${e.message}`);
    }
    return status;
  }

  const sync = (): Promise<BuildsStatus> => {
    running ??= run().finally(() => { running = null; });
    return running;
  };

  /** The timer's turn: skipped before Start, while paused, and until a 429's Retry-After has passed. */
  const tick = (): Promise<BuildsStatus> | null => {
    if (!o.ready() || o.paused() || now().getTime() < notBefore) return null;
    return sync();
  };

  return {
    status: () => status,
    sync,
    tick,
    /** After a sign-out: back to off; the file in the game stays until the next sync. */
    reset() { notBefore = 0; set({ state: "off", message: "", syncedAt: null, builds: null }); },
    start() { timer ??= setInterval(() => { void tick(); }, BUILDS_EVERY_MS); },
    stop() { if (timer) clearInterval(timer); timer = null; },
  };
}
