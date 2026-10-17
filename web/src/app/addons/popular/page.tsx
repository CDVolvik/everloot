import type { Metadata } from "next";
import Link from "next/link";
import { dataAgeLabel } from "@/lib/data-age";
import { loadPopularAddons } from "@/lib/rollup-compute";
import { REPO_URL } from "@/lib/source";
import { STORAGE_UNREACHABLE } from "@/lib/upload-store";

export const metadata: Metadata = {
  title: "Popular addons for WoW: Forever",
  description:
    "Which addons WoW: Forever players run, counted from Everloot uploads by players who turned the addon list on. An addon is listed once three installs report it.",
  alternates: { canonical: "/addons/popular" },
};
export const dynamic = "force-dynamic";

const link = "text-accent hover:underline underline-offset-4";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const percent = (share: number) => `${Number((share * 100).toFixed(1))}%`;
/** The UTC day, whatever offset the time was written with. */
const day = (iso: string) => new Date(iso).toISOString().slice(0, 10);

/** A search for the title on CurseForge. A link only: Everloot neither calls nor copies CurseForge. */
const curseforgeSearch = (title: string) => `https://www.curseforge.com/wow/search?search=${encodeURIComponent(title)}`;

function OptIn() {
  return (
    <p className="text-sm text-fg-2">
      To add yours, type <code className="font-mono text-fg">/everloot addons on</code> in the game, play, log out, then
      send your save file from the <Link href="/upload" className={link}>upload page</Link>. The preview names every
      addon before anything is sent.
    </p>
  );
}

export default async function PopularAddonsPage() {
  const { addons, reportingInstalls, unreachable, dataAsOf } = await loadPopularAddons();
  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">
          {unreachable
            ? "Storage unreachable"
            : `${plural(reportingInstalls, "reporting install", "reporting installs")} · ${plural(addons.length, "addon listed", "addons listed")} · ${dataAgeLabel(dataAsOf)}`}
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">Addons Forever players run</h1>
        <p className="text-fg-2 max-w-2xl">
          Counted from Everloot uploads by players who turned the addon list on. An addon is listed once three installs
          report it, so a rare setup cannot be picked out. Everloot itself is left out. An install is one copy of the
          Everloot addon, not proof of one person.
        </p>
        <p className="text-sm text-fg-2 max-w-2xl">
          Share is the installs that had the addon loaded, out of every install that reported its addons. The CurseForge
          link opens a search there; Everloot does not use CurseForge&apos;s data.
        </p>
      </header>

      {unreachable ? (
        <p className="text-fg-2">{STORAGE_UNREACHABLE}</p>
      ) : addons.length === 0 ? (
        <div className="rounded-xl border border-line bg-panel p-6 sm:p-8 space-y-2">
          <p className="text-fg">No addon is listed yet. An addon appears here once three installs report it.</p>
          <p className="text-sm text-muted">
            {reportingInstalls === 0
              ? "No install has reported its addons so far."
              : `${plural(reportingInstalls, "install has", "installs have")} reported their addons so far.`}
          </p>
          <OptIn />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <caption className="sr-only">Addons by the share of reporting installs that run them</caption>
              <thead>
                <tr className="bg-panel text-xs font-mono text-muted text-left">
                  <th scope="col" className="pl-4 pr-2 sm:px-4 py-3 text-right">#</th>
                  <th scope="col" className="px-2 sm:px-4 py-3">Addon</th>
                  <th scope="col" className="pl-2 pr-4 sm:px-4 py-3">Share</th>
                  <th scope="col" className="hidden md:table-cell px-4 py-3 text-right">Installs</th>
                  <th scope="col" className="hidden md:table-cell px-4 py-3">First seen</th>
                  <th scope="col" className="hidden md:table-cell px-4 py-3">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {addons.map((addon, i) => (
                  <tr key={addon.name} className="border-t border-line bg-panel text-fg align-top">
                    <td className="pl-4 pr-2 sm:px-4 py-3 text-right font-mono text-lg leading-6 tabular-nums text-fg-2">{i + 1}</td>
                    <th scope="row" className="px-2 sm:px-4 py-3 text-left font-normal">
                      <Link href={`/addons/${encodeURIComponent(addon.name)}`} className={`block font-medium leading-6 ${link}`}>{addon.title}</Link>
                      {/* On phones the count and dates columns are hidden, so they sit under the title. */}
                      <span className="md:hidden block font-mono text-xs text-muted tabular-nums">
                        <span className="block">{plural(addon.installs, "install", "installs")}</span>
                        <span className="block whitespace-nowrap">{day(addon.firstSeen)} to {day(addon.lastSeen)}</span>
                      </span>
                      <a href={curseforgeSearch(addon.title)} rel="noopener" className={`inline-flex items-center min-h-11 text-xs ${link}`}>
                        Search CurseForge<span className="sr-only"> for {addon.title}</span>
                      </a>
                    </th>
                    <td className="pl-2 pr-4 sm:px-4 py-3 w-[32%] md:w-56">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono tabular-nums">
                        <span>{percent(addon.share)}</span>
                        <span className="text-xs text-muted whitespace-nowrap">{addon.loadedInstalls} of {reportingInstalls}</span>
                      </div>
                      <div aria-hidden="true" className="mt-1.5 h-1 rounded-full bg-line">
                        <div className="h-1 rounded-full bg-fg-2" style={{ width: percent(addon.share) }} />
                      </div>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 leading-6 text-right font-mono tabular-nums">{addon.installs}</td>
                    <td className="hidden md:table-cell px-4 py-3 leading-6 font-mono tabular-nums whitespace-nowrap">{day(addon.firstSeen)}</td>
                    <td className="hidden md:table-cell px-4 py-3 leading-6 font-mono tabular-nums whitespace-nowrap">{day(addon.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <OptIn />
        </>
      )}

      <footer className="border-t border-line pt-4 text-sm text-muted">
        <p>
          Addon lists are never published row by row, only these counts. How Everloot collects and publishes data is in
          the <a href={`${REPO_URL}/blob/main/docs/DATA_POLICY.md`} rel="noopener" className={link}>data policy</a>.
        </p>
      </footer>
    </article>
  );
}
