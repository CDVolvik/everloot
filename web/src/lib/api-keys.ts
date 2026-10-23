import { createHash, randomBytes } from "node:crypto";
import type { KeyRow } from "./api-key-policy";
import { authQuery } from "./supabase/server";

export * from "./api-key-policy";

/**
 * Free API keys, tied to a Battle.net account. A key is an opaque bearer token (`evl_` and 64 hex
 * characters) sent as `Authorization: Bearer <key>`, the same header an OAuth access token uses, so a
 * future MCP connector can issue its tokens into the same table. Only the SHA-256 of a key is stored;
 * the key itself is shown once, when it is made. A key made on the account page also has a purpose and an
 * end date (api-key-policy.ts); the database refuses a key past its end date on every route that takes keys.
 */
export const KEY_PATTERN = /^evl_[a-f0-9]{64}$/;
export const KEYS_PER_ACCOUNT = 5;
export const KEYS_MADE_PER_DAY = 10;
/** Daily counts are kept this long; a revoked key is deleted this long after revocation. */
export const USAGE_KEPT_DAYS = 90;
export const REVOKED_KEPT_DAYS = 30;
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type KeySurface = "corpus" | "drops" | "market" | "mcp";

export function hashKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newKey(): { token: string; hash: string; hint: string } {
  const token = `evl_${randomBytes(32).toString("hex")}`;
  return { token, hash: hashKey(token), hint: token.slice(-4) };
}

/** The key a request presents. The scheme is case-insensitive (RFC 7235); any other credential is not ours and is ignored. */
export function presentedKey(req: Request): string | null {
  const match = /^(\S+) +(evl_\S*)$/.exec(req.headers.get("authorization")?.trim() ?? "");
  return match && match[1].toLowerCase() === "bearer" ? match[2] : null;
}

/** A label is for the owner's own list: printable, trimmed, 60 characters at most (whole characters, as Postgres counts them). */
export function cleanLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  return Array.from(value.replace(/[\u0000-\u001f\u007f]/g, "").trim()).slice(0, 60).join("").trim();
}

export function validKeyId(id: string | null): id is string {
  return !!id && ID_PATTERN.test(id);
}

const KEY_COLUMNS = "id,hint,label,scopes,created_at,last_used_at,revoked_at,expires_at";
const keysOf = (userId: string, columns: string) =>
  authQuery<KeyRow[]>(`api_keys?select=${columns}&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`);

/** A PostgREST status in authQuery's error: 400 for a column that does not exist, 404 for a function that does not. */
const storageStatus = (error: unknown, status: number) => error instanceof Error && error.message.endsWith(`(${status})`);

export async function listKeys(userId: string): Promise<KeyRow[]> {
  return keysOf(userId, KEY_COLUMNS);
}

/**
 * The account page's list, with each key's purpose. `records` is false until 20261022120000_api_key_expiry.sql is
 * applied (there is no purpose column yet): the list is read as before and the page offers no purpose or expiry.
 */
export async function readKeys(userId: string): Promise<{ keys: KeyRow[]; records: boolean }> {
  try {
    return { keys: await keysOf(userId, `${KEY_COLUMNS},purpose`), records: true };
  } catch (error) {
    if (!storageStatus(error, 400)) throw error;
    return { keys: await keysOf(userId, KEY_COLUMNS), records: false };
  }
}

/**
 * The account's keys and the requests they made over the last `days` UTC days, today included. The counts are
 * read only for the keys this user owns, so another account's usage never reaches the total.
 */
export async function keySummary(userId: string, days = 7, now = new Date()): Promise<{ keys: KeyRow[]; requests: number }> {
  const keys = await listKeys(userId);
  const ids = keys.map((k) => k.id).filter((id) => ID_PATTERN.test(id));
  if (ids.length === 0) return { keys, requests: 0 };
  const since = new Date(now.getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const rows = await authQuery<Array<{ count: number | string }>>(`api_key_usage?select=count&key_id=in.(${ids.join(",")})&day=gte.${since}`);
  return { keys, requests: rows.reduce((sum, r) => sum + Number(r.count), 0) };
}

export type Refusal = "live_limit" | "daily_limit";

/** read:own lets a key read its owner's saved builds ("Read my saved builds"), on top of the public data. */
export const OWN_SCOPES = ["read:public", "read:own"] as const;

/**
 * A refusal when the account already has its five live keys, or made its ten keys today. Without `scopes` the
 * key is read:public, and the call stays the four-argument one the database had before saved builds.
 */
export async function createKey(userId: string, label: string, scopes?: readonly string[]): Promise<{ id: string; token: string; hint: string } | { refused: Refusal }> {
  const key = newKey();
  const rows = await authQuery<Array<{ key_ref: string | null; refusal: string | null }>>("rpc/create_api_key", {
    method: "POST",
    body: JSON.stringify({ p_user_id: userId, p_token_hash: key.hash, p_hint: key.hint, p_label: label, ...(scopes ? { p_scopes: scopes } : {}) }),
  });
  const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  if (row && row.key_ref === null && (row.refusal === "live_limit" || row.refusal === "daily_limit")) return { refused: row.refusal };
  if (!row || typeof row.key_ref !== "string" || !ID_PATTERN.test(row.key_ref)) throw new Error("Key was not saved");
  return { id: row.key_ref, token: key.token, hint: key.hint };
}

export interface IssuedKey { id: string; token: string; hint: string; expires_at: string | null }
export type Issue = IssuedKey | { refused: Refusal | "not_found" } | { missing: true };

function issued(rows: unknown, key: { token: string; hint: string }, expiresAt: string | null): Issue {
  const row = Array.isArray(rows) && rows.length === 1 ? rows[0] as { key_ref: unknown; refusal: unknown } : null;
  if (row && row.key_ref === null && (row.refusal === "live_limit" || row.refusal === "daily_limit" || row.refusal === "not_found")) return { refused: row.refusal };
  if (!row || typeof row.key_ref !== "string" || !ID_PATTERN.test(row.key_ref)) throw new Error("Key was not saved");
  return { id: row.key_ref, token: key.token, hint: key.hint, expires_at: expiresAt };
}

/**
 * Makes a key from the account page's form, with its name, purpose, scopes and end date. `{ missing: true }` when
 * 20261022120000_api_key_expiry.sql is not applied yet: nothing was made.
 */
export async function issueKey(userId: string, fields: { label: string; purpose: string; scopes: readonly string[]; expiresAt: string }): Promise<Issue> {
  const key = newKey();
  let rows: unknown;
  try {
    rows = await authQuery("rpc/issue_api_key", {
      method: "POST",
      body: JSON.stringify({ p_user_id: userId, p_token_hash: key.hash, p_hint: key.hint, p_label: fields.label, p_purpose: fields.purpose, p_scopes: fields.scopes, p_expires_at: fields.expiresAt }),
    });
  } catch (error) {
    if (storageStatus(error, 404)) return { missing: true };
    throw error;
  }
  return issued(rows, key, fields.expiresAt);
}

/**
 * A new secret for one of this user's keys, with the same name, purpose, scopes and lifetime; the old secret is
 * revoked at once. `{ missing: true }` before the migration.
 */
export async function rollKey(userId: string, id: string): Promise<Issue> {
  const key = newKey();
  let rows: unknown;
  try {
    rows = await authQuery("rpc/roll_api_key", {
      method: "POST", body: JSON.stringify({ p_user_id: userId, p_id: id, p_token_hash: key.hash, p_hint: key.hint }),
    });
  } catch (error) {
    if (storageStatus(error, 404)) return { missing: true };
    throw error;
  }
  const row = Array.isArray(rows) && rows.length === 1 ? rows[0] as { key_expires_at?: unknown } : null;
  const expiresAt = typeof row?.key_expires_at === "string" ? row.key_expires_at : null;
  return issued(rows, key, expiresAt);
}

/** False when the key is not this user's or is already revoked. */
export async function revokeKey(userId: string, id: string): Promise<boolean> {
  const rows = await authQuery<Array<{ id: string }>>(
    `api_keys?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}&revoked_at=is.null&select=id`,
    { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify({ revoked_at: new Date().toISOString() }) },
  );
  return rows.length === 1;
}

/** Deletes a revoked or expired key of this user, with its counts, now. False when there is none. */
export async function deleteKey(userId: string, id: string, now = new Date()): Promise<boolean> {
  const rows = await authQuery<Array<{ id: string }>>(
    `api_keys?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}&or=(revoked_at.not.is.null,expires_at.lte.${encodeURIComponent(now.toISOString())})&select=id`,
    { method: "DELETE", headers: { prefer: "return=representation" } },
  );
  return rows.length === 1;
}

/** Retention, from the snapshot cron: counts older than 90 days, and keys revoked over 30 days ago. */
export async function pruneKeys(): Promise<void> {
  await authQuery("rpc/prune_api_keys", { method: "POST", headers: { prefer: "return=minimal" }, body: "{}" });
}

export interface KeyAdmission { allowed: boolean; retryAfter: number; keyId: string | null }

/** One atomic call: is the key live, is its account's hourly allowance left; counts the request against it. */
export async function consumeKey(
  token: string, surface: KeySurface,
  env: Record<string, string | undefined> = process.env, doFetch: typeof fetch = fetch,
): Promise<KeyAdmission> {
  const url = env.SUPABASE_URL?.trim();
  const secret = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !secret) throw new Error("Key storage is not configured");
  // A malformed key cannot be live; answer it without a database call.
  if (!KEY_PATTERN.test(token)) return { allowed: false, retryAfter: 0, keyId: null };
  const response = await doFetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/consume_api_key`, {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(5000),
    headers: { apikey: secret, authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ p_token_hash: hashKey(token), p_surface: surface }),
  });
  if (!response.ok) throw new Error("Key storage unavailable");
  const rows = await response.json();
  const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  if (!row || typeof row.allowed !== "boolean" || !Number.isInteger(row.retry_after) || row.retry_after < 0 || row.retry_after > 3600 ||
    (row.key_ref !== null && (typeof row.key_ref !== "string" || !ID_PATTERN.test(row.key_ref))) ||
    (row.allowed && row.key_ref === null)) throw new Error("Invalid key response");
  return { allowed: row.allowed, retryAfter: row.retry_after, keyId: row.key_ref };
}
