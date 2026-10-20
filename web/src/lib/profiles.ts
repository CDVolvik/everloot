import type { AccountStatus } from "./account-shell-types";

/**
 * Profiles (docs/design/specs/2026-10-20-account-shell-design.md): a handle, a status, a main and an active
 * character, and an opt-in public profile. Off until EVERLOOT_PROFILES=1; with it unset /home, /settings and
 * /u/<handle> answer 404 and `/` is the landing page for everyone.
 *
 * No imports with side effects, so the middleware, the pages and the forms can all use these checks. The database
 * checks the same rules again (supabase/migrations/20261021170000_account_profiles.sql).
 */
export function profilesOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.EVERLOOT_PROFILES === "1";
}

/** Set by the middleware on `/` rewritten to /home, so /home knows not to send a stale session back to `/`. */
export const HOME_REWRITE_HEADER = "x-everloot-home";

/** Dispatched on window after a write that changes the shell (status, profile, main or active character). */
export const SHELL_CHANGED_EVENT = "everloot:shell-changed";
export const shellChanged = () => window.dispatchEvent(new Event(SHELL_CHANGED_EVENT));

export const PROFILE_LIMITS = { handleMin: 3, handleMax: 24, displayName: 40, statusText: 80, emojiBytes: 16 } as const;
export const HANDLE_CHANGES_PER_DAY = 5;
export const HANDLE_PATTERN = /^[a-z0-9][a-z0-9-]{1,22}[a-z0-9]$/;
/** Kept in step with the list in save_profile. */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  "about", "account", "admin", "administrator", "api", "auth", "b", "blizzard", "chat", "docs",
  "everloot", "help", "home", "me", "mod", "moderator", "null", "official", "privacy", "root", "security",
  "settings", "sign-in", "sign-up", "staff", "support", "system", "terms", "u", "undefined", "www",
]);
/** The longest a status may last: "this week" from a Monday morning, with room for the clock. */
export const STATUS_MAX_MS = 8 * 24 * 60 * 60 * 1000;

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const validCharacterId = (id: unknown): id is string => typeof id === "string" && ID_PATTERN.test(id);

/** `{characterId}` of the main and active character routes: an id, or null for none; undefined when malformed or missing. */
export function characterChoice(body: unknown): string | null | undefined {
  if (!body || typeof body !== "object" || !("characterId" in body)) return undefined;
  const id = (body as { characterId: unknown }).characterId;
  return id === null || validCharacterId(id) ? id : undefined;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** Characters as Postgres counts them. */
const length = (s: string) => Array.from(s).length;
const clean = (value: unknown): string | null => {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
};

/** The handle as stored (lower case), or why it cannot be one. */
export function checkHandle(value: string): Parsed<string> {
  const handle = value.trim().toLowerCase();
  if (!HANDLE_PATTERN.test(handle)) {
    return { ok: false, error: "A handle is 3 to 24 letters, numbers or hyphens, and starts and ends with a letter or number." };
  }
  if (RESERVED_HANDLES.has(handle)) return { ok: false, error: "That handle is reserved. Pick another." };
  return { ok: true, value: handle };
}

export interface ProfileInput {
  handle: string | null;
  displayName: string | null;
  publicProfile: boolean;
  showCharacters: boolean;
  showBuilds: boolean;
  showStatus: boolean;
}

/** The body of POST /api/me/profile. */
export function parseProfileInput(body: unknown): Parsed<ProfileInput> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const rawHandle = clean(b.handle);
  if (rawHandle === null) return { ok: false, error: "That handle is not valid." };
  let handle: string | null = null;
  if (rawHandle) {
    const checked = checkHandle(rawHandle.replace(/^@/, ""));
    if (!checked.ok) return checked;
    handle = checked.value;
  }
  const displayName = clean(b.displayName);
  if (displayName === null || length(displayName) > PROFILE_LIMITS.displayName) {
    return { ok: false, error: `A display name can be up to ${PROFILE_LIMITS.displayName} characters.` };
  }
  const flags = [b.publicProfile, b.showCharacters, b.showBuilds, b.showStatus];
  if (flags.some((f) => typeof f !== "boolean")) return { ok: false, error: "publicProfile, showCharacters, showBuilds and showStatus are true or false." };
  if (b.publicProfile && !handle) return { ok: false, error: "Choose a handle before you make your profile public." };
  return {
    ok: true,
    value: {
      handle, displayName: displayName || null, publicProfile: b.publicProfile as boolean,
      showCharacters: b.showCharacters as boolean, showBuilds: b.showBuilds as boolean, showStatus: b.showStatus as boolean,
    },
  };
}

const PICTOGRAPH = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

/** One emoji: a single grapheme that draws as a picture, of at most 16 bytes. */
export function validEmoji(value: string): boolean {
  if (!value || /\s/.test(value) || new TextEncoder().encode(value).length > PROFILE_LIMITS.emojiBytes) return false;
  const graphemes = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(value)];
  return graphemes.length === 1 && PICTOGRAPH.test(value);
}

export interface StatusInput { emoji: string | null; text: string | null; clearsAt: string | null }

/** The body of POST /api/me/status. No emoji and no text clears the status. */
export function parseStatusInput(body: unknown, now = Date.now()): Parsed<StatusInput> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const emoji = clean(b.emoji);
  if (emoji === null || (emoji && !validEmoji(emoji))) return { ok: false, error: "A status takes one emoji." };
  const text = clean(b.text);
  if (text === null || length(text) > PROFILE_LIMITS.statusText) {
    return { ok: false, error: `A status can be up to ${PROFILE_LIMITS.statusText} characters.` };
  }
  let clearsAt: string | null = null;
  if (b.clearsAt !== undefined && b.clearsAt !== null) {
    const at = typeof b.clearsAt === "string" ? Date.parse(b.clearsAt) : NaN;
    if (!Number.isFinite(at) || at <= now || at > now + STATUS_MAX_MS) return { ok: false, error: "Pick when the status clears: within the next week." };
    clearsAt = new Date(at).toISOString();
  }
  if (!emoji && !text) return { ok: true, value: { emoji: null, text: null, clearsAt: null } };
  return { ok: true, value: { emoji: emoji || null, text: text || null, clearsAt } };
}

export const CLEAR_AFTER = [
  { value: "never", label: "Never" },
  { value: "30m", label: "30 minutes" },
  { value: "4h", label: "4 hours" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
] as const;
export type ClearAfter = (typeof CLEAR_AFTER)[number]["value"];

/** When a status picked now clears, in the browser's own time: today ends at midnight, the week on Sunday night. */
export function clearsAtFor(choice: ClearAfter, now: Date): Date | null {
  switch (choice) {
    case "never": return null;
    case "30m": return new Date(now.getTime() + 30 * 60_000);
    case "4h": return new Date(now.getTime() + 4 * 60 * 60_000);
    case "today": return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    case "week": {
      const daysToMonday = ((8 - now.getDay()) % 7) || 7;
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToMonday);
    }
  }
}

/** A stored status as the shell shows it: none when empty or past its clear-after time. */
export function liveStatus(row: { status_emoji: string | null; status_text: string | null; status_clears_at: string | null }, now = Date.now()): AccountStatus | null {
  if (!row.status_emoji && !row.status_text) return null;
  if (row.status_clears_at && Date.parse(row.status_clears_at) <= now) return null;
  return { emoji: row.status_emoji, text: row.status_text ?? "", clearsAt: row.status_clears_at ? new Date(row.status_clears_at).toISOString() : null };
}

/** The account name without a BattleTag's number: "Thrall#1234" is "Thrall". */
export const shortName = (name: string) => name.replace(/#\d+$/, "").trim() || name;

/** "Good morning" before noon, "Good afternoon" until six, then "Good evening". */
export function greeting(hour: number): string {
  return hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** What the Ask box puts in Chat's question box: the question, then who the player is on and that character's builds. */
export function askPrefill(
  question: string,
  character: { name: string; classSlug: string; realm: string | null } | null,
  builds: { name: string; slug: string; active: boolean }[] = [],
): string {
  const q = question.trim();
  if (!character) return q.slice(0, 2000);
  const cls = character.classSlug.charAt(0).toUpperCase() + character.classSlug.slice(1);
  const who = `I'm playing ${character.name}, a ${cls}${character.realm ? ` on ${character.realm}` : ""}.`;
  const saved = builds.length
    ? ` My saved builds for ${character.name}: ${builds.slice(0, 10).map((b) => `${b.name} (${b.slug}${b.active ? ", active" : ""})`).join(", ")}.`
    : "";
  return [q, `${who}${saved}`].filter(Boolean).join("\n\n").slice(0, 2000);
}
