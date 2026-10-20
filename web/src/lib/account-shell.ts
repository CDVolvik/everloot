import { NextResponse } from "next/server";
import { cache } from "react";
import type { AccountShell, AccountStatus } from "./account-shell-types";
import { signInPath } from "./auth/return-to";
import { liveStatus, profilesOn, shortName, type ProfileInput, type StatusInput } from "./profiles";
import { CHARACTER_COLUMNS, toCharacters, type CharacterRow } from "./saved-builds";
import { authQuery, getUser, siteUrl, type AccountUser } from "./supabase/server";

// Server side of profiles: reads with the service role, writes through the security definer functions in
// 20261021170000_account_profiles.sql, which check the owner and the shapes again.

export { profilesOn };

export interface ProfileRow {
  handle: string | null; display_name: string | null;
  status_emoji: string | null; status_text: string | null; status_clears_at: string | null;
  public_profile: boolean; show_characters: boolean; show_builds: boolean; show_status: boolean;
  main_character_id: string | null; active_character_id: string | null;
}
const PROFILE_COLUMNS = "handle,display_name,status_emoji,status_text,status_clears_at,public_profile,show_characters,show_builds,show_status,main_character_id,active_character_id";

/** What /settings shows: the stored profile with its defaults when there is no row yet. */
export interface ProfileSettings {
  handle: string | null; displayName: string | null; status: AccountStatus | null;
  publicProfile: boolean; showCharacters: boolean; showBuilds: boolean; showStatus: boolean;
}

/** The stored profile row, or null before the player saved anything. Read once per request. */
export const readProfile = cache(async (userId: string): Promise<ProfileRow | null> => {
  const rows = await authQuery<ProfileRow[]>(`user_profiles?select=${PROFILE_COLUMNS}&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
  return rows[0] ?? null;
});

export function toSettings(row: ProfileRow | null): ProfileSettings {
  return {
    handle: row?.handle ?? null, displayName: row?.display_name ?? null, status: row ? liveStatus(row) : null,
    publicProfile: row?.public_profile ?? false, showCharacters: row?.show_characters ?? true,
    showBuilds: row?.show_builds ?? true, showStatus: row?.show_status ?? true,
  };
}

/** The shell for one signed-in account. A main or active character that is gone reads as none. */
export function toShell(user: AccountUser, row: ProfileRow | null, characters: CharacterRow[]): AccountShell {
  const list = toCharacters(characters).map(({ id, name, classSlug, realm }) => ({ id, name, classSlug, realm }));
  const owned = (id: string | null | undefined) => (id && list.some((c) => c.id === id) ? id : null);
  const mainCharacterId = owned(row?.main_character_id);
  return {
    userId: user.id,
    name: user.name,
    handle: row?.handle ?? null,
    displayName: row?.display_name || shortName(user.name),
    status: row ? liveStatus(row) : null,
    publicProfile: row?.public_profile ?? false,
    characters: list,
    mainCharacterId,
    activeCharacterId: owned(row?.active_character_id) ?? mainCharacterId,
  };
}

/**
 * The signed-in player's shell for the header, the avatar menu and the home; null when signed out or with
 * EVERLOOT_PROFILES off. Throws when storage fails, so a caller can tell "signed out" from "unavailable".
 * Read once per request.
 */
export const loadAccountShell = cache(async (): Promise<AccountShell | null> => {
  if (!profilesOn()) return null;
  const user = await getUser();
  if (!user) return null;
  const id = encodeURIComponent(user.id);
  const [row, characters] = await Promise.all([
    readProfile(user.id),
    authQuery<CharacterRow[]>(`build_characters?select=${CHARACTER_COLUMNS}&user_id=eq.${id}`),
  ]);
  return toShell(user, row, characters);
});

export type ProfileRefusal = "needs_handle" | "handle_reserved" | "handle_taken" | "handle_limit";

export async function saveProfile(userId: string, input: ProfileInput): Promise<{ refused: ProfileRefusal } | { saved: true }> {
  const rows = await authQuery<Array<{ refusal: string | null }>>("rpc/save_profile", {
    method: "POST",
    body: JSON.stringify({
      p_user_id: userId, p_handle: input.handle, p_display_name: input.displayName, p_public: input.publicProfile,
      p_show_characters: input.showCharacters, p_show_builds: input.showBuilds, p_show_status: input.showStatus,
    }),
  });
  const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  if (!row) throw new Error("Profile was not saved");
  if (row.refusal === null) return { saved: true };
  if (["needs_handle", "handle_reserved", "handle_taken", "handle_limit"].includes(row.refusal)) return { refused: row.refusal as ProfileRefusal };
  throw new Error("Profile was not saved");
}

export async function setStatus(userId: string, input: StatusInput): Promise<void> {
  const ok = await authQuery<boolean>("rpc/set_status", {
    method: "POST", body: JSON.stringify({ p_user_id: userId, p_emoji: input.emoji, p_text: input.text, p_clears_at: input.clearsAt }),
  });
  if (ok !== true) throw new Error("Status was not saved");
}

/** False when the character is not one of the player's. Null clears the main character. */
export async function setMainCharacter(userId: string, characterId: string | null): Promise<boolean> {
  return (await authQuery<boolean>("rpc/set_main_character", { method: "POST", body: JSON.stringify({ p_user_id: userId, p_id: characterId }) })) === true;
}

/** False when the character is not one of the player's. Null goes back to the main character. */
export async function setActiveCharacter(userId: string, characterId: string | null): Promise<boolean> {
  return (await authQuery<boolean>("rpc/set_active_character", { method: "POST", body: JSON.stringify({ p_user_id: userId, p_id: characterId }) })) === true;
}

/** A public profile behind /u/<handle>: only what its owner ticked. Never the account name or a private build. */
export interface PublicProfile {
  handle: string;
  displayName: string | null;
  status: { emoji: string | null; text: string | null } | null;
  /** Null when the owner hides them. */
  characters: Array<{ name: string; classSlug: string; realm: string | null; main: boolean }> | null;
  builds: Array<{ slug: string; name: string; classSlug: string; updatedAt: string }> | null;
}

export const publicProfile = cache(async (handle: string): Promise<PublicProfile | null> => {
  if (!/^[A-Za-z0-9-]{3,24}$/.test(handle)) return null;
  const rows = await authQuery<Array<{
    handle: string; display_name: string | null; status_emoji: string | null; status_text: string | null;
    characters: Array<{ name: string; class_slug: string; realm: string | null; main: boolean }> | null;
    builds: Array<{ slug: string; name: string; class_slug: string; updated_at: string }> | null;
  }>>("rpc/public_profile", { method: "POST", body: JSON.stringify({ p_handle: handle }) });
  const r = rows[0];
  if (!r) return null;
  return {
    handle: r.handle,
    displayName: r.display_name,
    status: r.status_emoji || r.status_text ? { emoji: r.status_emoji, text: r.status_text } : null,
    characters: r.characters && r.characters.map((c) => ({ name: c.name, classSlug: c.class_slug, realm: c.realm, main: c.main })),
    builds: r.builds && r.builds.map((b) => ({ slug: b.slug, name: b.name, classSlug: b.class_slug, updatedAt: new Date(b.updated_at).toISOString() })),
  };
});

// The profile routes under /api/me. Same-origin JSON for the signed-in player; nothing is cached.

export const NO_STORE = { "Cache-Control": "private, no-store" };
export const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: NO_STORE });
export const unavailable = () => fail(503, "Your profile is unavailable right now. Try again in a minute.");

/** 404 with the switch off, 403 for a write not from this site (a missing Origin too), 401 with where to sign in, else the user. */
export async function profileAccount(req: Request, write: boolean): Promise<AccountUser | Response> {
  if (!profilesOn()) return fail(404, "Not found");
  if (write && req.headers.get("origin") !== siteUrl()) return fail(403, "Invalid origin");
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in to change your profile.", signIn: signInPath("/settings") }, { status: 401, headers: NO_STORE });
  return user;
}

/** The JSON body, or null when there is none or it does not parse. */
export async function jsonBody(req: Request): Promise<unknown> {
  try { return await req.json(); } catch { return null; }
}
