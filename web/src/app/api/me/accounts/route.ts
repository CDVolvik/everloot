import { NextResponse } from "next/server";
import { deviceAccounts, profilesOn } from "@/lib/auth/device-accounts";
import { getUser } from "@/lib/supabase/server";

/**
 * GET /api/me/accounts: the accounts signed in on this browser (DeviceAccount[]), the current one first. With
 * the legacy session only the current account. 404 while EVERLOOT_PROFILES is off.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: Request) {
  if (!profilesOn()) return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: NO_STORE });
    return NextResponse.json(await deviceAccounts(req.headers, user), { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Accounts are unavailable right now." }, { status: 503, headers: NO_STORE });
  }
}
