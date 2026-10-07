import { NextResponse } from "next/server";

/**
 * GET /api/auth/bnet — Initiate Battle.net OAuth flow.
 * Redirects user to Battle.net authorization page.
 */
export async function GET(req: Request) {
  const clientId = process.env.BNET_CLIENT_ID;
  const redirectUri = process.env.BNET_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/bnet/callback`;
  const state = crypto.randomUUID();
  
  if (!clientId) {
    return NextResponse.json({ error: "Battle.net client ID not configured" }, { status: 500 });
  }

  // Store state in cookie for CSRF protection
  const cookieStore = (await import("next/headers")).cookies();
  (await cookieStore).set("bnet_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10, // 10 minutes
    path: "/",
  });

  const scope = "openid wow.profile";
  const authUrl = `https://oauth.battle.net/authorize?` +
    `client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${encodeURIComponent(state)}`;

  return NextResponse.redirect(authUrl);
}