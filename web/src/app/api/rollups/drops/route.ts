import { NextResponse } from "next/server";
import { computeRollups } from "@/lib/rollup-compute";

/** GET /api/rollups/drops — public corroborated drop rates with kill counts. */
export const dynamic = "force-dynamic";

export async function GET() {
  const { rates, measuredZeros, stats } = await computeRollups();
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    stats,
    unreachable: stats.unreachable,
    rates: stats.unreachable ? [] : rates.filter((r) => r.public),
    measuredZeros: stats.unreachable ? [] : measuredZeros.filter((z) => z.public),
    queued: stats.unreachable ? null : rates.filter((r) => !r.public).length + measuredZeros.filter((z) => !z.public).length,
  });
}
