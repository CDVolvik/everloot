import type { Metadata } from "next";
import Link from "next/link";
import { auctionSightingsFromRecords, handleAuctionHistory } from "../../../../../kb/src/auction-history";
import {
  HISTORY_DAYS, MARKET_RULE, formatCopper, itemMarket, marketPrices, marketRealms, realmMarket, type PublicDay,
} from "../../../../../kb/src/market";
import { STORAGE_UNREACHABLE, uploadStore } from "@/lib/upload-store";
import { dataAgeLabel } from "@/lib/data-age";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Forever market",
  description: "WoW: Forever auction prices from full scans players started and uploaded. A day is public after 3 installs scanned the item.",
  alternates: { canonical: "/tools/auctions" },
};

const MAX_ROWS = 200;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function money(copper: number | null): string {
  return copper === null ? "unrecorded" : formatCopper(copper);
}

/** Market value per public day across the 60-day window; one line, drawn only with two or more days. */
function HistoryChart({ points }: { points: PublicDay[] }) {
  if (points.length < 2) return null;
  const width = 600, height = 120, pad = 8;
  const days = points.map((p) => Date.parse(`${p.day}T00:00:00Z`) / 86_400_000);
  const last = days[days.length - 1]!;
  const first = last - (HISTORY_DAYS - 1);
  const values = points.map((p) => p.market);
  const low = Math.min(...values), high = Math.max(...values);
  const x = (d: number) => pad + ((d - first) / (HISTORY_DAYS - 1)) * (width - 2 * pad);
  const y = (v: number) => high === low ? height / 2 : pad + (1 - (v - low) / (high - low)) * (height - 2 * pad);
  const line = points.map((p, i) => `${x(days[i]!).toFixed(1)},${y(p.market).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="market-chart-title" className="w-full h-28 text-gold-400">
      <title id="market-chart-title">{`Market value per public day, last ${HISTORY_DAYS} days: ${formatCopper(low)} to ${formatCopper(high)}`}</title>
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2" />
      {points.map((p, i) => <circle key={p.day} cx={x(days[i]!)} cy={y(p.market)} r="3" fill="currentColor" />)}
    </svg>
  );
}

export default async function AuctionsPage(
  props: {
    searchParams: Promise<{ realm?: string | string[]; item?: string | string[] }>;
  }
) {
  const searchParams = await props.searchParams;
  const realm = one(searchParams.realm).trim().slice(0, 60);
  const itemText = one(searchParams.item);
  const itemId = /^\d+$/.test(itemText) ? Number(itemText) : 0;
  const now = new Date();
  const market = await uploadStore.loadMarket();
  const state = market.state;
  const realmName = state && realm ? marketPrices(state, realm, now).realm : realm;
  const rows = state && realm && !itemId ? realmMarket(state, realm, now) : [];
  const item = state && realm && itemId ? itemMarket(state, realm, itemId, now) : null;
  const corpus = item ? await uploadStore.loadCorpus() : null;
  const browse = corpus && (corpus.unreachable
    ? STORAGE_UNREACHABLE
    : handleAuctionHistory({ realm, itemId }, auctionSightingsFromRecords(corpus.records)));
  const itemHref = (id: number) => `/tools/auctions?realm=${encodeURIComponent(realmName)}&item=${id}`;

  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">WoW: Forever · auctions</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-parchment-100 tracking-tight">Forever market</h1>
        <p className="text-sm text-parchment-100/70 max-w-2xl">
          Prices from full auction-house scans players started with the Everloot addon and uploaded. {MARKET_RULE}
        </p>
      </header>

      <form method="get" className="rounded-xl border border-parchment-100/10 bg-parchment-900 p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm text-parchment-100/80 space-y-1">
            <span className="block text-xs uppercase tracking-wider text-parchment-100/50">Realm</span>
            <input name="realm" defaultValue={realm} className="w-full rounded-lg border border-parchment-100/15 bg-parchment-950 px-3 py-2 text-parchment-100" />
          </label>
          <label className="text-sm text-parchment-100/80 space-y-1">
            <span className="block text-xs uppercase tracking-wider text-parchment-100/50">Item id (optional)</span>
            <input name="item" defaultValue={itemText} inputMode="numeric" className="w-full rounded-lg border border-parchment-100/15 bg-parchment-950 px-3 py-2 text-parchment-100" />
          </label>
        </div>
        <button type="submit" className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-parchment-950">Show prices</button>
      </form>

      {!state && <p className="text-sm text-parchment-100/80">Market values are unavailable right now. They are unrecorded, not zero.</p>}

      {state && !realm && (
        <section className="space-y-2">
          <h2 className="font-display text-xl text-parchment-100">Realms with scans</h2>
          {marketRealms(state).length === 0
            ? <p className="text-sm text-parchment-100/70">No scans uploaded yet.</p>
            : <ul className="text-sm space-y-1">{marketRealms(state).map((name) => (
                <li key={name}><Link href={`/tools/auctions?realm=${encodeURIComponent(name)}`} className="text-gold-400 hover:underline underline-offset-4">{name}</Link></li>
              ))}</ul>}
        </section>
      )}

      {state && realm && !itemId && (
        rows.length === 0
          ? <p className="text-sm text-parchment-100/70">No public market values on {realmName} yet. A day becomes public when 3 installs scanned an item.</p>
          : (
            <section className="space-y-2">
              <h2 className="font-display text-xl text-parchment-100">{realmName}</h2>
              <p className="text-xs text-parchment-100/60">
                {rows.length > MAX_ROWS ? `The ${MAX_ROWS} items with the most units listed, of ${rows.length}.` : `${rows.length} items.`}
              </p>
              <div className="overflow-x-auto rounded-xl border border-parchment-100/10">
                <table className="w-full text-sm text-parchment-100/85">
                  <thead className="text-left text-xs uppercase tracking-wider text-parchment-100/50">
                    <tr><th className="p-2">Item</th><th className="p-2">Market</th><th className="p-2">Minimum</th><th className="p-2">Historical</th><th className="p-2">Units</th><th className="p-2">Reporters</th><th className="p-2">Day</th></tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, MAX_ROWS).map((v) => (
                      <tr key={v.itemId} className="border-t border-parchment-100/10">
                        <td className="p-2"><Link href={`/database/items/${v.itemId}`} className="text-gold-400 hover:underline underline-offset-4">{v.itemId}</Link>
                          {" · "}<Link href={itemHref(v.itemId)} className="text-parchment-100/60 hover:underline underline-offset-4">history</Link></td>
                        <td className="p-2">{money(v.market)}</td>
                        <td className="p-2">{formatCopper(v.min)}</td>
                        <td className="p-2">{formatCopper(v.historical)}</td>
                        <td className="p-2">{v.quantity}</td>
                        <td className="p-2">{v.reporters}</td>
                        <td className="p-2">{v.day}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )
      )}

      {item && (
        <section className="space-y-4">
          <h2 className="font-display text-xl text-parchment-100">{realmName} item <Link href={`/database/items/${itemId}`} className="text-gold-400 hover:underline underline-offset-4">{itemId}</Link></h2>
          {!item.value
            ? <p className="text-sm text-parchment-100/70">No public market value yet. A day becomes public when 3 installs scanned this item.</p>
            : (
              <>
                <ul className="text-sm text-parchment-100/85 space-y-1">
                  <li>Market value: {money(item.value.market)}</li>
                  <li>Minimum buyout: {formatCopper(item.value.min)} ({item.value.day}, {item.value.reporters} reporters)</li>
                  <li>Historical: {formatCopper(item.value.historical)}</li>
                  <li>Units listed: {item.value.quantity}</li>
                </ul>
                <HistoryChart points={item.points} />
                <ul className="text-xs text-parchment-100/70 space-y-0.5">
                  {[...item.points].reverse().map((p) => (
                    <li key={p.day}>{p.day} · value {formatCopper(p.market)} · min {formatCopper(p.min)} · {p.quantity} units · {p.reporters} reporters</li>
                  ))}
                </ul>
              </>
            )}
          {browse && (
            <div className="space-y-2">
              <h3 className="text-sm uppercase tracking-wider text-parchment-100/50">Browse history</h3>
              <p className="text-xs text-parchment-100/60">Single listings players saw while browsing (the auction_history tool).</p>
              <pre className="whitespace-pre-wrap text-sm text-parchment-100/85 rounded-xl border border-parchment-100/10 bg-parchment-900 p-5">{browse}</pre>
            </div>
          )}
        </section>
      )}

      {state && <p className="text-xs text-parchment-100/60">{dataAgeLabel(market.dataAsOf)}</p>}

      <p className="text-sm text-parchment-100/60">
        <Link href="/tools/gold-per-hour" className="text-gold-400 hover:underline underline-offset-4">Gold per hour</Link>
        {" · "}
        <Link href="/tools/gold-ledger" className="text-gold-400 hover:underline underline-offset-4">Gold ledger</Link>
      </p>
    </article>
  );
}
