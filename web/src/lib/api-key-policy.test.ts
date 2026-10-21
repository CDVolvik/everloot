import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  cleanPurpose, daysUntil, DEFAULT_EXPIRY_DAYS, EXPIRY_DAYS, expiryFrom, keyExpired, keyLive, MAX_EXPIRY_DAYS, PURPOSE_MAX,
} from "./api-key-policy";
import { KEYS_MADE_PER_DAY, KEYS_PER_ACCOUNT } from "./api-keys";

const NOW = new Date("2026-10-20T15:00:00.000Z");

test("expiry: the listed choices count from now; anything else is refused", () => {
  expect(EXPIRY_DAYS).toEqual([7, 30, 90, 365]);
  expect(EXPIRY_DAYS).toContain(DEFAULT_EXPIRY_DAYS);
  expect(expiryFrom({ days: 90 }, NOW)).toEqual({ expiresAt: "2027-01-18T15:00:00.000Z" });
  expect(expiryFrom({ days: 7 }, NOW)).toEqual({ expiresAt: "2026-10-27T15:00:00.000Z" });
  for (const days of [0, 1, 3650, "90", -7]) expect(expiryFrom({ days }, NOW)).toHaveProperty("error");
  expect(expiryFrom({}, NOW)).toHaveProperty("error");
});

test("expiry: a custom date runs through the end of that UTC day, from tomorrow to a year ahead", () => {
  expect(expiryFrom({ date: "2026-10-21" }, NOW)).toEqual({ expiresAt: "2026-10-21T23:59:59.999Z" });
  expect(expiryFrom({ date: "2026-10-20" }, NOW)).toEqual({ error: "Pick a date after today." });
  expect(expiryFrom({ date: "2027-10-20" }, NOW)).toEqual({ expiresAt: "2027-10-20T23:59:59.999Z" });
  expect(expiryFrom({ date: "2027-10-22" }, NOW)).toEqual({ error: "A key can last a year at most." });
  expect(expiryFrom({ date: "2026-02-30" }, NOW)).toEqual({ error: "That is not a date." });
  expect(expiryFrom({ date: "21/10/2026" }, NOW)).toHaveProperty("error");
});

test("a key is live until it is revoked or reaches its end date; no end date never expires", () => {
  const now = NOW.getTime();
  expect(keyExpired({ expires_at: null }, now)).toBe(false);
  expect(keyExpired({ expires_at: "2026-10-20T15:00:00.000Z" }, now)).toBe(true);
  expect(keyExpired({ expires_at: "2026-10-20T15:00:01.000Z" }, now)).toBe(false);
  expect(keyLive({ expires_at: null, revoked_at: null }, now)).toBe(true);
  expect(keyLive({ expires_at: null, revoked_at: "2026-10-01T00:00:00Z" }, now)).toBe(false);
  expect(keyLive({ expires_at: "2026-10-01T00:00:00Z", revoked_at: null }, now)).toBe(false);
  expect(daysUntil("2026-10-21T14:00:00.000Z", now)).toBe(1);
  expect(daysUntil("2027-01-18T15:00:00.000Z", now)).toBe(90);
});

test("a purpose is one printable line, cut at whole characters", () => {
  expect(cleanPurpose("  a\nsheet\u0007 for   my guild ")).toBe("a sheet for my guild");
  expect(Array.from(cleanPurpose("🐉".repeat(250)))).toHaveLength(PURPOSE_MAX);
  expect(cleanPurpose(42)).toBe("");
});

// The SQL, read the way the database will run it: the last definition of each function wins.
const flat = (text: string) => text.replace(/--[^\n]*/g, "").replace(/\s+/g, " ");
const dir = new URL("../../../supabase/migrations/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const functions = new Map<string, string>();
for (const file of files) {
  const sql = flat(readFileSync(new URL(file, dir), "utf8"));
  for (const match of sql.matchAll(/create or replace function public\.(\w+)\(([^)]*)\)(.*?)\$\$;/g)) functions.set(match[1], `${match[2]}|${match[3]}`);
}

test("every database function that takes a key's hash refuses a key past its end date", () => {
  const lookups = [...functions].filter(([, body]) => /p_token_hash text/.test(body.split("|")[0]) && /where k\.token_hash = p_token_hash/.test(body));
  expect(lookups.map(([name]) => name)).toEqual(expect.arrayContaining(["consume_api_key", "own_builds_for_key"]));
  for (const [name, body] of lookups) {
    expect(body, name).toContain("k.revoked_at is null and (k.expires_at is null or k.expires_at > now())");
  }
});

test("the new key functions keep the limits in code, run with an empty search_path and are closed to the browser roles", () => {
  const sql = flat(readFileSync(new URL("20261022120000_api_key_expiry.sql", dir), "utf8"));
  const room = functions.get("api_key_room")!;
  expect(room).toContain(`if live >= ${KEYS_PER_ACCOUNT} then return 'live_limit';`);
  expect(room).toContain(`if made.count >= ${KEYS_MADE_PER_DAY} then return 'daily_limit';`);
  expect(functions.get("issue_api_key")).toContain(`p_expires_at > now() + interval '${MAX_EXPIRY_DAYS} days'`);
  expect(functions.get("issue_api_key")).toContain(`char_length(v_purpose) not between 1 and ${PURPOSE_MAX}`);
  expect(sql).toContain(`check (char_length(purpose) <= ${PURPOSE_MAX})`);
  for (const name of ["api_key_room", "issue_api_key", "roll_api_key"]) {
    expect(functions.get(name), name).toContain("security definer set search_path = ''");
  }
  expect(sql).toContain("revoke all on function public.api_key_room(uuid, boolean) from public, anon, authenticated, service_role;");
  expect(sql).toContain("revoke all on function public.issue_api_key(uuid, text, text, text, text, text[], timestamptz) from public, anon, authenticated;");
  expect(sql).toContain("revoke all on function public.roll_api_key(uuid, uuid, text, text) from public, anon, authenticated;");
  // Additive and safe to apply twice.
  expect(sql).toContain("add column if not exists purpose");
  expect(sql).not.toMatch(/drop table|drop function(?! if exists)|create table (?!if not exists)/);
});
