import { NextResponse } from "next/server";
import { computeRollups } from "@/lib/rollup-compute";

/** GET /api/rollups/drops — public corroborated drop rates with kill counts. */
export const dynamic = "force-dynamic";

export async function GET() {
  const { rates, stats } = await computeRollups();
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    stats,
    rates: rates.filter((r) => r.public),
    queued: rates.filter((r) => !r.public).length,
  });
}
