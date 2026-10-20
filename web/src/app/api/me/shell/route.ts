import { NextResponse } from "next/server";
import { fail, loadAccountShell, NO_STORE, profilesOn, unavailable } from "@/lib/account-shell";
import { signInPath } from "@/lib/auth/return-to";

/**
 * GET /api/me/shell: the signed-in player's AccountShell as the body, for the header and the avatar menu in the
 * browser (the root layout stays static). 401 signed out, 404 with EVERLOOT_PROFILES off. Pages that change the
 * shell dispatch SHELL_CHANGED_EVENT on window after a successful write, so the menu can fetch it again.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  if (!profilesOn()) return fail(404, "Not found");
  try {
    const shell = await loadAccountShell();
    if (!shell) return NextResponse.json({ error: "Sign in first.", signIn: signInPath("/settings") }, { status: 401, headers: NO_STORE });
    return NextResponse.json(shell, { headers: NO_STORE });
  } catch {
    return unavailable();
  }
}
