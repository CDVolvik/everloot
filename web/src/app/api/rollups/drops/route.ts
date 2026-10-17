import { NextResponse } from "next/server";
import { computeRollups } from "@/lib/rollup-compute";
import { recordUsage } from "@/lib/usage-metrics";

/** GET /api/rollups/drops — public corroborated drop rates with kill counts. */
export const dynamic = "force-dynamic";

export async function GET() {
  recordUsage("api.rollups_drops");
  const { rates, measuredZeros, stats } = await computeRollups();
  return NextResponse.json({
    // generatedAt is when this response was made; dataAsOf is when the uploads behind it were current.
    generatedAt: new Date().toISOString(),
    dataAsOf: stats.dataAsOf,
    stats,
    unreachable: stats.unreachable,
    rates: stats.unreachable ? [] : rates.filter((r) => r.public),
    measuredZeros: stats.unreachable ? [] : measuredZeros.filter((z) => z.public),
    queued: stats.unreachable ? null : rates.filter((r) => !r.public).length + measuredZeros.filter((z) => !z.public).length,
  });
}
