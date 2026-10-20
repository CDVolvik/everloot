import Link from "next/link";
import type { ReactNode } from "react";
import ItemTip from "@/components/game/ItemTip";
import { Card, DataTable, EmptyState, Field, QUALITY_LABEL, QUALITY_TEXT, SectionHeading, Tabs, type Column, type Quality } from "@/components/ui";
import {
  AH_PATH, biggestMoves, itemHref, itemLabel, money, mostListed, percent, realmHref, recentlyUpdated,
  type ItemNames, type MarketRow, type Move,
} from "@/lib/auction-house";
import { HISTORY_DAYS, formatCopper, type PublicDay } from "../../../../../kb/src/market";
import type { ItemTip as Tip } from "./art";
import TimeAgo from "./TimeAgo";

/** The quality token for a tooltip's quality name ("Uncommon"); null without a tooltip. */
export function qualityOf(tip: Tip | undefined): Quality | null {
  if (!tip) return null;
  return (Object.keys(QUALITY_LABEL) as Quality[]).find((q) => QUALITY_LABEL[q] === tip.quality) ?? null;
}

/** An item's label in its quality colour, its icon in front and the game tooltip on hover and focus. */
export function ItemLink({ id, href, tip, names }: { id: number; href: string; tip: Tip | undefined; names: ItemNames }) {
  const q = qualityOf(tip);
  return (
    <ItemTip tip={tip}>
      <Link href={href} className={`underline-offset-4 hover:underline ${q ? QUALITY_TEXT[q] : "text-accent"}`}>{itemLabel(id, names)}</Link>
    </ItemTip>
  );
}

/** The realm picker and item search: one GET form that the hub turns into the clean URL. */
export function FindPrices({ realms, realm = "", query = "" }: { realms: string[]; realm?: string; query?: string }) {
  return (
    <Card as="section" aria-labelledby="ah-find">
      <h2 id="ah-find" className="sr-only">Find prices</h2>
      <form method="get" action={AH_PATH} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <Field label="Realm" name="realm" defaultValue={realm} list="ah-realms" autoComplete="off" placeholder={realms[0] ?? "Your realm"} />
        <Field label="Item id" name="q" defaultValue={query} inputMode="numeric" mono placeholder="2589" />
        <button type="submit" className="btn btn-primary">Find prices</button>
        <datalist id="ah-realms">{realms.map((name) => <option key={name} value={name} />)}</datalist>
      </form>
    </Card>
  );
}

/** Contributing is the one way a realm gets prices: run a scan, upload it. */
export function Contribute() {
  return (
    <Card as="section" aria-labelledby="ah-contribute">
      <SectionHeading id="ah-contribute" note="Open the auction house in game and press Everloot scan. The Desktop App uploads the scan when you log out and puts these prices in your item tooltips.">
        Add your realm&apos;s prices
      </SectionHeading>
      <div className="flex flex-wrap gap-2">
        <Link href="/addon" className="btn">Get the addon</Link>
        <Link href="/addon#desktop" className="btn">Get the Desktop App</Link>
      </div>
    </Card>
  );
}

/** Facts beside each other under a page title: "Prices updated 4 min ago · 3 realms". */
export function Facts({ items }: { items: ReactNode[] }) {
  return (
    <>
      {items.flatMap((item, i) => (i === 0 ? [<span key={i}>{item}</span>] : [<span key={`s${i}`} aria-hidden="true">·</span>, <span key={i}>{item}</span>]))}
    </>
  );
}

export const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** Market value, minimum buyout, historical and units in one card. */
export function PriceFacts({ facts }: { facts: { label: string; value: string; note?: string }[] }) {
  return (
    <Card>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
        {facts.map((f) => (
          <div key={f.label} className="min-w-0">
            <dt className="text-sm text-muted">{f.label}</dt>
            <dd className={`mt-1 font-mono text-lg tabular-nums [overflow-wrap:anywhere] ${f.value === "unrecorded" ? "text-muted" : "text-fg"}`}>{f.value}</dd>
            {f.note && <dd className="mt-1 text-xs text-muted">{f.note}</dd>}
          </div>
        ))}
      </dl>
    </Card>
  );
}

/** Market value per public day across the 60-day window; one thin line, drawn only with two or more days. */
export function PriceChart({ points }: { points: PublicDay[] }) {
  if (points.length < 2) {
    return <p className="text-sm text-muted">The line starts once a second public day is in.</p>;
  }
  const width = 1000, height = 140, pad = 8;
  const days = points.map((p) => Date.parse(`${p.day}T00:00:00Z`) / 86_400_000);
  const last = days[days.length - 1]!;
  const first = last - (HISTORY_DAYS - 1);
  const values = points.map((p) => p.market);
  const low = Math.min(...values), high = Math.max(...values);
  const x = (d: number) => pad + ((d - first) / (HISTORY_DAYS - 1)) * (width - 2 * pad);
  const y = (v: number) => (high === low ? height / 2 : pad + (1 - (v - low) / (high - low)) * (height - 2 * pad));
  const line = points.map((p, i) => `${x(days[i]!).toFixed(1)},${y(p.market).toFixed(1)}`).join(" ");
  return (
    <figure className="space-y-2">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-labelledby="ah-chart-title" className="h-36 w-full rounded-card border border-line bg-canvas text-accent">
        <title id="ah-chart-title">{`Market value per public day, last ${HISTORY_DAYS} days: ${formatCopper(low)} to ${formatCopper(high)}`}</title>
        {/* The box stretches to the column, so the line carries no dots that would stretch with it. */}
        <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="flex flex-wrap justify-between gap-x-4 text-xs text-muted">
        <span>{points[0]!.day} to {points.at(-1)!.day}</span>
        <span className="font-mono tabular-nums">{formatCopper(low)} to {formatCopper(high)}</span>
      </figcaption>
    </figure>
  );
}

/** One item's price on each realm, each row linking to that realm's page for it. */
export function RealmPrices({ rows, caption, empty }: { rows: MarketRow[]; caption: string; empty: string }) {
  const columns: Column<MarketRow>[] = [
    {
      key: "realm", header: "Realm", nowrap: true,
      cell: (r) => <Link href={itemHref(r.realm, r.value.itemId)} className="text-accent underline-offset-4 hover:underline">{r.realm.name}</Link>,
    },
    { key: "market", header: "Market value", numeric: true, cell: (r) => <span className={r.value.market === null ? "text-muted" : undefined}>{money(r.value.market)}</span> },
    { key: "min", header: "Min buyout", numeric: true, cell: (r) => formatCopper(r.value.min) },
    { key: "historical", header: "Historical", numeric: true, cell: (r) => formatCopper(r.value.historical) },
    { key: "units", header: "Units", numeric: true, cell: (r) => r.value.quantity.toLocaleString("en-US") },
    { key: "reporters", header: "Reporters", numeric: true, cell: (r) => r.value.reporters },
    { key: "day", header: "Day", numeric: true, cell: (r) => r.value.day },
  ];
  return <DataTable caption={caption} columns={columns} rows={rows} rowKey={(r) => r.realm.key} empty={<EmptyState framed={false} message={empty} />} />;
}

/** The public days behind one price, newest first. */
export function DayTable({ points, caption }: { points: PublicDay[]; caption: string }) {
  const columns: Column<PublicDay>[] = [
    { key: "day", header: "Day", numeric: true, cell: (p) => p.day },
    { key: "value", header: "Value", numeric: true, cell: (p) => formatCopper(p.market) },
    { key: "min", header: "Min buyout", numeric: true, cell: (p) => formatCopper(p.min) },
    { key: "units", header: "Units", numeric: true, cell: (p) => `${p.quantity.toLocaleString("en-US")}${p.thin ? " (thin)" : ""}` },
    { key: "reporters", header: "Reporters", numeric: true, cell: (p) => p.reporters },
  ];
  return <DataTable caption={caption} columns={columns} rows={[...points].reverse()} rowKey={(p) => p.day} />;
}

const BOARD_ROWS = 25;

/** The items the boards show, so a page reads art for those and no others. */
export function boardItemIds(rows: MarketRow[], now: Date, listedLimit = BOARD_ROWS): number[] {
  return [
    ...mostListed(rows, listedLimit).map((r) => r.value.itemId),
    ...biggestMoves(rows, 1, now, BOARD_ROWS).map((m) => m.row.value.itemId),
    ...biggestMoves(rows, 7, now, BOARD_ROWS).map((m) => m.row.value.itemId),
    ...recentlyUpdated(rows, BOARD_ROWS).map((r) => r.value.itemId),
  ];
}

/**
 * The live boards: most listed, the biggest moves over a day and a week, and the newest scans. One tab
 * list per page; `showRealm` adds the realm column on the all-realm hub.
 */
export function Boards({ rows, tips, names, now, showRealm, listedLimit = BOARD_ROWS }: {
  rows: MarketRow[];
  tips: Map<number, Tip>;
  names: ItemNames;
  now: Date;
  showRealm: boolean;
  listedLimit?: number;
}) {
  const listed = mostListed(rows, listedLimit);
  const day = biggestMoves(rows, 1, now, BOARD_ROWS);
  const week = biggestMoves(rows, 7, now, BOARD_ROWS);
  const recent = recentlyUpdated(rows, BOARD_ROWS);

  const item: Column<MarketRow> = {
    key: "item", header: "Item", nowrap: true,
    cell: (r) => <ItemLink id={r.value.itemId} href={itemHref(r.realm, r.value.itemId)} tip={tips.get(r.value.itemId)} names={names} />,
  };
  const realm: Column<MarketRow>[] = showRealm
    ? [{ key: "realm", header: "Realm", nowrap: true, cell: (r) => <Link href={realmHref(r.realm)} className="text-fg-2 underline-offset-4 hover:text-fg hover:underline">{r.realm.name}</Link> }]
    : [];
  const market: Column<MarketRow> = { key: "market", header: "Market value", numeric: true, cell: (r) => <span className={r.value.market === null ? "text-muted" : undefined}>{money(r.value.market)}</span> };
  const min: Column<MarketRow> = { key: "min", header: "Min buyout", numeric: true, cell: (r) => formatCopper(r.value.min) };
  const units: Column<MarketRow> = { key: "units", header: "Units", numeric: true, cell: (r) => r.value.quantity.toLocaleString("en-US") };

  const moveColumns: Column<Move>[] = [
    { ...item, cell: (m) => item.cell(m.row) },
    ...realm.map((c) => ({ ...c, cell: (m: Move) => c.cell(m.row) })),
    { key: "change", header: "Change", numeric: true, cell: (m) => <span className={m.change > 0 ? "text-accent" : "text-fg"}>{percent(m.change)}</span> },
    { key: "from", header: "Was", numeric: true, cell: (m) => formatCopper(m.from.market) },
    { key: "to", header: "Now", numeric: true, cell: (m) => formatCopper(m.to.market) },
    { ...units, cell: (m) => m.to.quantity.toLocaleString("en-US") },
  ];
  const quiet = (message: string) => <EmptyState framed={false} message={message} />;
  const table = <T,>(caption: string, columns: Column<T>[], data: T[], key: (row: T) => string, empty: string, footer?: ReactNode) => (
    <div className="pt-4">
      <DataTable caption={caption} columns={columns} rows={data} rowKey={key} empty={quiet(empty)} footer={footer} />
    </div>
  );
  const rowKey = (r: MarketRow) => `${r.realm.key}:${r.value.itemId}`;
  const moveKey = (m: Move) => rowKey(m.row);

  return (
    <Tabs
      label="Market boards"
      tabs={[
        {
          id: "most-listed", label: "Most listed", count: listed.length,
          panel: table("Items with the most units listed", [item, ...realm, market, min, { key: "historical", header: "Historical", numeric: true, cell: (r) => formatCopper(r.value.historical) }, units], listed, rowKey,
            "No item has a public price here yet.",
            rows.length > listed.length ? <span>{listed.length.toLocaleString("en-US")} of {rows.length.toLocaleString("en-US")}, most units first</span> : undefined),
        },
        {
          id: "moves-24h", label: "Moves 24h", count: day.length,
          panel: table("Biggest market value moves since the day before", moveColumns, day, moveKey, "No price has two days in a row to compare yet."),
        },
        {
          id: "moves-7d", label: "Moves 7d", count: week.length,
          panel: table("Biggest market value moves over a week", moveColumns, week, moveKey, "No price has a week of scans to compare yet."),
        },
        {
          id: "recent", label: "Recently updated", count: recent.length,
          panel: table("Items scanned most recently", [item, ...realm, market, min, units, {
            key: "updated", header: "Scanned", numeric: true, cell: (r) => <TimeAgo at={r.updatedAt!} renderedAt={now.getTime()} />,
          }], recent, rowKey, "No scan from this week is public yet."),
        },
      ]}
    />
  );
}
