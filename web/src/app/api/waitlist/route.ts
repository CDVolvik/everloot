import { NextResponse } from "next/server";
import { uploadStore } from "@/lib/upload-store";

/**
 * POST /api/waitlist — launch notification signups per tool.
 * Stored by `uploadStore`: a Supabase table in production, a gitignored file in dev.
 */
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG = /^[a-z0-9-]{1,60}$/;
const RATE_MAX = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const hits = new Map<string, number[]>();

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "body must be JSON" }, { status: 400 });
  }
  const { toolSlug, email } = (body ?? {}) as { toolSlug?: unknown; email?: unknown };
  if (typeof toolSlug !== "string" || !SLUG.test(toolSlug)) {
    return NextResponse.json({ ok: false, error: "unknown list" }, { status: 400 });
  }
  if (typeof email !== "string" || !EMAIL.test(email.trim()) || email.length > 200) {
    return NextResponse.json({ ok: false, error: "invalid email" }, { status: 422 });
  }
  const now = Date.now();
  const window = (hits.get(email) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  window.push(now);
  hits.set(email, window);
  if (window.length > RATE_MAX) {
    return NextResponse.json({ ok: false, error: "rate limited" }, { status: 429 });
  }
  const persisted = await uploadStore.putWaitlist({ toolSlug, email: email.trim().toLowerCase(), ts: new Date(now).toISOString() });
  return NextResponse.json({ ok: true, persisted });
}
