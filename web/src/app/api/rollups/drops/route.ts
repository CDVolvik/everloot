import { NextResponse } from "next/server";
import { admit, attribution, attributionHeaders, badPage, pageOf, pageRequest } from "@/lib/data-guard";
import { computeRollups } from "@/lib/rollup-compute";
import { recordUsage } from "@/lib/usage-metrics";

/**
 * GET /api/rollups/drops — public corroborated drop rates with kill counts. `?offset=` and `?limit=` page
 * both lists together; with the data guard on, a page is capped and `next` links the following page.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  recordUsage("api.rollups_drops");
  const admitted = await admit(req, "drops");
  if (admitted instanceof Response) return admitted;
  const at = pageRequest(req, admitted.pageMax);
  if (!at) return badPage();
  const { rates, measuredZeros, stats } = await computeRollups();
  const publicRates = stats.unreachable ? [] : rates.filter((r) => r.public);
  const publicZeros = stats.unreachable ? [] : measuredZeros.filter((z) => z.public);
  const ratePage = pageOf(req, publicRates, at);
  const zeroPage = pageOf(req, publicZeros, at);
  return NextResponse.json({
    // generatedAt is when this response was made; dataAsOf is when the uploads behind it were current.
    generatedAt: new Date().toISOString(),
    dataAsOf: stats.dataAsOf,
    stats,
    unreachable: stats.unreachable,
    rates: ratePage.items,
    measuredZeros: zeroPage.items,
    queued: stats.unreachable ? null : rates.filter((r) => !r.public).length + measuredZeros.filter((z) => !z.public).length,
    offset: ratePage.page.offset,
    limit: ratePage.page.limit,
    totalRates: ratePage.page.total,
    totalMeasuredZeros: zeroPage.page.total,
    next: ratePage.page.next ?? zeroPage.page.next,
    attribution: attribution("/database/drops"),
  }, { headers: attributionHeaders() });
}
