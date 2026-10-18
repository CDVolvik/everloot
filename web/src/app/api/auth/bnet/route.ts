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

// Better Auth builds the authorize URL and its state cookie; this route only forwards both to the browser.
async function startBetterAuthSignIn(req: Request) {
  const start = await getAuth().api.signInSocial({
    body: { provider: "battlenet", callbackURL: "/" }, headers: req.headers, asResponse: true,
  });
  const { url } = await start.json() as { url?: string };
  if (!start.ok || !url) return NextResponse.json({ error: "Battle.net sign-in is unavailable" }, { status: start.ok ? 503 : start.status });
  const response = NextResponse.redirect(url);
  for (const cookie of start.headers.getSetCookie()) response.headers.append("set-cookie", cookie);
  return response;
}
