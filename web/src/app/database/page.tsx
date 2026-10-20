import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { computeRollups } from "@/lib/rollup-compute";
import { STORAGE_UNREACHABLE } from "@/lib/upload-store";
import { dataAgeLabel } from "@/lib/data-age";
import JsonLd from "@/components/JsonLd";
import { CC_BY_SA, datasetJsonLd } from "@/lib/jsonld";

const TITLE = "WoW Forever Database";
const description = "Loot-window observations, NPC sightings, quests and vendors for WoW: Forever, from addon uploads. Public facts need corroborated install reports.";
const DATASET_NAME = "Everloot addon observations for WoW: Forever";

export const metadata: Metadata = {
  ...pageMetadata({ title: TITLE, description, path: "/database" }),
};
export const dynamic = "force-dynamic";

const SECTIONS = [
  { title: "Zones", href: "/database/zones", body: "Every zone by continent: its map, the dungeons and raids entered there, and the NPCs, vendors and quests players have confirmed in it." },
  { title: "Items by category", href: "/database/items", body: "Every item in the current build by class, subclass, slot and quality, read from the game files and labelled unconfirmed until players see it." },
  { title: "Loot observations", href: "/database/drops", body: "Observed frequency per source-attributed loot window. Source observations from 3 install IDs are required; these are not verified kills or drop probabilities." },
  { title: "Spawn maps", href: "/database/npcs", body: "NPC positions from corroborated sightings. Single reports stay queued, never published." },
  { title: "Objects", href: "/database/objects", body: "Chests, herbs, ore veins and fishing pools, with what players looted from them. A frequency is public after 3 install reports." },
  { title: "Quests", href: "/database/quests", body: "Givers, turn-ins, and rewards. A row is public after 3 installs agree." },
  { title: "Vendors", href: "/database/vendors", body: "Merchant lists. A price is public after 3 installs agree on the item and the copper." },
  { title: "Guilds", href: "/tools/guild-board", body: "Officer-authorized progression and roster uploads. No aggregate guild score is published." },
  { title: "Lore archive", href: "/lore", body: "Warcraft Wiki pages as of November 2023, CC BY-SA 4.0. Lore and history, not collected Forever data." },
];

export default async function DatabasePage() {
  const { rates, measuredZeros, stats } = await computeRollups();
  const live = rates.filter((r) => r.public).length + measuredZeros.filter((z) => z.public).length;
  const queued = rates.length + measuredZeros.length - live;
  const counts = [
    { label: "Uploads", value: stats.uploads },
    { label: "Loot windows", value: stats.lootWindows },
    { label: "Public frequencies", value: live },
    { label: "Queued facts", value: queued },
  ];
  return (
    <article className="space-y-10 max-w-4xl">
      <JsonLd data={datasetJsonLd({ uploads: stats.unreachable ? 0 : stats.uploads, name: DATASET_NAME, description, path: "/database", corpusPath: "/api/corpus/public", dataAsOf: stats.unreachable ? null : stats.dataAsOf })} />
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">
          Thottbot reborn · corroborated only
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">
          {TITLE}
        </h1>
        <p className="text-lg text-fg-2 max-w-2xl">
          Items, NPCs, quests and vendors for WoW: Forever — built from data players
          collect, with public facts gated by matching install reports. Distinct install IDs
          do not establish independent players.
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {counts.map((c) => (
          <div key={c.label} className="rounded-xl border border-line bg-panel p-5 text-center">
            <div className={`${stats.unreachable ? "text-xl" : "text-3xl"} font-bold text-accent`}>{stats.unreachable ? "unrecorded" : c.value}</div>
            <div className="mt-1 text-xs font-mono text-muted">{c.label}</div>
          </div>
        ))}
      </div>
      {!stats.unreachable && <p className="text-xs text-muted">{dataAgeLabel(stats.dataAsOf)}</p>}

      <div className="grid md:grid-cols-2 gap-4">
        {SECTIONS.map((s) => (
          <Link key={s.title} href={s.href} className="rounded-xl border border-line p-5 bg-panel hover:border-accent">
            <h2 className="text-lg font-semibold text-accent">{s.title}</h2>
            <p className="mt-1 text-sm text-fg-2">{s.body}</p>
          </Link>
        ))}
      </div>

      <section aria-labelledby="licence" className="space-y-2 text-sm text-fg-2 max-w-2xl">
        <h2 id="licence" className="text-lg font-semibold text-fg">{DATASET_NAME}</h2>
        <p>{description}</p>
        <p>
          Uploaded observations are published under <a href={CC_BY_SA.url} rel="noopener" className="text-accent hover:underline underline-offset-4">{CC_BY_SA.name}</a>,
          credited to Everloot contributors. The records are open at{" "}
          <a href="/api/corpus/public" className="text-accent hover:underline underline-offset-4">/api/corpus/public</a>.
        </p>
      </section>

      <div className="rounded-2xl border border-line bg-panel p-6">
        <h2 className="text-xl text-fg">Be the first source</h2>
        <p className="mt-1 text-sm text-fg-2 max-w-xl">
          {stats.unreachable ? (
            STORAGE_UNREACHABLE
          ) : (
            <>
              Uploads are open now, during the beta. Every fact here starts as one player&apos;s
              upload and goes public once 3 installs agree on it. Run the addon, send your save file on the{" "}
              <Link href="/upload" className="text-accent hover:underline underline-offset-4">upload page</Link>,
              and watch your farms become the reference.
            </>
          )}
        </p>
      </div>
    </article>
  );
}
