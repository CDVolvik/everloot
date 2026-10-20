import type { DeviceAccount } from "@/lib/account-shell-types";
import { authQuery, type AccountUser } from "@/lib/supabase/server";
import { authV2Enabled, getAuth } from "./auth";

// The accounts signed in on one browser, for the account switcher
// (docs/design/specs/2026-10-20-account-shell-design.md, "Account switching").

/**
 * EVERLOOT_PROFILES, strictly "1". The same check as profilesOn() in lib/account-shell.ts (the data side of the
 * project), copied here so this half builds on its own; use that one once both halves are merged.
 */
export function profilesOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.EVERLOOT_PROFILES === "1";
}

export interface DeviceSession { token: string; userId: string; name: string }

/**
 * The Better Auth sessions signed in on this browser, one per account, read from the multi-session cookies.
 * Empty with the legacy session, which knows only the current account. The tokens never leave the server.
 */
export async function deviceSessions(headers: Headers): Promise<DeviceSession[]> {
  if (!authV2Enabled()) return [];
  const sessions = await getAuth().api.listDeviceSessions({ headers });
  return sessions.map(({ session, user }) => ({ token: session.token, userId: user.id, name: user.name }));
}

type ProfileRow = { user_id: string; handle: string | null; display_name: string | null };

// Handles and display names from user_profiles. Until that table exists (or if the read fails) each account
// shows the name it signed in with and no handle.
async function profiles(userIds: string[]): Promise<Map<string, ProfileRow>> {
  try {
    const ids = userIds.map(encodeURIComponent).join(",");
    const rows = await authQuery<ProfileRow[]>(`user_profiles?select=user_id,handle,display_name&user_id=in.(${ids})`);
    return new Map(rows.map((row) => [row.user_id, row]));
  } catch {
    return new Map();
  }
}

/** The accounts signed in on this browser, the current one first. */
export async function deviceAccounts(headers: Headers, current: AccountUser): Promise<DeviceAccount[]> {
  const others = (await deviceSessions(headers)).filter((s) => s.userId !== current.id);
  const accounts = [{ userId: current.id, name: current.name }, ...others.map(({ userId, name }) => ({ userId, name }))];
  const rows = await profiles(accounts.map((a) => a.userId));
  return accounts.map(({ userId, name }) => ({
    userId,
    displayName: rows.get(userId)?.display_name || name,
    handle: rows.get(userId)?.handle ?? null,
    current: userId === current.id,
  }));
}
