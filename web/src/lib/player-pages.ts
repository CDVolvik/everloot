import { UPLOAD_LIMITS, validPlayerName, type IntakeRecord } from "@everloot/protocol";

/**
 * Player pages: one current row per character, found by name (docs/design/specs/2026-10-20-player-pages-design.md).
 * Everything here is off until EVERLOOT_PLAYER_PAGES=1. With it unset, intake drops player rows, the opt-out
 * and the pages answer 404, and nothing reads or writes the players table.
 */

export type PlayerRow = Extract<IntakeRecord, { kind: "player_seen" }>;

export function isPlayerRow(row: IntakeRecord): row is PlayerRow {
  return row.kind === "player_seen";
}

/** The owner's switch for collecting, storing and showing named player rows. */
export function playerPagesOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.EVERLOOT_PLAYER_PAGES === "1";
}

/**
 * A second switch, so turning the pages on does not also hand names to search engines: pages carry `noindex`
 * until EVERLOOT_PLAYER_PAGES_INDEX=1.
 */
export function playerIndexingOn(env: Record<string, string | undefined> = process.env): boolean {
  return playerPagesOn(env) && env.EVERLOOT_PLAYER_PAGES_INDEX === "1";
}

/**
 * The ruleset a realm belongs to. Forever's realm names are not confirmed (census design §6, step 4), so every
 * realm is "forever" until the launch-day check says how realms map to rulesets and regions.
 */
export const DEFAULT_RULESET = "forever";
export function rulesetOf(_realm: string): string {
  return DEFAULT_RULESET;
}

/** A player row may be dated at most this far back, and one day ahead, of the server's clock. */
export const PLAYER_DAYS_BACK = 30;

/** Why a row's date cannot be trusted, or null. The date comes from the player's clock. */
export function playerDateProblem(capturedAt: string, now: Date): string | null {
  const at = Date.parse(capturedAt);
  const day = 86_400_000;
  if (!Number.isFinite(at) || at > now.getTime() + day || at < now.getTime() - PLAYER_DAYS_BACK * day) {
    return `A player row must be dated within ${PLAYER_DAYS_BACK} days back and 1 day ahead of the server's time.`;
  }
  return null;
}

/** What the table stores for one row: the UTC day only (never the time), and never a day after today. */
export interface PlayerUpsert { name: string; realm: string; race: string; class: string; level: number; guild?: string; seen: string }

export function playerUpsert(row: PlayerRow, now: Date): PlayerUpsert {
  const seen = new Date(Math.min(Date.parse(row.capturedAt), now.getTime())).toISOString().slice(0, 10);
  return { name: row.name, realm: row.realm.trim(), race: row.race, class: row.class, level: row.level, ...(row.guild ? { guild: row.guild } : {}), seen };
}

export const PLAYERS_PER_UPLOAD = UPLOAD_LIMITS.playersPerUpload;

/** A stored player, as the pages read it. */
export interface Player { name: string; realm: string; ruleset: string; race: string; class: string; level: number; guild: string | null; lastSeen: string }

/** The realm as the page address spells it: lower case, spaces as hyphens. */
export function realmSlug(realm: string): string {
  return realm.trim().toLowerCase().replace(/\s+/g, "-");
}

export function playerPath(p: Pick<Player, "ruleset" | "realm" | "name">): string {
  return `/players/${p.ruleset}/${encodeURIComponent(realmSlug(p.realm))}/${encodeURIComponent(p.name.toLowerCase())}`;
}

/** The letters of a search the form may run: a name prefix of 2 to 12 letters, or null when it is not one. */
export function searchPrefix(q: unknown): string | null {
  if (typeof q !== "string") return null;
  const prefix = q.trim();
  return validPlayerName(prefix) ? prefix : null;
}

export const OPT_OUT_PATH = "/players/opt-out";
export function optOutPath(p: Pick<Player, "realm" | "name">): string {
  return `${OPT_OUT_PATH}?realm=${encodeURIComponent(p.realm)}&name=${encodeURIComponent(p.name)}`;
}
