import { NextResponse } from "next/server";
import { authV2Enabled, getAuth } from "@/lib/auth/auth";
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
    const out = await getAuth().api.signOut({ headers: req.headers, asResponse: true });
    if (!out.ok) throw new Error("sign-out failed");
    const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    // Before the appends: response.cookies.set rewrites the whole set-cookie header.
    clearV1Cookie(response);
    for (const cookie of out.headers.getSetCookie()) response.headers.append("set-cookie", cookie);
    return response;
  } catch {
    return NextResponse.json({ error: "Logout is temporarily unavailable" }, { status: 503 });
  }
}
