import { NextResponse } from "next/server";
import { revokeSession, siteUrl } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== siteUrl()) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
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
