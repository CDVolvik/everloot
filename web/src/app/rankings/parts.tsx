import Link from "next/link";
import { DataTable, EmptyState, Explainer, type Column } from "@/components/ui";
import { CENSUS_MIN_CHARACTERS, CENSUS_MIN_INSTALLS, CENSUS_MIN_REPORTERS, CENSUS_ROUND_TO, HIDDEN_LABEL } from "../../../../kb/src/census";
import { RAIL_GROUPS, type Change, type ChartSeries, type RankRow, type RankingWeek } from "@/lib/rankings";

export const link = "text-accent hover:underline underline-offset-4";
const number = (n: number) => n.toLocaleString("en-US");
/** A share of the shown total, both rounded already; a whole percent claims no more than the counts do. */
export const percent = (share: number) => `${Math.round(share * 100)}%`;
export const weekLabel = (w: RankingWeek) => (w.current ? `This week so far (from ${w.start})` : `Week of ${w.start}`);

// Whole class names, so Tailwind sees them.
const CLASS_BG: Record<string, string> = {
  WARRIOR: "bg-class-warrior", PALADIN: "bg-class-paladin", HUNTER: "bg-class-hunter",
  ROGUE: "bg-class-rogue", PRIEST: "bg-class-priest", SHAMAN: "bg-class-shaman",
  MAGE: "bg-class-mage", WARLOCK: "bg-class-warlock", DRUID: "bg-class-druid",
};
const CLASS_STROKE: Record<string, string> = {
  WARRIOR: "stroke-class-warrior", PALADIN: "stroke-class-paladin", HUNTER: "stroke-class-hunter",
  ROGUE: "stroke-class-rogue", PRIEST: "stroke-class-priest", SHAMAN: "stroke-class-shaman",
  MAGE: "stroke-class-mage", WARLOCK: "stroke-class-warlock", DRUID: "stroke-class-druid",
};

/**
 * The list of rankings: a rail on wide screens, a bar of links that scrolls sideways on a phone. Plain links,
 * so it works without JavaScript.
 */
export function RankingRail({ current }: { current?: string }) {
  return (
    <nav aria-label="Rankings" data-rankings-rail className="min-w-0">
      <div className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
        <ul className="flex gap-x-1 whitespace-nowrap lg:flex-col lg:gap-y-4 lg:whitespace-normal">
          {RAIL_GROUPS.map((group) => (
            <li key={group.title} className="contents lg:block">
              <h2 className="mb-1 hidden px-2 text-th text-muted lg:block">{group.title}</h2>
              <ul className="contents lg:block">
                {group.links.map((l) => {
                  const on = l.href === current;
                  return (
                    <li key={l.href} className="shrink-0">
                      <Link
                        href={l.href}
                        aria-current={on ? "page" : undefined}
                        className={`flex min-h-8 items-center rounded-control px-2 text-control ${on ? "bg-panel text-fg" : "text-fg-2 hover:text-fg"}`}
                      >
                        {l.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

export function ChangeMark({ change }: { change: Change | null }) {
  if (change === null) return null;
  if (change === "new") return <span className="text-accent">new</span>;
  if (change === "same") return <><span aria-hidden="true" className="text-muted">—</span><span className="sr-only">unchanged</span></>;
  return (
    <span className={change.dir === "up" ? "text-accent" : "text-muted"}>
      <span aria-hidden="true">{change.dir === "up" ? "▲" : "▼"}{change.by}</span>
      <span className="sr-only">{change.dir} {change.by}</span>
    </span>
  );
}

const changeText = (c: Change | null) => (c === null ? null : c === "new" ? "new" : c === "same" ? "unchanged" : `${c.dir === "up" ? "▲" : "▼"}${c.by}`);

/** The ranked rows: rank, change against last week, the class mark, name, faction, count, share and the data's date. */
export function RankTable({ rows, caption, showChange, asOf }: { rows: RankRow[]; caption: string; showChange: boolean; asOf: string }) {
  const showSub = rows.some((r) => r.sub);
  const columns: Column<RankRow>[] = [
    {
      key: "name", header: "Name",
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2">
          <span className="w-6 shrink-0 text-right font-mono tabular-nums text-muted">{r.rank ?? "—"}</span>
          {r.classToken && <span aria-hidden="true" data-class-mark className={`h-2.5 w-2.5 shrink-0 rounded-full ${CLASS_BG[r.classToken]}`} />}
          <span className="font-medium">{r.label}</span>
        </span>
      ),
    },
    ...(showChange ? [{ key: "change", header: "Change", nowrap: true, cell: (r: RankRow) => <ChangeMark change={r.change} /> }] : []),
    ...(showSub ? [{ key: "faction", header: "Faction", nowrap: true, cell: (r: RankRow) => <span className="text-fg-2">{r.sub}</span> }] : []),
    { key: "count", header: "Characters", numeric: true, cell: (r) => (r.count === null ? <span className="text-muted">{HIDDEN_LABEL}</span> : number(r.count)) },
    { key: "share", header: "Share", numeric: true, cell: (r) => (r.share === null ? "" : percent(r.share)) },
    { key: "date", header: "Data to", numeric: true, cell: () => asOf.slice(0, 10) },
  ];
  return (
    <DataTable
      dense
      caption={caption}
      columns={columns}
      rows={rows}
      rowKey={(r) => r.key}
      meta={(r) => [
        showChange ? changeText(r.change) : null,
        r.sub,
        r.count === null ? HIDDEN_LABEL : `${number(r.count)} characters`,
        r.share === null ? null : percent(r.share),
      ].filter(Boolean).join(" · ")}
    />
  );
}

const W = 720;
const H = 240;
const PAD = { left: 40, right: 140, top: 12, bottom: 28 };

/** A race carries its faction (Skyborne is on both sides). */
const nameOf = (s: ChartSeries) => (s.faction && s.label !== s.faction ? `${s.label} (${s.faction})` : s.label);

/** A round top for the share axis: the next 5% above the highest point. */
const topOf = (max: number) => Math.max(0.05, Math.ceil(max * 20) / 20);

/**
 * The weekly chart: each of the top rows' share of the week's characters, over the frozen weeks and the current
 * one ("so far"). Inline SVG, drawn on the server. Lines break where a week's count is hidden. Every line is
 * named in the legend (and at its end when there are four or fewer), so identity never rests on colour; the table below holds the numbers.
 */
export function WeeklyChart({ weeks, series, title }: { weeks: RankingWeek[]; series: ChartSeries[]; title: string }) {
  const max = topOf(Math.max(0, ...series.flatMap((s) => s.points.filter((p): p is number => p !== null))));
  const x = (i: number) => PAD.left + (weeks.length === 1 ? 0 : (i / (weeks.length - 1)) * (W - PAD.left - PAD.right));
  const y = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom);
  const path = (points: (number | null)[]) =>
    points.map((p, i) => (p === null ? "" : `${i > 0 && points[i - 1] !== null ? "L" : "M"}${x(i).toFixed(1)},${y(p).toFixed(1)}`)).join(" ").trim();
  // With four lines or fewer, each is also labelled at its last point, nudged apart so labels never overlap.
  const ends = (series.length > 4 ? [] : series)
    .map((s) => {
      const i = s.points.reduce<number>((last, p, j) => (p !== null ? j : last), -1);
      return i < 0 ? null : { key: s.key, label: nameOf(s), y: y(s.points[i]!) };
    })
    .filter((e): e is { key: string; label: string; y: number } => e !== null)
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 12);
  const stroke = (s: ChartSeries) => (s.classToken && !s.faction ? CLASS_STROKE[s.classToken] : "stroke-fg-2");
  return (
    <figure data-weekly-chart className="min-w-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="h-auto w-full">
        <title>{title}</title>
        {[0, max / 2, max].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="stroke-line" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" className="fill-muted font-mono text-[11px]">{percent(v)}</text>
          </g>
        ))}
        {weeks.map((w, i) => (
          <text key={w.start} x={x(i)} y={H - 8} textAnchor="middle" className="fill-muted font-mono text-[11px]">
            {w.current ? "so far" : w.start.slice(5)}
          </text>
        ))}
        {series.map((s) => (
          <g key={s.key}>
            <title>{nameOf(s)}</title>
            <path d={path(s.points)} fill="none" strokeWidth={2} strokeLinejoin="round" strokeDasharray={s.faction === "Horde" ? "6 3" : undefined} className={stroke(s)} />
            {s.points.map((p, i) => p !== null && (
              <circle key={i} cx={x(i)} cy={y(p)} r={4} className={`${stroke(s)} fill-canvas`} strokeWidth={2}>
                <title>{`${nameOf(s)}, ${weekLabel(weeks[i])}: ${percent(p)}`}</title>
              </circle>
            ))}
          </g>
        ))}
        {ends.map((e) => (
          <text key={e.key} x={W - PAD.right + 8} y={e.y + 4} className="fill-fg-2 text-[11px]">{e.label}</text>
        ))}
      </svg>
      <figcaption className="mt-2">
        <ul aria-label="Legend" className="flex flex-wrap gap-x-4 gap-y-1 text-cell-2 text-fg-2">
          {series.map((s) => (
            <li key={s.key} className="inline-flex items-center gap-1.5">
              <svg aria-hidden="true" width="16" height="4" viewBox="0 0 16 4">
                <line x1="0" x2="16" y1="2" y2="2" strokeWidth={2} strokeDasharray={s.faction === "Horde" ? "4 2" : undefined} className={stroke(s)} />
              </svg>
              {nameOf(s)}
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}

/** How the rankings count, under every rankings page. */
export function HowItCounts() {
  return (
    <Explainer summary="How the rankings count">
      <p>
        A week runs from Monday to Sunday, UTC. Each character counts once a week, and a number shows only when it covers at
        least {CENSUS_MIN_CHARACTERS} characters reported by at least {CENSUS_MIN_INSTALLS} installs from at
        least {CENSUS_MIN_REPORTERS} addresses, rounded to the nearest {CENSUS_ROUND_TO}.
      </p>
      <p>
        Ranks follow those rounded numbers, so equal numbers share a rank. Change compares a rank with the week before.
        Share is a row&apos;s part of all characters counted that week. <Link href="/methodology#population" className={link}>How we count</Link>.
      </p>
      <p>Only race, class, level and faction are counted. No name or character id is stored or shown. The full counts are on the <Link href="/census" className={link}>census</Link>.</p>
    </Explainer>
  );
}

/** Said in place of the chart and the change column until two weeks have numbers. */
export const ONE_WEEK_LINE = "Change against last week and the weekly chart start once two weeks have numbers.";

export function OneWeek() {
  return <EmptyState message={ONE_WEEK_LINE} />;
}
