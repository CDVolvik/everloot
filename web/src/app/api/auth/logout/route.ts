import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/auth/logout — Log out the current user.
 * Invalidates the session cookie and deletes the server-side session.
 */
export async function POST() {
  const supabase = createClient();
  
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    // Delete server-side session
    await supabase
      .from("sessions")
      .delete()
      .eq("user_id", session.user.id);
    
    // Sign out from Supabase auth
    await supabase.auth.signOut();
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("everloot_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  return response;
}