import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authV2Enabled, getAuth } from "@/lib/auth/auth";
import { siteUrl } from "@/lib/supabase/server";

/**
 * GET /api/auth/bnet — Initiate Battle.net OAuth flow.
 * Redirects user to Battle.net authorization page.
 */
export async function GET(req: Request) {
  const clientId = process.env.BNET_CLIENT_ID;
  const redirectUri = process.env.BNET_REDIRECT_URI ?? `${siteUrl()}/api/auth/bnet/callback`;
  const state = crypto.randomUUID();
  
  if (!clientId || !process.env.BNET_CLIENT_SECRET) {
    return NextResponse.json({ error: "Battle.net sign-in is not configured" }, { status: 503 });
  }

  if (authV2Enabled()) return startBetterAuthSignIn(req);

  // Store state in cookie for CSRF protection
  const cookieStore = await cookies();
  cookieStore.set("bnet_oauth_state", state, {
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

// The start goes through Better Auth's router, not api.signInSocial: only the router applies the rate
// limiter, and it keys on the caller's address, so that header travels with the request.
async function startBetterAuthSignIn(req: Request) {
  const headers = new Headers({ "content-type": "application/json", origin: siteUrl() });
  for (const name of ["x-vercel-forwarded-for", "x-forwarded-for", "x-real-ip", "cookie"]) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  const start = await getAuth().handler(new Request(`${process.env.BETTER_AUTH_URL?.trim() || siteUrl()}/api/auth/sign-in/social`, {
    method: "POST", headers, body: JSON.stringify({ provider: "battlenet", callbackURL: "/" }),
  }));
  const { url } = await start.json().catch(() => ({})) as { url?: string };
  if (!start.ok || !url) return NextResponse.json({ error: "Battle.net sign-in is unavailable" }, { status: start.ok ? 503 : start.status });
  const response = NextResponse.redirect(url);
  for (const cookie of start.headers.getSetCookie()) response.headers.append("set-cookie", cookie);
  return response;
}
