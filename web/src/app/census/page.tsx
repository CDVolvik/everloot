import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { dataAgeLabel } from "@/lib/data-age";
import { loadCensus } from "@/lib/rollup-compute";
import { REPO_URL } from "@/lib/source";
import { STORAGE_UNREACHABLE } from "@/lib/upload-store";
import {
  CENSUS_CLASSES, CENSUS_RACES, FACTIONS, LEVEL_BANDS, type CensusCount, type CensusView, type CensusWindow,
} from "../../../../kb/src/census";

const description =
  "Who plays what on WoW Forever: factions, races, classes and levels from Everloot uploads. Each character counts once; a count shows from 10 characters.";

export const metadata: Metadata = pageMetadata({ title: "WoW Forever Census: Races, Classes and Levels", description, path: "/census" });
export const dynamic = "force-dynamic";

const link = "text-accent hover:underline underline-offset-4";
const CLASS_NAME = new Map<string, string>(CENSUS_CLASSES.map((c) => [c.token, c.name]));
const RACE_NAME = new Map<string, string>(CENSUS_RACES.map((r) => [r.token, r.name]));
const day = (iso: string) => iso.slice(0, 10);
const number = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many: string) => `${number(n)} ${n === 1 ? one : many}`;
/** A share of the shown total, both rounded already; a whole percent claims no more than the counts do. */
const percent = (count: number, total: number) => `${Math.round((count / total) * 100)}%`;

function Count({ count }: { count: CensusCount }) {
  return count === null ? <span className="text-muted">fewer than 10</span> : <>{number(count)}</>;
}

type Row = { key: string; label: string; count: CensusCount };

/** One slice: a row per group with its count and its share of the window's characters. */
function CountTable({ id, title, rows, total }: { id: string; title: string; rows: Row[]; total: number }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-2xl font-semibold text-fg">{title}</h2>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <caption className="sr-only">{title}: characters and share of all characters in the window</caption>
          <thead>
            <tr className="bg-panel text-xs font-mono text-muted text-left">
              <th scope="col" className="px-4 py-3">{title.replace(/s$/, "")}</th>
              <th scope="col" className="px-4 py-3 text-right">Characters</th>
              <th scope="col" className="px-4 py-3 w-1/2">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-line bg-panel text-fg">
                <th scope="row" className="px-4 py-3 text-left font-medium">{row.label}</th>
                <td className="px-4 py-3 text-right font-mono tabular-nums"><Count count={row.count} /></td>
                <td className="px-4 py-3">
                  {row.count !== null && (
                    <div className="flex items-center gap-3">
                      <span className="font-mono tabular-nums w-10 text-right">{percent(row.count, total)}</span>
                      <div aria-hidden="true" className="h-1 flex-1 rounded-full bg-line">
                        <div className="h-1 rounded-full bg-fg-2" style={{ width: percent(row.count, total) }} />
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Blizzard's race and class table for one faction (as on /wow-forever), with the census count in each playable cell. */
function RaceClassGrid({ faction, window: w }: { faction: string; window: CensusWindow }) {
  const races = CENSUS_RACES.filter((r) => r.faction === faction);
  const count = (race: string, cls: string) => w.raceClass.find((c) => c.faction === faction && c.race === race && c.class === cls);
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-sm">
        <caption className="text-left px-3 py-2 font-semibold text-fg">{faction} races and classes</caption>
        <thead>
          <tr className="border-t border-line text-muted">
            <th scope="col" className="text-left px-3 py-2 font-medium">Race</th>
            {CENSUS_CLASSES.map((c) => <th key={c.token} scope="col" className="px-2 py-2 font-medium">{c.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {races.map((race) => (
            <tr key={race.token} className="border-t border-line">
              <th scope="row" className="text-left px-3 py-2 font-medium text-fg">{race.name}</th>
              {CENSUS_CLASSES.map((c) => {
                const cell = count(race.token, c.token);
                return (
                  <td key={c.token} className="px-2 py-2 text-center font-mono tabular-nums">
                    {!cell ? <span className="sr-only">Not playable</span>
                      : cell.count === null ? <><span aria-hidden="true" className="text-muted">&lt;10</span><span className="sr-only">fewer than 10</span></>
                      : number(cell.count)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TakePart() {
  return (
    <p className="text-sm text-fg-2">
      To add your characters and the players you meet, type <code className="font-mono text-fg">/everloot census on</code> in
      the game, play, log out, then send your save file from the <Link href="/upload" className={link}>upload page</Link>.
      The preview shows the counts before anything is sent.
    </p>
  );
}

const WINDOWS = [
  { id: "week", label: "Last 7 days", href: "/census" },
  { id: "launch", label: "Since launch", href: "/census?window=launch" },
] as const;

function Headline({ view, window: w }: { view: CensusView; window: CensusWindow }) {
  const span = `(${day(w.from)} to ${day(w.to)}, UTC)`;
  const rule = `Each character counts once, and a number shows only when it covers at least ${view.rule.minCharacters} characters reported by at least ${view.rule.minInstalls} installs, rounded to the nearest ${view.rule.roundTo}.`;
  const how = <Link href="/methodology#population" className={link}>How we count</Link>;
  if (w.collecting) {
    return (
      <div className="rounded-xl border border-line bg-panel p-6 sm:p-8 space-y-2">
        <p className="text-fg">
          Still collecting. The census shows numbers once the window {span} has at least {view.rule.minCharacters} characters
          reported by at least {view.rule.minInstalls} installs.
        </p>
        <p className="text-sm text-muted">
          {w.installs === 0 ? "No install has reported census data in this window so far." : `${plural(w.installs, "install has", "installs have")} reported census data in this window so far.`}{" "}
          {rule} {how}.
        </p>
        <TakePart />
      </div>
    );
  }
  return (
    <p className="text-lg text-fg-2">
      About {number(w.characters!)} characters were {w.id === "week" ? "active in the last 7 days" : "seen since launch"} {span},
      counted from {plural(w.installs, "install", "installs")} that turned the census on. {rule} {how}.
    </p>
  );
}

export default async function CensusPage({ searchParams }: { searchParams?: Promise<{ window?: string }> }) {
  const chosen = (await searchParams)?.window === "launch" ? "launch" : "week";
  const { view, unreachable, dataAsOf } = await loadCensus();
  const w = view?.windows[chosen];
  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">
          {unreachable || !w ? "Storage unreachable" : `${plural(w.installs, "reporting install", "reporting installs")} · ${dataAgeLabel(dataAsOf)}`}
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">Who plays what on WoW: Forever</h1>
        <p className="text-fg-2 max-w-2xl">
          Counted from Everloot uploads by players who turned the census on: their own characters and the players they target,
          mouse over or group with. Only race, class, level and faction are kept. Names are never read for anyone else, and no
          character id is stored or published.
        </p>
      </header>

      {unreachable || !view || !w ? (
        <p className="text-fg-2">{STORAGE_UNREACHABLE}</p>
      ) : (
        <>
          <nav aria-label="Census window">
            <ul className="flex flex-wrap gap-2">
              {WINDOWS.map((option) => (
                <li key={option.id}>
                  <Link href={option.href} aria-current={option.id === chosen ? "page" : undefined} className={`btn min-h-11 text-sm ${option.id === chosen ? "btn-primary" : ""}`}>
                    {option.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <Headline view={view} window={w} />

          {!w.collecting && (
            <>
              <BiasLine window={w} />
              <CountTable id="factions" title="Factions" total={w.characters!} rows={FACTIONS.map((f) => ({ key: f, label: f, count: w.factions.find((x) => x.faction === f)!.count }))} />
              <CountTable id="classes" title="Classes" total={w.characters!} rows={w.classes.map((c) => ({ key: c.class, label: CLASS_NAME.get(c.class)!, count: c.count }))} />
              <CountTable id="races" title="Races" total={w.characters!} rows={w.races.map((r) => ({ key: `${r.faction}/${r.race}`, label: `${RACE_NAME.get(r.race)} (${r.faction})`, count: r.count }))} />
              <section aria-labelledby="grid" className="space-y-3">
                <h2 id="grid" className="text-2xl font-semibold text-fg">Race and class</h2>
                <p className="text-fg-2">
                  Blizzard&apos;s race and class tables from <Link href="/wow-forever" className={link}>What is WoW: Forever</Link>, with
                  the characters in each playable combination. &lt;10 means fewer than 10.
                </p>
                {FACTIONS.slice().reverse().map((f) => <RaceClassGrid key={f} faction={f} window={w} />)}
              </section>
              <CountTable id="levels" title="Level bands" total={w.characters!} rows={LEVEL_BANDS.map((b) => ({ key: b.id, label: b.label, count: w.levels.find((l) => l.band === b.id)!.count }))} />
            </>
          )}

          {/* The trend comes from the 7-day window, so it shows once that window has numbers, whichever window is chosen. */}
          {!view.windows.week.collecting && <section aria-labelledby="trend" className="space-y-3">
            <h2 id="trend" className="text-2xl font-semibold text-fg">The last 7 days, day by day</h2>
            <p className="text-fg-2">Characters active each UTC day, under the same rule.</p>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <caption className="sr-only">Characters active each day of the last 7 days</caption>
                <thead>
                  <tr className="bg-panel text-xs font-mono text-muted text-left">
                    <th scope="col" className="px-4 py-3">Day (UTC)</th>
                    <th scope="col" className="px-4 py-3 text-right">Characters</th>
                  </tr>
                </thead>
                <tbody>
                  {view.trend.map((d) => (
                    <tr key={d.day} className="border-t border-line bg-panel text-fg">
                      <th scope="row" className="px-4 py-3 text-left font-mono font-normal tabular-nums">{d.day}</th>
                      <td className="px-4 py-3 text-right font-mono tabular-nums"><Count count={d.count} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>}
          {!w.collecting && <TakePart />}
        </>
      )}

      <footer className="border-t border-line pt-4 text-sm text-muted">
        <p>
          Census rows are never published one by one, only these counts. How Everloot collects and publishes data is in the{" "}
          <a href={`${REPO_URL}/blob/main/docs/DATA_POLICY.md`} rel="noopener" className={link}>data policy</a>.
        </p>
      </footer>
    </article>
  );
}

/** Where the characters came from, so readers can judge the lean of each source (spec §6). */
function BiasLine({ window: w }: { window: CensusWindow }) {
  const { own, seen } = w.bias;
  return (
    <p className="text-sm text-fg-2 max-w-2xl">
      {own !== null && seen !== null
        ? `Known from: ${percent(seen, own + seen)} players seen by uploaders, ${percent(own, own + seen)} uploaders' own characters. `
        : `Known from: ${seen === null ? "fewer than 10" : `about ${number(seen)}`} players seen by uploaders, ${own === null ? "fewer than 10" : `about ${number(own)}`} uploaders' own characters. `}
      Seen players lean toward the zones uploaders play in; own characters lean toward people who install addons.
    </p>
  );
}
