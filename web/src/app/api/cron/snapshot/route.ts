import { NextResponse } from "next/server";
import { uploadStore } from "@/lib/upload-store";
import { intakeQuota } from "@/lib/intake-quota";

/**
 * GET /api/cron/snapshot — Vercel Cron (vercel.json) extends the corpus snapshot with new uploads.
 * Vercel sends `Authorization: Bearer $CRON_SECRET`; without the secret configured it refuses to run.
 * `?rebuild=1` rebuilds from empty, which is how a deleted upload leaves the snapshot.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET is not set" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const rebuild = new URL(req.url).searchParams.get("rebuild") === "1";
  try {
    const result = await uploadStore.writeSnapshot({ rebuild });
    await intakeQuota.prune();
    return NextResponse.json({ ok: true, rebuild, ...result });
  } catch (err) {
    console.error("snapshot failed", err);
    return NextResponse.json({ ok: false, error: "snapshot failed" }, { status: 500 });
  }
}
