import Link from "next/link";
import AdSlot from "@/components/AdSlot";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import LaunchCountdown from "@/components/LaunchCountdown";
import LoreSearchForm from "@/components/LoreSearchForm";
import { tools, toolHref } from "@/data/tools";
import { LORE_SEARCH_LABEL, organizationJsonLd, websiteJsonLd } from "@/lib/jsonld";
import { FEED } from "@/lib/seo";
import { classAndProfessionIcons, launchArt, loadSiteAssets } from "@/lib/game-assets";
import GameIcon from "@/components/game/GameIcon";
import GameCredit from "@/components/game/GameCredit";
import LaunchBanner from "@/components/game/LaunchBanner";

export const metadata: Metadata = {
  alternates: { canonical: "/", types: FEED },
};

export default async function Home() {
  // Class and profession icons, only when the asset URL is set and the upload has them.
  const assets = await loadSiteAssets();
  const icons = classAndProfessionIcons(assets);
  // The launch banner, only with the game's own logo from the asset files.
  const launch = launchArt(assets);
  return (
    <div className="space-y-16">
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={websiteJsonLd()} />
      {launch && (
        <LaunchBanner art={launch}>
          <LaunchCountdown />
        </LaunchBanner>
      )}
      {/* Hero */}
      <section className="relative pt-6 pb-2 text-center overflow-hidden">
        <div className="relative">
        <p className="font-mono text-xs text-muted mb-4">
          Free tools · Addon uploads · Collecting data
        </p>
        <h1 className="text-4xl sm:text-6xl font-bold text-fg leading-tight tracking-tight">
          Every drop. Every guild. <span className="text-accent">Every reset.</span>
        </h1>
        <p className="mt-6 max-w-2xl mx-auto text-lg text-fg-2">
          Browse WoW: Forever observations, upload your addon records, or check
          auction prices. Database facts appear when enough install reports
          agree. Loot-window observations do not establish kill-based drop probabilities.
        </p>
        {/* With the launch banner, the countdown is on the banner instead. */}
        {!launch && (
          <div className="mt-6">
            <LaunchCountdown />
          </div>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/database"
            className="btn btn-primary"
          >
            Browse the database
          </Link>
          <Link
            href="/upload"
            className="btn"
          >
            Upload addon data
          </Link>
        </div>
        </div>
      </section>

      {/* Tools grid */}
      <section id="tools" className="scroll-mt-20">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
          <h2 className="text-2xl sm:text-3xl font-semibold text-fg">
            The toolkit
          </h2>
          <p className="text-sm text-muted">
            Available, collecting data, and planned.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tools.map((tool) => {
            const isLive = tool.status === "live";
            return (
              <Link
                key={tool.slug}
                href={toolHref(tool)}
                className="tool-card group relative rounded-xl border border-line bg-panel p-5 hover:border-accent"
              >
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={`text-[10px] font-mono px-2 py-1 rounded-full border ${
                      isLive
                        ? "bg-canvas text-q-uncommon border-q-uncommon/40"
                        : "bg-canvas text-muted border-line"
                    }`}
                  >
                    {isLive ? "Available" : tool.status === "collecting" ? "Collecting data" : "Planned"}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-fg group-hover:text-accent transition">
                  {tool.title}
                </h3>
                <p className="mt-1 text-sm text-fg-2">
                  {tool.tagline}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Classes and professions, in the game's own icons: shown only when the asset files are there */}
      {assets && (icons.classes.length > 0 || icons.professions.length > 0) && (
        <section aria-labelledby="classes-professions" className="space-y-4">
          <h2 id="classes-professions" className="text-xl font-semibold text-fg">Classes and professions</h2>
          {icons.classes.length > 0 && (
            <ul aria-label="Talent calculator by class" className="flex flex-wrap gap-2">
              {icons.classes.map((c) => (
                <li key={c.key}>
                  <Link href={`/tools/talents/${c.key}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-panel px-3 text-sm font-medium text-fg hover:border-accent">
                    <GameIcon src={c.icon} size={28} />
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {icons.professions.length > 0 && (
            <ul aria-label="Profession hubs" className="flex flex-wrap gap-2">
              {icons.professions.map((p) => (
                <li key={p.key}>
                  <Link href={`/tools/professions?profession=${encodeURIComponent(p.key)}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-panel px-3 text-sm text-fg-2 hover:border-accent hover:text-fg">
                    <GameIcon src={p.icon} size={28} />
                    {p.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <GameCredit version={assets.version} label={assets.label} what="Icons" />
        </section>
      )}

      <AdSlot slot="inContent" />

      {/* Lore search: the WebSite SearchAction points here */}
      <section aria-labelledby="lore-search" className="space-y-3">
        <h2 id="lore-search" className="text-xl font-semibold text-fg">{LORE_SEARCH_LABEL}</h2>
        <p className="text-sm text-fg-2 max-w-2xl">
          Warcraft Wiki pages as of 2023, for lore and history. It is not collected WoW: Forever data.
        </p>
        <LoreSearchForm />
      </section>

      {/* Why this site */}
      <section className="grid md:grid-cols-3 gap-6 text-sm">
        <div className="rounded-lg border border-line p-5">
          <h3 className="font-semibold text-fg">Fast and focused</h3>
          <p className="mt-1 text-fg-2">
            Each tool does one thing well. No 47 tabs to click through before
            you get an answer.
          </p>
        </div>
        <div className="rounded-lg border border-line p-5">
          <h3 className="font-semibold text-fg">No account needed</h3>
          <p className="mt-1 text-fg-2">
            The calculator runs on your device. Addon files go to the server only
            when you upload them, with explicit choices for named sharing.
          </p>
        </div>
        <div className="rounded-lg border border-line p-5">
          <h3 className="font-semibold text-fg">Built by a player</h3>
          <p className="mt-1 text-fg-2">
            Every tool here started as &ldquo;I wish something did X&rdquo;
            after a raid night. If one doesn&apos;t, tell us.
          </p>
        </div>
      </section>
    </div>
  );
}
