import { NextResponse } from "next/server";
import { authV2Enabled, getAuth } from "@/lib/auth/auth";
import { deviceSessions, profilesOn } from "@/lib/auth/device-accounts";
import { revokeSession, siteUrl } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== siteUrl()) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  if (authV2Enabled()) return signOutOfBetterAuth(req);
  try {
    await revokeSession();
  } catch {
    return NextResponse.json({ error: "Logout is temporarily unavailable" }, { status: 503 });
  }
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  clearV1Cookie(response);
  return response;
}

function clearV1Cookie(response: NextResponse) {
  response.cookies.set("everloot_session", "", {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 0, path: "/",
  });
}

async function signOutOfBetterAuth(req: Request) {
  // A v1 session left from before the cutover would come back if the flag were rolled back.
  // Best effort: the Better Auth sign-out below is what this request is for.
  await revokeSession().catch(() => {});
  try {
    const { out, next } = await endSession(req.headers);
    if (!out.ok) throw new Error("sign-out failed");
    const response = NextResponse.json(next === undefined ? { ok: true } : { ok: true, next }, { headers: { "Cache-Control": "no-store" } });
    // Before the appends: response.cookies.set rewrites the whole set-cookie header.
    clearV1Cookie(response);
    for (const cookie of out.headers.getSetCookie()) response.headers.append("set-cookie", cookie);
    return response;
  } catch {
    return NextResponse.json({ error: "Logout is temporarily unavailable" }, { status: 503 });
  }
}

// With account switching on (EVERLOOT_PROFILES), only the current account signs out, and the next account signed
// in on this browser, if any, becomes current; `next` tells the page which. A session with no multi-session
// cookie (made before the plugin) cannot be revoked that way, so it falls back to a full sign-out.
async function endSession(headers: Headers): Promise<{ out: Response; next?: boolean }> {
  const auth = getAuth();
  const session = profilesOn() ? await auth.api.getSession({ headers, query: { disableRefresh: true } }) : null;
  if (session) {
    const others = (await deviceSessions(headers)).filter((s) => s.userId !== session.user.id);
    const out = await auth.api.revokeDeviceSession({ headers, body: { sessionToken: session.session.token }, asResponse: true });
    if (out.ok) return { out, next: others.length > 0 };
  }
  return { out: await auth.api.signOut({ headers, asResponse: true }) };
}
