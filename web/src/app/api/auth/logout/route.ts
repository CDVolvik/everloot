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
  response.cookies.set("everloot_session", "", {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 0, path: "/",
  });
  return response;
}

async function signOutOfBetterAuth(req: Request) {
  try {
    const out = await getAuth().api.signOut({ headers: req.headers, asResponse: true });
    if (!out.ok) throw new Error("sign-out failed");
    const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    for (const cookie of out.headers.getSetCookie()) response.headers.append("set-cookie", cookie);
    return response;
  } catch {
    return NextResponse.json({ error: "Logout is temporarily unavailable" }, { status: 503 });
  }
}
