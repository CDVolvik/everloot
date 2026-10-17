import { NextResponse } from "next/server";
import { MARKET_RULE, marketPrices, marketRealms } from "../../../../../../kb/src/market";
import { uploadStore } from "@/lib/upload-store";
export const dynamic = "force-dynamic";

const FIELDS = ["itemId", "market", "min", "historical", "quantity", "day", "reporters"] as const;
// The rollup changes once per cron run (ten minutes); let the CDN answer repeat requests.
const CACHE = { "Cache-Control": "public, max-age=0, s-maxage=300" };

/**
 * GET /api/market/prices?realm=<realm> — every item with a public market value on that realm,
 * as tuples (see `fields`). The companion writes them into the EverlootPrices slot addon.
 * Without `realm` it lists the realms that have scans. Install ids stay on the site.
 */
export async function GET(req: Request) {
  const realm = new URL(req.url).searchParams.get("realm")?.trim() ?? "";
  if (realm.length > 60) return NextResponse.json({ ok: false, error: "Realm name too long." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const market = await uploadStore.loadMarket();
  if (!market.state) {
    return NextResponse.json({ ok: false, error: "Market values unavailable. They are unrecorded, not zero." },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!realm) return NextResponse.json({ ok: true, dataAsOf: market.dataAsOf, realms: marketRealms(market.state) }, { headers: CACHE });
  return NextResponse.json(
    { ok: true, dataAsOf: market.dataAsOf, rule: MARKET_RULE, fields: FIELDS, ...marketPrices(market.state, realm, new Date()) },
    { headers: CACHE },
  );
}
