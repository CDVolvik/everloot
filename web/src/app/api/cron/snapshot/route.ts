import { NextResponse } from "next/server";
import { uploadStore } from "@/lib/upload-store";
import { intakeQuota } from "@/lib/intake-quota";
import { pruneKeys } from "@/lib/api-keys";
import { guardOn } from "@/lib/data-guard";

/**
 * GET /api/cron/snapshot — Vercel Cron (vercel.json) extends the corpus snapshot with new uploads,
 * then folds new full auction scans into the market rollup. The market step runs only after the
 * corpus step succeeded; if it fails the corpus snapshot is already current, the response is a 500
 * and the next run retries the same uploads.
 * Vercel sends `Authorization: Bearer $CRON_SECRET`; without the secret configured it refuses to run.
 * `?rebuild=1` rebuilds both from empty, which is how a deleted upload leaves them. The market
 * rebuild reads only uploads from the last 62 days (older ones cannot hold a day it keeps), and
 * is also how an unusable market.json is replaced.
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
    // Key retention (lib/api-keys.ts) runs only once the data guard's tables exist; a failure is retried next run.
    if (guardOn()) {
      try { await pruneKeys(); } catch (err) { console.error("key retention failed", err); }
    }
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
