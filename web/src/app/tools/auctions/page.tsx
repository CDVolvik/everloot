import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import type { ReactNode } from "react";
import { auctionSightingsFromRecords, handleAuctionHistory } from "../../../../../kb/src/auction-history";
import {
  HISTORY_DAYS, MARKET_RULE, formatCopper, itemMarket, marketRealms, realmMarket, realmName as nameOf, type PublicDay,
} from "../../../../../kb/src/market";
import { STORAGE_UNREACHABLE, uploadStore } from "@/lib/upload-store";
import { dataAgeLabel } from "@/lib/data-age";
import { loadItemTips, loadSiteAssets } from "@/lib/game-assets";
import ItemTip from "@/components/game/ItemTip";
import GameCredit from "@/components/game/GameCredit";
import { trailFor } from "@/lib/breadcrumbs";
import { Card, Container, DataTable, Disclosure, EmptyState, Field, PageHeader, SectionHeading, SourceLine, type Column } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...pageMetadata({ title: "WoW Forever Market", description: "WoW: Forever auction prices from full scans players started and uploaded. A day is public after 3 reporters scanned the item.", path: "/tools/auctions" }),
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
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="market-chart-title" className="h-28 w-full rounded-card border border-line bg-panel text-accent">
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
  // Icons and tooltips for items players scanned; an item id typed into the form gets one only once it has scans.
  const shownIds = [...rows.slice(0, MAX_ROWS).map((v) => v.itemId), ...(item && (item.value || item.points.length) ? [itemId] : [])];
  const assets = shownIds.length ? await loadSiteAssets() : null;
  const tips = await loadItemTips(assets, shownIds);

  const realms = state ? marketRealms(state, now) : [];

  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    {
      key: "item", header: "Item", nowrap: true, cell: (v) => (
        <>
          <ItemTip tip={tips.get(v.itemId)}>
            <Link href={`/database/items/${v.itemId}`} className="font-mono tabular-nums text-accent hover:underline underline-offset-4">{v.itemId}</Link>
          </ItemTip>
          <span className="text-muted">{" · "}</span>
          <Link href={itemHref(v.itemId)} className="text-muted hover:text-fg hover:underline underline-offset-4">history</Link>
        </>
      ),
    },
    { key: "market", header: "Market", numeric: true, cell: (v) => <span className={v.market === null ? "text-muted" : undefined}>{money(v.market)}</span> },
    { key: "min", header: "Minimum", numeric: true, cell: (v) => formatCopper(v.min) },
    { key: "historical", header: "Historical", numeric: true, cell: (v) => formatCopper(v.historical) },
    { key: "units", header: "Units", numeric: true, cell: (v) => v.quantity },
    { key: "reporters", header: "Reporters", numeric: true, cell: (v) => v.reporters },
    { key: "day", header: "Day", numeric: true, cell: (v) => v.day },
  ];
  const dayColumns: Column<PublicDay>[] = [
    { key: "day", header: "Day", numeric: true, cell: (p) => p.day },
    { key: "value", header: "Value", numeric: true, cell: (p) => formatCopper(p.market) },
    { key: "min", header: "Minimum", numeric: true, cell: (p) => formatCopper(p.min) },
    { key: "units", header: "Units", numeric: true, cell: (p) => `${p.quantity}${p.thin ? " (thin)" : ""}` },
    { key: "reporters", header: "Reporters", numeric: true, cell: (p) => p.reporters },
  ];

  return (
    <Container>
      <PageHeader
        trail={trailFor("/tools/auctions")!}
        title="Forever market"
        lede="Auction prices from full scans players ran with the Everloot addon and uploaded."
        actions={<>
          <Link href="/tools/gold-per-hour" className="btn">Gold per hour</Link>
          <Link href="/tools/gold-ledger" className="btn">Gold ledger</Link>
        </>}
      />

      <div className="space-y-8">
        <Card as="section" aria-labelledby="market-form">
          <h2 id="market-form" className="sr-only">Find prices</h2>
          <form method="get" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Realm" name="realm" defaultValue={realm} />
              <Field label="Item id (optional)" name="item" defaultValue={itemText} inputMode="numeric" mono />
            </div>
            <button type="submit" className="btn btn-primary text-sm">Show prices</button>
          </form>
        </Card>

        {!state && (
          <Card><p className="text-fg-2" role="status">Market values are unavailable right now. They are unrecorded, not zero.</p></Card>
        )}

        {state && !realm && (
          <section aria-labelledby="market-realms">
            <SectionHeading id="market-realms">Realms with scans</SectionHeading>
            {realms.length === 0
              ? <EmptyState message="No realm has public prices yet: a realm is listed once 3 reporters scan the same item there." />
              : <ul className="space-y-1 text-sm">{realms.map((name) => (
                  <li key={name}><Link href={`/tools/auctions?realm=${encodeURIComponent(name)}`} className="text-accent hover:underline underline-offset-4">{name}</Link></li>
                ))}</ul>}
          </section>
        )}

        {state && realm && !itemId && (
          <section aria-labelledby="market-realm">
            <SectionHeading
              id="market-realm"
              note={rows.length === 0 ? undefined : rows.length > MAX_ROWS ? `The ${MAX_ROWS} items with the most units listed, of ${rows.length}.` : `${rows.length} items.`}
            >
              {realmName}
            </SectionHeading>
            {/* Seven columns scroll sideways on a phone; the empty state stays outside that frame so it never clips. */}
            {rows.length === 0
              ? <EmptyState message={`No public market values on ${realmName} yet: a day goes public once 3 reporters scan an item.`} />
              : (
                <DataTable
                  caption={`Market values on ${realmName}`}
                  columns={columns}
                  rows={rows.slice(0, MAX_ROWS)}
                  rowKey={(v) => String(v.itemId)}
                />
              )}
          </section>
        )}

        {item && (
          <section aria-labelledby="market-item" className="space-y-4">
            <SectionHeading id="market-item">
              {realmName} item <ItemTip tip={tips.get(itemId)} size={24}><Link href={`/database/items/${itemId}`} className="font-mono tabular-nums text-accent hover:underline underline-offset-4">{itemId}</Link></ItemTip>
            </SectionHeading>
            {!item.value
              ? <EmptyState message="No public market value for this item yet: a day goes public once 3 reporters scan it." />
              : (
                <>
                  <Card>
                    <ul className="space-y-1 text-sm text-fg-2">
                      <li>Market value: <Num>{money(item.value.market)}</Num></li>
                      <li>Minimum buyout: <Num>{formatCopper(item.value.min)}</Num> (<Num>{item.value.day}</Num>, <Num>{item.value.reporters}</Num> reporters)</li>
                      <li>Historical: <Num>{formatCopper(item.value.historical)}</Num></li>
                      <li>Units listed: <Num>{item.value.quantity}</Num>{item.value.thin ? " (thin: left out of the market value)" : ""}</li>
                    </ul>
                  </Card>
                  <HistoryChart points={item.points} />
                  <DataTable
                    caption={`Public days for item ${itemId} on ${realmName}`}
                    columns={dayColumns}
                    rows={[...item.points].reverse()}
                    rowKey={(p) => p.day}
                  />
                </>
              )}
            {browse && (
              <div>
                <SectionHeading as="h3" note="Single listings players saw while browsing (the auction_history tool).">Browse history</SectionHeading>
                <Card><pre className="whitespace-pre-wrap text-sm text-fg">{browse}</pre></Card>
              </div>
            )}
          </section>
        )}

        <Disclosure summary="How are market values made?">
          <p>{MARKET_RULE}</p>
        </Disclosure>
      </div>

      {assets && tips.size > 0 && <div className="mt-8"><GameCredit version={assets.version} label={assets.label} /></div>}
      <SourceLine confirmed>{state ? dataAgeLabel(market.dataAsOf) : "Data age unrecorded"}</SourceLine>
    </Container>
  );
}
