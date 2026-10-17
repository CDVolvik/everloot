import { NextResponse } from "next/server";
import { uploadStore } from "@/lib/upload-store";
import { intakeQuota } from "@/lib/intake-quota";

/**
 * GET /api/cron/snapshot — Vercel Cron (vercel.json) extends the corpus snapshot with new uploads,
 * then folds new full auction scans into the market rollup.
 * Vercel sends `Authorization: Bearer $CRON_SECRET`; without the secret configured it refuses to run.
 * `?rebuild=1` rebuilds both from empty, which is how a deleted upload leaves them.
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
    // The market has its own watermark, so a failure here leaves the corpus snapshot current
    // and the next run retries the same uploads.
    let market: { added: number; scans: number } | null = null;
    try {
      market = await uploadStore.writeMarket({ rebuild });
    } catch (err) {
      console.error("market rollup failed", err);
    }
    if (!market) return NextResponse.json({ ok: false, error: "market rollup failed", rebuild, ...result }, { status: 500 });
    return NextResponse.json({ ok: true, rebuild, ...result, market });
  } catch (err) {
    console.error("snapshot failed", err);
    return NextResponse.json({ ok: false, error: "snapshot failed" }, { status: 500 });
  }
}
