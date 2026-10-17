import { NextResponse } from "next/server";
import { sharingStore, uploadStore } from "@/lib/upload-store";
import { intakeQuota } from "@/lib/intake-quota";

/**
 * GET /api/cron/snapshot — Vercel Cron (vercel.json) extends the corpus snapshot with new uploads,
 * then folds new full auction scans into the market rollup. The market step runs only after the
 * corpus step succeeded; if it fails the corpus snapshot is already current, the response is a 500
 * and the next run retries the same uploads.
 * Vercel sends `Authorization: Bearer $CRON_SECRET`; without the secret configured it refuses to run.
 * `?rebuild=1` rebuilds both from empty, which is how a deleted upload leaves them. The market
 * rebuild reads only uploads from the last 62 days (older ones cannot hold a day it keeps), and
 * is also how an unusable market.json is replaced. The completion rollup folds at most a batch of uploads per
 * run (and stops early at its time budget) and saves its place; `remaining` says how many are left. A
 * rebuild is folded into a separate object over several runs and replaces the served rollup only when it
 * has caught up, so pages never read a partial one; `rebuilding` says one is under way.
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
    // The completion rollup has its own watermark too, and runs after the market so it cannot starve it.
    let completion: { added: number; remaining: number; trimmed: number; rebuilding: boolean } | null = null;
    try {
      completion = await uploadStore.writeCompletion({ rebuild, authority: () => sharingStore.loadState() });
    } catch (err) {
      console.error("completion rollup failed", err);
    }
    if (!completion) return NextResponse.json({ ok: false, error: "completion rollup failed", rebuild, ...result, market }, { status: 500 });
    return NextResponse.json({ ok: true, rebuild, ...result, market, completion });
  } catch (err) {
    console.error("snapshot failed", err);
    return NextResponse.json({ ok: false, error: "snapshot failed" }, { status: 500 });
  }
}
