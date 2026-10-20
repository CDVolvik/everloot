import Link from "next/link";
import AdSlot from "@/components/AdSlot";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import LaunchCountdown from "@/components/LaunchCountdown";
import LoreSearchForm from "@/components/LoreSearchForm";
import { AgreementMeter, Card, CodeBlock, SectionHeading, SourceLine, type Agreement } from "@/components/ui";
import { TOOL_GROUPS, tools, toolHref } from "@/data/tools";
import { CLASSES } from "@/design/tokens";
import { latestAddonRelease } from "@/lib/addon-release";
import { CLIENT_LAYER, CLIENT_TAXONOMY, itemsHref } from "@/lib/items";
import { LORE_SEARCH_LABEL, organizationJsonLd, websiteJsonLd } from "@/lib/jsonld";
import { FEED } from "@/lib/seo";
import { classAndProfessionIcons, creditWhat, launchArt, loadSiteAssets } from "@/lib/game-assets";
import GameIcon from "@/components/game/GameIcon";
import GameCredit from "@/components/game/GameCredit";
import { CONNECT_EXAMPLES, MCP_TOOLS } from "./connect/connect-data";

export const metadata: Metadata = {
  alternates: { canonical: "/", types: FEED },
};

const link = "text-accent hover:underline underline-offset-4";

/** What each tool in the grouped list is for, in a few words. The groups themselves are the header's Tools menu. */
const TOOL_NOTES: Record<string, string> = {
  "/tools/raid": "Which buffs a raid covers",
  "/tools/gold-per-hour": "Price a farm",
  "/tools/professions": "Leveling paths from uploads",
  "/tools/farming-routes": "Routes from uploaded sightings",
  "/tools/auctions": "Prices by realm, from scans",
  "/census": "Who plays what",
  "/addons": "What players run",
  "/tools/guild-board": "Roster and progression",
  "/tools/collections": "Owned and missing",
  "/tools/gold-ledger": "Where your gold went",
  "/upload": "Send what the addon recorded",
};

/** The steps a fact takes, drawn with the meter every page uses. */
const AGREEMENT_STEPS: { count: Agreement; title: string; text: string }[] = [
  { count: 0, title: "In the game files", text: "Shown with a dashed edge, unconfirmed." },
  { count: 1, title: "One install saw it", text: "Held back." },
  { count: 2, title: "Two agree", text: "Still held back." },
  { count: 3, title: "Three agree: public", text: "Open to everyone, CC BY-SA 4.0." },
];

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default async function Home() {
  // The game's art (loading screen, logo, class icons), only when the asset URL is set and the upload has it.
  const assets = await loadSiteAssets();
  const icons = classAndProfessionIcons(assets);
  const launch = launchArt(assets);
  const classIcons = new Map(icons.classes.map((c) => [c.key, c.icon]));
  const addon = latestAddonRelease();
  const build = CLIENT_LAYER.build.version;
  const categories = CLIENT_TAXONOMY.classes.filter((c) => c.items > 0).sort((a, b) => b.items - a.items).slice(0, 6);
  const status = new Map(tools.map((t) => [toolHref(t), t.status]));
  const groups = TOOL_GROUPS.map((g) => ({ ...g, links: g.links.filter((l) => l.href !== "/tools/talents") }));
  const art = creditWhat(launch && "logo", launch?.background && "loading screen art", classIcons.size > 0 && "class icons");

  return (
    <div className="space-y-18">
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={websiteJsonLd()} />

      {/* The hero: the page-title pattern at full size, over the game's own loading screen and logo. */}
      <section aria-labelledby="hero-title" data-launch-banner={launch ? "" : undefined} className="relative overflow-hidden rounded-card border border-line bg-canvas">
        {launch?.background && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={launch.background.url}
            srcSet={launch.background.small ? `${launch.background.small.url} ${launch.background.small.width}w, ${launch.background.url} ${launch.background.width}w` : undefined}
            sizes="(min-width: 1152px) 1152px, 100vw"
            alt=""
            aria-hidden="true"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover grayscale brightness-[.35]"
          />
        )}
        <div className="relative grid gap-8 p-6 sm:p-12 md:grid-cols-[minmax(0,1fr)_14rem] md:items-center">
          <div className="min-w-0">
            <LaunchCountdown />
            <h1 id="hero-title" className="mt-4 text-5xl font-bold leading-none tracking-tight text-fg sm:text-7xl">
              Every drop.<br />Every guild.<br /><span className="text-accent">Every reset.</span>
            </h1>
            <p className="mt-6 max-w-[40ch] text-lg text-fg-2">
              The open WoW: Forever database, written by the addons of the people who play it.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/database" className="btn btn-primary">Browse the database</Link>
              <Link href="/tools/talents" className="btn">Plan a talent build</Link>
            </div>
          </div>
          {launch && (
            // The game's name and the disclaimer stay real text beside its logo; the logo is decorative.
            <div className="md:text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={launch.logo.url}
                alt=""
                aria-hidden="true"
                width={launch.logo.width}
                height={launch.logo.height}
                decoding="async"
                className="mx-auto mb-4 hidden h-48 w-48 object-contain md:block"
              />
              <p className="font-semibold text-fg">World of Warcraft: Forever</p>
              <p className="mt-1 text-sm text-fg-2">Not affiliated with or endorsed by Blizzard Entertainment.</p>
            </div>
          )}
        </div>
      </section>

      {/* The database: real counts from the game files carry the section while uploads are few. */}
      <section aria-labelledby="database">
        <SectionHeading id="database" action={<Link href="/database" className={link}>Open the database →</Link>}>The database</SectionHeading>
        <Card unconfirmed className="grid gap-8 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
          <div>
            <p className="text-5xl font-bold tabular-nums tracking-tight text-fg">{CLIENT_TAXONOMY.items.length.toLocaleString("en-US")}</p>
            <p className="mt-2 max-w-[28ch] text-sm text-fg-2">items in the files of build <span className="font-mono">{build}</span>. Players turn them into facts.</p>
          </div>
          <div className="min-w-0">
            <ul aria-label="Items by category" className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((c) => (
                <li key={c.id} className="border-b border-line">
                  <Link href={itemsHref(c.slug)} className="flex min-h-11 items-center justify-between gap-4 text-fg hover:text-accent">
                    <span>{c.label}</span>
                    <span className="font-mono text-sm tabular-nums text-muted">{c.items.toLocaleString("en-US")}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm">
              <Link href="/database/items" className={link}>Every category</Link>
              <span className="text-muted"> · </span>
              <Link href="/database" className={link}>NPCs, quests, vendors and objects</Link>
            </p>
          </div>
        </Card>
      </section>

      {/* Tools: one feature and the same grouped list as the header's Tools menu. */}
      <section id="tools" aria-labelledby="tools-title" className="scroll-mt-20">
        <SectionHeading id="tools-title">Tools</SectionHeading>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <Card className="space-y-6">
            <div>
              <SectionHeading as="h3" note="All nine classes, two talent sets, and a share link that names the game build.">
                <Link href="/tools/talents" className="hover:text-accent">Talent calculator</Link>
              </SectionHeading>
              <ul aria-label="Talent calculator by class" className="flex flex-wrap gap-2">
                {CLASSES.map((slug) => (
                  <li key={slug}>
                    <Link href={`/tools/talents/${slug}`} className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line px-2 text-sm text-fg-2 hover:border-accent hover:text-fg">
                      {classIcons.get(slug) && <GameIcon src={classIcons.get(slug)!} size={24} />}
                      {titleCase(slug)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <Link href="/tools/talents" className="btn">Plan a build</Link>
          </Card>
          <Card padding="none" className="divide-y divide-line">
            {groups.map((group) => (
              <div key={group.title} className="px-6 py-4">
                <p className="font-mono text-xs text-muted">{group.title}</p>
                <ul className="mt-1">
                  {group.links.map((l) => {
                    const state = status.get(l.href);
                    return (
                      <li key={l.href}>
                        <Link href={l.href} className="group flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 py-1">
                          <span className="text-fg group-hover:text-accent">{l.label}</span>
                          <span className="text-sm text-muted">{TOOL_NOTES[l.href]}</span>
                          {state === "collecting" && <span className="ml-auto"><AgreementMeter count={0} /></span>}
                          {state === "coming-soon" && <span className="ml-auto text-sm text-muted">Planned</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </Card>
        </div>
      </section>

      <AdSlot slot="inContent" />

      {/* The site's one rule, with the meter every page uses for it. */}
      <section aria-labelledby="agree">
        <SectionHeading
          id="agree"
          note="The addon records what you see. Nothing goes public on one person's word."
          action={<Link href="/methodology" className={link}>How we count →</Link>}
        >
          Three players agree. Then it&apos;s a fact.
        </SectionHeading>
        <ol className="grid gap-x-6 gap-y-4 border-t border-line pt-6 sm:grid-cols-2 lg:grid-cols-4">
          {AGREEMENT_STEPS.map((step) => (
            <li key={step.count} className="flex items-start gap-4">
              <AgreementMeter count={step.count} />
              <div>
                <p className={step.count === 3 ? "font-semibold text-accent" : "font-semibold text-fg"}>{step.title}</p>
                <p className="text-sm text-muted">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Open data: the MCP server and the API. */}
      <section aria-labelledby="ask" className="grid items-start gap-8 lg:grid-cols-2">
        <div>
          <SectionHeading id="ask" note="A public MCP server. No key, no sign-in. Every answer carries its source and licence.">
            Ask your AI about WoW: Forever
          </SectionHeading>
          <p className="text-sm">
            <Link href="/connect" className={link}>Connect an assistant</Link>
            <span className="text-muted"> · </span>
            <Link href="/connect#corpus" className={link}>Open data and API</Link>
          </p>
        </div>
        <div className="min-w-0 space-y-2">
          <CodeBlock title="Claude Code" label="Add Everloot to Claude Code">{CONNECT_EXAMPLES.claudeCode}</CodeBlock>
          <p className="text-sm text-muted">{MCP_TOOLS.length} read-only tools. Works with Claude, ChatGPT, Grok and any client that takes a URL.</p>
        </div>
      </section>

      {/* The addon and the desktop app. */}
      <Card as="section" aria-labelledby="get-addon" className="sm:p-12">
        <SectionHeading id="get-addon" note="It records drops, vendors and prices as you play. The desktop app uploads them and brings prices back into the game.">
          Get the addon
        </SectionHeading>
        <div className="flex flex-wrap items-center gap-3">
          {addon
            ? <a href={addon.downloadPath} download className="btn btn-primary">Download addon {addon.version}</a>
            : <Link href="/addon" className="btn btn-primary">Get the addon</Link>}
          <Link href="/addon" className="btn">Desktop app</Link>
        </div>
        <p className="mt-4 text-sm text-muted">Free and open source. You choose what is shared.</p>
      </Card>

      {/* Lore search: the WebSite SearchAction points here. */}
      <section aria-labelledby="lore-search">
        <SectionHeading id="lore-search" note="Warcraft Wiki pages as of 2023, for lore and history. It is not collected WoW: Forever data.">
          {LORE_SEARCH_LABEL}
        </SectionHeading>
        <LoreSearchForm />
      </section>

      <SourceLine build={build}>
        {assets && art && <GameCredit inline version={assets.version} label={assets.label} what={art} />}
      </SourceLine>
    </div>
  );
}
