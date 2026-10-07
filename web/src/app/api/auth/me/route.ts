import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/auth/me — Get current authenticated user.
 * Returns user profile and entitlements.
 */
export async function GET() {
  const supabase = createClient();
  
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ user: null });
  }

  // Fetch user profile with entitlements
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*, entitlements(*)")
    .eq("id", session.user.id)
    .single();

  if (error) {
    console.error("Profile fetch error:", error);
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: {
      id: session.user.id,
      email: session.user.email,
      battletag: profile.battletag,
      bnet_id: profile.bnet_id,
      entitlements: profile.entitlements ?? [],
    },
  });
}