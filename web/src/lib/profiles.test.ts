import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import {
  askPrefill, checkHandle, clearsAtFor, greeting, liveStatus, parseProfileInput, parseStatusInput, profilesOn,
  RESERVED_HANDLES, SHELL_CHANGED_EVENT, shellChanged, shortName, validEmoji,
} from "./profiles";

const migration = readFileSync(new URL("../../../supabase/migrations/20261021170000_account_profiles.sql", import.meta.url), "utf8");
const profile = (over: object = {}) => ({ handle: "thrall", displayName: "", publicProfile: false, showCharacters: true, showBuilds: true, showStatus: true, ...over });

test("the switch is on only for the exact value 1", () => {
  expect(profilesOn({ EVERLOOT_PROFILES: "1" })).toBe(true);
  for (const value of [undefined, "", "0", "true", " 1"]) expect(profilesOn({ EVERLOOT_PROFILES: value })).toBe(false);
});

test("a handle is 3-24 letters, numbers and hyphens, not at either end, stored lower case", () => {
  expect(checkHandle(" Thrall-1 ")).toEqual({ ok: true, value: "thrall-1" });
  expect(checkHandle("abc")).toEqual({ ok: true, value: "abc" });
  expect(checkHandle("a".repeat(24)).ok).toBe(true);
  for (const bad of ["ab", "a".repeat(25), "-thrall", "thrall-", "thr all", "thrall_1", "thrâll", "th.rall"]) expect(checkHandle(bad).ok).toBe(false);
});

test("reserved handles are refused, and the list is the one save_profile holds", () => {
  for (const name of ["admin", "Everloot", "support", "api", "me", "settings", "sign-in"]) {
    const result = checkHandle(name);
    expect(result.ok).toBe(false);
    if (!result.ok && name.length >= 3) expect(result.error).toContain("reserved");
  }
  const sql = migration.match(/v_handle in \(([^)]*)\)/)![1].match(/'([^']+)'/g)!.map((s) => s.slice(1, -1));
  expect(new Set(sql)).toEqual(RESERVED_HANDLES);
});

test("the SQL handle shape is the same pattern", () => {
  expect(migration).toContain("'^[a-z0-9][a-z0-9-]{1,22}[a-z0-9]$'");
});

test("profile input: optional handle and name, true-or-false switches, public needs a handle", () => {
  expect(parseProfileInput(profile({ handle: "@Thrall", displayName: "  Go'el  " }))).toEqual({
    ok: true, value: { handle: "thrall", displayName: "Go'el", publicProfile: false, showCharacters: true, showBuilds: true, showStatus: true },
  });
  expect(parseProfileInput(profile({ handle: "" }))).toMatchObject({ ok: true, value: { handle: null, displayName: null } });
  expect(parseProfileInput(profile({ handle: "", publicProfile: true }))).toEqual({ ok: false, error: "Choose a handle before you make your profile public." });
  expect(parseProfileInput(profile({ displayName: "x".repeat(41) })).ok).toBe(false);
  expect(parseProfileInput(profile({ displayName: "x".repeat(40) })).ok).toBe(true);
  expect(parseProfileInput(profile({ showBuilds: "yes" })).ok).toBe(false);
  expect(parseProfileInput(profile({ handle: 7 })).ok).toBe(false);
  expect(parseProfileInput(null).ok).toBe(false);
});

test("an emoji is one picture of at most 16 bytes", () => {
  for (const ok of ["🔥", "👩‍💻", "🇵🇷", "❤️", "👍🏽"]) expect(validEmoji(ok), ok).toBe(true);
  for (const bad of ["", "a", "🔥🔥", "🔥 ", ":)", "🧑‍🤝‍🧑"]) expect(validEmoji(bad), bad).toBe(false);
});

test("status input: up to 80 characters, one emoji, a clear-after within the next week; empty clears", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");
  expect(parseStatusInput({ emoji: "🔥", text: " Raiding ", clearsAt: "2026-10-20T12:30:00Z" }, now)).toEqual({
    ok: true, value: { emoji: "🔥", text: "Raiding", clearsAt: "2026-10-20T12:30:00.000Z" },
  });
  expect(parseStatusInput({ text: "x".repeat(80) }, now).ok).toBe(true);
  expect(parseStatusInput({ text: "x".repeat(81) }, now).ok).toBe(false);
  expect(parseStatusInput({ emoji: "🔥🔥", text: "x" }, now).ok).toBe(false);
  expect(parseStatusInput({ text: "x", clearsAt: "2026-10-20T11:59:00Z" }, now).ok).toBe(false);
  expect(parseStatusInput({ text: "x", clearsAt: "2026-10-29T12:00:00Z" }, now).ok).toBe(false);
  expect(parseStatusInput({ text: "x", clearsAt: "soon" }, now).ok).toBe(false);
  expect(parseStatusInput({ emoji: "", text: " ", clearsAt: "2026-10-20T12:30:00Z" }, now)).toEqual({ ok: true, value: { emoji: null, text: null, clearsAt: null } });
});

test("clear after: 30 minutes, 4 hours, midnight tonight, Monday 00:00, or never, in local time", () => {
  const wednesday = new Date(2026, 9, 21, 15, 10);
  expect(clearsAtFor("never", wednesday)).toBeNull();
  expect(clearsAtFor("30m", wednesday)!.getTime() - wednesday.getTime()).toBe(30 * 60_000);
  expect(clearsAtFor("4h", wednesday)!.getTime() - wednesday.getTime()).toBe(4 * 3_600_000);
  expect(clearsAtFor("today", wednesday)).toEqual(new Date(2026, 9, 22));
  expect(clearsAtFor("week", wednesday)).toEqual(new Date(2026, 9, 26));
  // On a Sunday the week ends tonight; on a Monday it runs seven days.
  expect(clearsAtFor("week", new Date(2026, 9, 25, 9))).toEqual(new Date(2026, 9, 26));
  expect(clearsAtFor("week", new Date(2026, 9, 26, 9))).toEqual(new Date(2026, 10, 2));
  for (const choice of ["30m", "4h", "today", "week"] as const) {
    const at = clearsAtFor(choice, wednesday)!.toISOString();
    expect(parseStatusInput({ text: "x", clearsAt: at }, wednesday.getTime()).ok).toBe(true);
  }
});

test("a stored status past its clear-after time, or empty, reads as none", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");
  expect(liveStatus({ status_emoji: "🔥", status_text: null, status_clears_at: null }, now)).toEqual({ emoji: "🔥", text: "", clearsAt: null });
  expect(liveStatus({ status_emoji: null, status_text: "Hi", status_clears_at: "2026-10-20T11:00:00Z" }, now)).toBeNull();
  expect(liveStatus({ status_emoji: null, status_text: "Hi", status_clears_at: "2026-10-20T13:00:00+00:00" }, now)).toEqual({ emoji: null, text: "Hi", clearsAt: "2026-10-20T13:00:00.000Z" });
  expect(liveStatus({ status_emoji: null, status_text: null, status_clears_at: null }, now)).toBeNull();
});

test("a write that changes the shell tells the avatar menu", () => {
  const target = new EventTarget();
  const heard: string[] = [];
  target.addEventListener(SHELL_CHANGED_EVENT, (e) => heard.push(e.type));
  vi.stubGlobal("window", target);
  try { shellChanged(); } finally { vi.unstubAllGlobals(); }
  expect(heard).toEqual(["everloot:shell-changed"]);
});

test("names and greetings", () => {
  expect(shortName("Thrall#1234")).toBe("Thrall");
  expect(shortName("Jaina Proudmoore")).toBe("Jaina Proudmoore");
  expect([greeting(3), greeting(8), greeting(13), greeting(20)]).toEqual(["Good evening", "Good morning", "Good afternoon", "Good evening"]);
});

test("the Ask box hand-off: the question, then the character and its builds", () => {
  expect(askPrefill("  What drops in MC? ", null)).toBe("What drops in MC?");
  const jaina = { name: "Jaina", classSlug: "mage", realm: "Pioneer" };
  expect(askPrefill("Best leveling spec?", jaina, [{ name: "Frost", slug: "Frost123", active: true }, { name: "Fire", slug: "Fire1234", active: false }]))
    .toBe("Best leveling spec?\n\nI'm playing Jaina, a Mage on Pioneer. My saved builds for Jaina: Frost (Frost123, active), Fire (Fire1234).");
  expect(askPrefill("", { ...jaina, realm: null })).toBe("I'm playing Jaina, a Mage.");
  expect(askPrefill("x".repeat(3000), jaina).length).toBe(2000);
});
