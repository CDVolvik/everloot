import { NextResponse } from "next/server";
import { authQuery, getUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ user: null }, { headers });
    const entitlements = await authQuery<Array<{ plan: string; status: string }>>(
      `entitlements?select=plan,status,current_period_end&user_id=eq.${encodeURIComponent(user.id)}`,
    );
    return NextResponse.json({ user: { ...user, entitlements } }, { headers });
  } catch {
    return NextResponse.json({ error: "Authentication is temporarily unavailable" }, { status: 503, headers });
  }
}
