import { NextResponse } from "next/server";
import { intakeQuota } from "@/lib/intake-quota";
import { uploadStore } from "@/lib/upload-store";

/**
 * POST /api/waitlist — launch notification signups per tool.
 * Stored by `uploadStore`: a Supabase table in production, a gitignored file in dev.
 * Admission uses the same shared per-IP and global request quota as intake, before the body is read.
 */
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG = /^[a-z0-9-]{1,60}$/;

export async function POST(req: Request) {
  try {
    const quota = await intakeQuota.request(req);
    if (!quota.allowed) {
      return NextResponse.json({ ok: false, error: "rate limited" },
        { status: 429, headers: { "retry-after": String(quota.retryAfter), "cache-control": "no-store" } });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "signup unavailable, retry later" }, { status: 503 });
  }
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
  const persisted = await uploadStore.putWaitlist({ toolSlug, email: email.trim().toLowerCase(), ts: new Date().toISOString() });
  return NextResponse.json({ ok: true, persisted });
}
