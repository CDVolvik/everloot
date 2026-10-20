import { NextResponse } from "next/server";
import { fail, loadAccountShell, NO_STORE, profilesOn, unavailable } from "@/lib/account-shell";
import { signInPath } from "@/lib/auth/return-to";

/** GET /api/me/shell: {shell}, the signed-in player's AccountShell, for the header and the avatar menu in the browser. */
export const dynamic = "force-dynamic";

export async function GET() {
  if (!profilesOn()) return fail(404, "Not found");
  try {
    const shell = await loadAccountShell();
    if (!shell) return NextResponse.json({ error: "Sign in first.", signIn: signInPath("/settings") }, { status: 401, headers: NO_STORE });
    return NextResponse.json({ shell }, { headers: NO_STORE });
  } catch {
    return unavailable();
  }
}
