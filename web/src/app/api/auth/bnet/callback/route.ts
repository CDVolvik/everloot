import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/auth/bnet/callback — Handle Battle.net OAuth callback.
 * Exchanges code for tokens, fetches user profile, creates/updates Supabase user.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const cookieStore = (await import("next/headers")).cookies();
  const storedState = (await cookieStore).get("bnet_oauth_state")?.value;
  (await cookieStore).delete("bnet_oauth_state");

  if (error) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/auth/error?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/auth/error?error=invalid_state`);
  }

  const clientId = process.env.BNET_CLIENT_ID;
  const clientSecret = process.env.BNET_CLIENT_SECRET;
  const redirectUri = process.env.BNET_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/bnet/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/auth/error?error=server_config`);
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth.battle.net/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      console.error("BNet token exchange failed:", await tokenRes.text());
      throw new Error("token_exchange_failed");
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      token_type: string;
    };

    // Fetch user profile
    const profileRes = await fetch("https://us.battle.net/oauth/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!profileRes.ok) {
      console.error("BNet profile fetch failed:", await profileRes.text());
      throw new Error("profile_fetch_failed");
    }

    const profile = await profileRes.json() as {
      sub: string; // Battle.net account ID
      battletag: string;
      id: number; // BNet account ID (numeric)
    };

    // Upsert user in Supabase
    const supabase = createClient();
    const { data: user, error } = await supabase
      .from("users")
      .upsert({
        bnet_id: profile.id.toString(),
        battletag: profile.battletag,
        access_token_encrypted: tokens.access_token, // TODO: encrypt
        refresh_token_encrypted: tokens.refresh_token, // TODO: encrypt
        token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "bnet_id" })
      .select()
      .single();

    if (error) {
      console.error("Supabase upsert failed:", error);
      throw new Error("db_upsert_failed");
    }

    // Set session cookie
    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    
    await supabase
      .from("sessions")
      .insert({
        id: sessionToken,
        user_id: user.id,
        expires_at: expiresAt.toISOString(),
      });

    const response = NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/dashboard`);
    response.cookies.set("everloot_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    });

    return response;
  } catch (err) {
    console.error("BNet OAuth callback error:", err);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/auth/error?error=callback_failed`);
  }
}