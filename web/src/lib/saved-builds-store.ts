import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { hashKey, KEY_PATTERN } from "./api-keys";
import { signInPath } from "./auth/return-to";
import {
  BUILD_COLUMNS, CHARACTER_COLUMNS, savedBuildsOn, SLUG_PATTERN, toBuild, toCharacter,
  type AccountBuilds, type BuildCharacter, type BuildInput, type BuildRow, type CharacterInput, type CharacterRow, type SavedBuild,
} from "./saved-builds";
import { authQuery, getUser, siteUrl, type AccountUser } from "./supabase/server";

// Server side of saved builds: reads with the service role, writes through the security definer functions
// in 20261021150000_saved_builds.sql, which hold the limits.

const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Eight random base62 characters. Bytes of 248 and up are skipped, so every character is equally likely. */
export function newSlug(): string {
  let slug = "";
  while (slug.length < 8) {
    for (const byte of randomBytes(16)) {
      if (byte < 248 && slug.length < 8) slug += BASE62[byte % 62];
    }
  }
  return slug;
}

export async function listOwn(userId: string): Promise<AccountBuilds> {
  const user = encodeURIComponent(userId);
  const [characters, builds] = await Promise.all([
    authQuery<CharacterRow[]>(`build_characters?select=${CHARACTER_COLUMNS}&user_id=eq.${user}&order=name.asc,id.asc`),
    authQuery<BuildRow[]>(`saved_builds?select=${BUILD_COLUMNS}&user_id=eq.${user}&order=updated_at.desc,id.asc`),
  ]);
  const site = siteUrl();
  return { characters: characters.map(toCharacter), builds: builds.map((b) => toBuild(b, site)) };
}

export type BuildRefusal = "not_found" | "class_mismatch" | "build_limit" | "daily_limit";

/** Creates (no id) or updates one of the user's builds. A taken slug is retried with a new one. */
export async function saveBuild(userId: string, input: BuildInput): Promise<{ build: SavedBuild; created: boolean } | { refused: BuildRefusal }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const rows = await authQuery<Array<{ build_ref: string | null; build_slug: string | null; refusal: string | null }>>("rpc/save_build", {
      method: "POST",
      body: JSON.stringify({
        p_user_id: userId, p_id: input.id, p_slug: input.id ? null : newSlug(), p_character_id: input.characterId,
        p_name: input.name, p_notes: input.notes, p_code: input.code, p_code2: input.code2,
        p_shared: input.shared, p_active: input.active, p_show_name: input.showName,
      }),
    });
    const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
    if (row?.refusal === "slug_taken") continue;
    if (row && row.build_ref === null && ["not_found", "class_mismatch", "build_limit", "daily_limit"].includes(row.refusal ?? "")) {
      return { refused: row.refusal as BuildRefusal };
    }
    if (!row || typeof row.build_ref !== "string" || row.refusal !== null) throw new Error("Build was not saved");
    const saved = await authQuery<BuildRow[]>(`saved_builds?select=${BUILD_COLUMNS}&id=eq.${encodeURIComponent(row.build_ref)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
    if (!saved[0]) throw new Error("Build was not saved");
    return { build: toBuild(saved[0], siteUrl()), created: !input.id };
  }
  throw new Error("No free short link");
}

export async function deleteBuild(userId: string, id: string): Promise<boolean> {
  return (await authQuery<boolean>("rpc/delete_build", { method: "POST", body: JSON.stringify({ p_user_id: userId, p_id: id }) })) === true;
}

export type CharacterRefusal = "not_found" | "has_builds" | "character_limit" | "daily_limit";

export async function saveCharacter(userId: string, input: CharacterInput): Promise<{ character: BuildCharacter; created: boolean } | { refused: CharacterRefusal }> {
  const rows = await authQuery<Array<{ character_ref: string | null; refusal: string | null }>>("rpc/save_build_character", {
    method: "POST",
    body: JSON.stringify({ p_user_id: userId, p_id: input.id, p_name: input.name, p_class_slug: input.classSlug, p_realm: input.realm, p_note: input.note }),
  });
  const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  if (row && row.character_ref === null && ["not_found", "has_builds", "character_limit", "daily_limit"].includes(row.refusal ?? "")) {
    return { refused: row.refusal as CharacterRefusal };
  }
  if (!row || typeof row.character_ref !== "string" || row.refusal !== null) throw new Error("Character was not saved");
  return { character: { id: row.character_ref, name: input.name, classSlug: input.classSlug, realm: input.realm, note: input.note }, created: !input.id };
}

export async function deleteCharacter(userId: string, id: string): Promise<boolean> {
  return (await authQuery<boolean>("rpc/delete_build_character", { method: "POST", body: JSON.stringify({ p_user_id: userId, p_id: id }) })) === true;
}

/** A shared build behind /b/<slug>, or null when the slug is unknown, unshared or deleted. */
export interface SharedBuild {
  slug: string; name: string; notes: string | null; classSlug: string; code: string; code2: string | null; gameBuild: string;
  characterName: string | null; characterClass: string | null; ownerName: string | null; updatedAt: string;
}

export async function sharedBuild(slug: string): Promise<SharedBuild | null> {
  if (!SLUG_PATTERN.test(slug)) return null;
  const rows = await authQuery<Array<{
    name: string; notes: string | null; class_slug: string; code: string; code2: string | null; game_build: string;
    character_name: string | null; character_class: string | null; owner_name: string | null; updated_at: string;
  }>>("rpc/shared_build", { method: "POST", body: JSON.stringify({ p_slug: slug }) });
  const r = rows[0];
  if (!r) return null;
  return {
    slug, name: r.name, notes: r.notes, classSlug: r.class_slug, code: r.code, code2: r.code2, gameBuild: r.game_build,
    characterName: r.character_name, characterClass: r.character_class, ownerName: r.owner_name, updatedAt: r.updated_at,
  };
}

export type KeyRead = { ok: true; value: AccountBuilds } | { ok: false; refusal: "unknown_key" | "no_scope" | "limited"; retryAfter: number };

/** The key owner's builds, when the key is live and has read:own. Counts against the account's hourly allowance. */
export async function ownBuildsForKey(token: string): Promise<KeyRead> {
  if (!KEY_PATTERN.test(token)) return { ok: false, refusal: "unknown_key", retryAfter: 0 };
  const rows = await authQuery<Array<{ refusal: string | null; retry_after: number; characters: CharacterRow[] | null; builds: BuildRow[] | null }>>(
    "rpc/own_builds_for_key", { method: "POST", body: JSON.stringify({ p_token_hash: hashKey(token) }) },
  );
  const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  if (!row) throw new Error("Invalid key response");
  if (row.refusal === "unknown_key" || row.refusal === "no_scope" || row.refusal === "limited") {
    const retryAfter = Number.isInteger(row.retry_after) ? Math.min(Math.max(row.retry_after, 0), 3600) : 0;
    return { ok: false, refusal: row.refusal, retryAfter };
  }
  if (row.refusal !== null || !Array.isArray(row.characters) || !Array.isArray(row.builds)) throw new Error("Invalid key response");
  const site = siteUrl();
  return { ok: true, value: { characters: row.characters.map(toCharacter), builds: row.builds.map((b) => toBuild(b, site)) } };
}

// The routes under /api/me. Same-origin JSON for the signed-in player; nothing is cached.

export const NO_STORE = { "Cache-Control": "private, no-store" };
export const fail = (status: number, error: string, extra: Record<string, string> = {}) =>
  NextResponse.json({ error }, { status, headers: { ...NO_STORE, ...extra } });
export const unavailable = () => fail(503, "Saved builds are unavailable right now. Try again in a minute.");

/** 404 with the switch off, 403 for a write from another site, 401 with where to sign in, else the user. */
export async function meAccount(req: Request, write: boolean): Promise<AccountUser | Response> {
  if (!savedBuildsOn()) return fail(404, "Not found");
  const origin = req.headers.get("origin");
  if (write && origin && origin !== siteUrl()) return fail(403, "Invalid origin");
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in to save builds.", signIn: signInPath("/me") }, { status: 401, headers: NO_STORE });
  return user;
}
