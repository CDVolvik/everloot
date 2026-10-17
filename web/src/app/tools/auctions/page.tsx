import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { auctionSightingsFromRecords, handleAuctionHistory } from "../../../../../kb/src/auction-history";
import {
  HISTORY_DAYS, MARKET_RULE, formatCopper, itemMarket, marketRealms, realmMarket, realmName as nameOf, type PublicDay,
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

/** A number, id or day, set in Geist Mono with tabular figures. */
function Num({ children }: { children: ReactNode }) {
  return <span className="font-mono tabular-nums text-fg">{children}</span>;
}

/** Market value per public day across the 60-day window; one thin line, drawn only with two or more days. */
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
    <figure className="space-y-2">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="market-chart-title" className="w-full h-28 rounded-xl border border-line bg-panel text-accent">
        <title id="market-chart-title">{`Market value per public day, last ${HISTORY_DAYS} days: ${formatCopper(low)} to ${formatCopper(high)}`}</title>
        <polyline points={line} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => <circle key={p.day} cx={x(days[i]!)} cy={y(p.market)} r="2.5" fill="currentColor" />)}
      </svg>
      <figcaption className="flex justify-between text-xs text-muted">
        <span>Last {HISTORY_DAYS} days</span>
        <span className="font-mono tabular-nums">{formatCopper(low)} to {formatCopper(high)}</span>
      </figcaption>
    </figure>
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
  const realmName = state && realm ? nameOf(state, realm) : realm;
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
        <p className="font-mono text-xs text-muted">WoW: Forever Â· auctions</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">Forever market</h1>
        <p className="text-sm text-fg-2 max-w-2xl">
          Prices from full auction-house scans players started with the Everloot addon and uploaded. {MARKET_RULE}
        </p>
      </header>

      <form method="get" className="rounded-xl border border-line bg-panel p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm text-fg-2 space-y-1">
            <span className="block text-xs font-mono text-muted">Realm</span>
            <input name="realm" defaultValue={realm} className="w-full rounded-lg border border-edge bg-canvas px-3 py-2 text-fg" />
          </label>
          <label className="text-sm text-fg-2 space-y-1">
            <span className="block text-xs font-mono text-muted">Item id (optional)</span>
            <input name="item" defaultValue={itemText} inputMode="numeric" className="w-full rounded-lg border border-edge bg-canvas px-3 py-2 font-mono text-fg" />
          </label>
        </div>
        <button type="submit" className="btn btn-primary text-sm">Show prices</button>
      </form>

      {!state && <p className="text-sm text-fg-2">Market values are unavailable right now. They are unrecorded, not zero.</p>}

      {state && !realm && (
        <section className="space-y-2">
          <h2 className="text-xl text-fg">Realms with scans</h2>
          {marketRealms(state, now).length === 0
            ? <p className="text-sm text-fg-2">No realm has public values yet. A realm is listed once 3 installs scanned the same item there.</p>
            : <ul className="text-sm space-y-1">{marketRealms(state, now).map((name) => (
                <li key={name}><Link href={`/tools/auctions?realm=${encodeURIComponent(name)}`} className="text-accent hover:underline underline-offset-4">{name}</Link></li>
              ))}</ul>}
        </section>
      )}

      {state && realm && !itemId && (
        rows.length === 0
          ? <p className="text-sm text-fg-2">No public market values on {realmName} yet. A day becomes public when 3 installs scanned an item.</p>
          : (
            <section className="space-y-2">
              <h2 className="text-xl text-fg">{realmName}</h2>
              <p className="text-xs text-muted">
                {rows.length > MAX_ROWS ? `The ${MAX_ROWS} items with the most units listed, of ${rows.length}.` : `${rows.length} items.`}
              </p>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-panel text-xs font-mono text-muted text-left">
                      <th className="px-4 py-3">Item</th>
                      <th className="px-4 py-3 text-right">Market</th>
                      <th className="px-4 py-3 text-right">Minimum</th>
                      <th className="px-4 py-3 text-right">Historical</th>
                      <th className="px-4 py-3 text-right">Units</th>
                      <th className="px-4 py-3 text-right">Reporters</th>
                      <th className="px-4 py-3 text-right">Day</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, MAX_ROWS).map((v) => (
                      <tr key={v.itemId} className="border-t border-line bg-panel text-fg">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Link href={`/database/items/${v.itemId}`} className="font-mono tabular-nums text-accent hover:underline underline-offset-4">{v.itemId}</Link>
                          <span className="text-muted">{" Â· "}</span>
                          <Link href={itemHref(v.itemId)} className="text-muted hover:text-fg hover:underline underline-offset-4">history</Link>
                        </td>
                        <td className={`px-4 py-3 text-right whitespace-nowrap font-mono tabular-nums${v.market === null ? " text-muted" : ""}`}>{money(v.market)}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap font-mono tabular-nums">{formatCopper(v.min)}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap font-mono tabular-nums">{formatCopper(v.historical)}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">{v.quantity}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">{v.reporters}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap font-mono tabular-nums">{v.day}</td>
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
          <h2 className="text-xl text-fg">{realmName} item <Link href={`/database/items/${itemId}`} className="font-mono tabular-nums text-accent hover:underline underline-offset-4">{itemId}</Link></h2>
          {!item.value
            ? <p className="text-sm text-fg-2">No public market value yet. A day becomes public when 3 installs scanned this item.</p>
            : (
              <>
                <ul className="text-sm text-fg-2 space-y-1">
                  <li>Market value: <Num>{money(item.value.market)}</Num></li>
                  <li>Minimum buyout: <Num>{formatCopper(item.value.min)}</Num> (<Num>{item.value.day}</Num>, <Num>{item.value.reporters}</Num> reporters)</li>
                  <li>Historical: <Num>{formatCopper(item.value.historical)}</Num></li>
                  <li>Units listed: <Num>{item.value.quantity}</Num></li>
                </ul>
                <HistoryChart points={item.points} />
                <ul className="font-mono tabular-nums text-xs text-fg-2 space-y-0.5">
                  {[...item.points].reverse().map((p) => (
                    <li key={p.day}>{p.day} Â· value {formatCopper(p.market)} Â· min {formatCopper(p.min)} Â· {p.quantity} units Â· {p.reporters} reporters</li>
                  ))}
                </ul>
              </>
            )}
          {browse && (
            <div className="space-y-2">
              <h3 className="font-mono text-xs text-muted">Browse history</h3>
              <p className="text-xs text-muted">Single listings players saw while browsing (the auction_history tool).</p>
              <pre className="whitespace-pre-wrap text-sm text-fg rounded-xl border border-line bg-panel p-5">{browse}</pre>
            </div>
          )}
        </section>
      )}

      {state && <p className="text-xs text-muted">{dataAgeLabel(market.dataAsOf)}</p>}

      <p className="text-sm text-muted">
        <Link href="/tools/gold-per-hour" className="text-accent hover:underline underline-offset-4">Gold per hour</Link>
        {" Â· "}
        <Link href="/tools/gold-ledger" className="text-accent hover:underline underline-offset-4">Gold ledger</Link>
      </p>
    </article>
  );
}
