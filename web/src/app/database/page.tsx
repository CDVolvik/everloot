import type { Metadata } from "next";
import type { ReactNode } from "react";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { GAME_DATA_CREDIT } from "@everloot/protocol";
import { objectList } from "../../../../kb/src/object-page";
import { computeRollups, loadWorldFacts } from "@/lib/rollup-compute";
import { STORAGE_UNREACHABLE } from "@/lib/upload-store";
import { dataAgeLabel } from "@/lib/data-age";
import { trailFor } from "@/lib/breadcrumbs";
import { CLIENT_LAYER, CLIENT_TAXONOMY as T, itemsHref } from "@/lib/items";
import { publicNpcs, publicQuests, publicVendors } from "@/lib/world-lists";
import JsonLd from "@/components/JsonLd";
import { AgreementMeter, Card, Container, PageHeader, SearchBar, SectionHeading, SourceLine } from "@/components/ui";
import { CC_BY_SA, datasetJsonLd } from "@/lib/jsonld";

const TITLE = "WoW Forever Database";
const description = "Loot-window observations, NPC sightings, quests and vendors for WoW: Forever, from addon uploads. Public facts need corroborated install reports.";
const DATASET_NAME = "Everloot addon observations for WoW: Forever";

export const metadata: Metadata = {
  ...pageMetadata({ title: TITLE, description, path: "/database" }),
};
export const dynamic = "force-dynamic";

/** One row of the panels: a place in the database and what it holds. */
function Row({ href, label, value }: { href: string; label: string; value: ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex min-h-11 items-center justify-between gap-4 py-2 text-fg hover:text-accent">
        <span className="min-w-0">{label}</span>
        <span className="shrink-0 font-mono text-sm tabular-nums text-muted">{value}</span>
      </Link>
    </li>
  );
}

export default async function DatabasePage() {
  const [{ rates, measuredZeros, stats }, world] = await Promise.all([computeRollups(), loadWorldFacts()]);
  const live = rates.filter((r) => r.public).length + measuredZeros.filter((z) => z.public).length;
  const classes = T.classes.filter((c) => c.items > 0).sort((a, b) => b.items - a.items);
  // What players have made public so far, per place: a count once there is one, the empty meter until then.
  const seen = (n: number) => (stats.unreachable ? "unrecorded" : n > 0 ? `${n.toLocaleString("en-US")} public` : <AgreementMeter count={0} />);
  const readable = !world.unreachable;
  const players = [
    { href: "/database/npcs", label: "NPCs and spawns", value: seen(readable ? publicNpcs(world).length : 0) },
    { href: "/database/quests", label: "Quests", value: seen(readable ? publicQuests(world).length : 0) },
    { href: "/database/vendors", label: "Vendors", value: seen(readable ? publicVendors(world).length : 0) },
    { href: "/database/objects", label: "Objects: chests, herbs, ore", value: seen(stats.unreachable ? 0 : objectList({ rates, measuredZeros, names: [] }).length) },
    { href: "/database/drops", label: "Loot observations", value: seen(live) },
    { href: "/tools/guild-board", label: "Guilds", value: "officer uploads" },
  ];

  return (
    <Container width="wide">
      <article>
        <JsonLd data={datasetJsonLd({ uploads: stats.unreachable ? 0 : stats.uploads, name: DATASET_NAME, description, path: "/database", corpusPath: "/api/corpus/public", dataAsOf: stats.unreachable ? null : stats.dataAsOf })} />
        <PageHeader
          trail={trailFor("/database")!}
          title={TITLE}
          lede="Every item in the game files, and what players' addons have seen in Forever."
        />
        <SearchBar
          action="/search"
          id="database-search"
          label="Search the database"
          placeholder="An item, NPC, quest or object: a name or an id"
          hint="Names show once 3 installs agree on them; any id opens its page."
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <Card as="section" aria-labelledby="db-items">
            <SectionHeading id="db-items" action={<Link href="/database/items" className="text-accent hover:underline underline-offset-4">All categories →</Link>}>
              Items by category
            </SectionHeading>
            <ul className="divide-y divide-line">
              {classes.map((c) => <Row key={c.id} href={itemsHref(c.slug)} label={c.label} value={c.items.toLocaleString("en-US")} />)}
            </ul>
          </Card>

          <Card as="section" aria-labelledby="db-players">
            <SectionHeading id="db-players" note="A fact is public once 3 installs agree on it.">Seen by players</SectionHeading>
            <ul className="divide-y divide-line">
              {players.map((p) => <Row key={p.href} {...p} />)}
            </ul>
            <p className="mt-4 text-sm text-muted">
              {stats.unreachable
                ? STORAGE_UNREACHABLE
                : stats.uploads > 0
                  ? `${stats.uploads.toLocaleString("en-US")} uploads · ${stats.lootWindows.toLocaleString("en-US")} loot windows · ${dataAgeLabel(stats.dataAsOf)}`
                  : <>Uploads are open during the beta. <Link href="/addon" className="text-accent hover:underline underline-offset-4">Get the addon</Link> and be one of the first 3.</>}
            </p>
          </Card>
        </div>

        <section aria-labelledby="licence" className="mt-12 max-w-reading">
          <SectionHeading id="licence">{DATASET_NAME}</SectionHeading>
          <p className="text-fg-2">{description}</p>
          <p className="mt-2 text-fg-2">
            Uploaded observations are published under <a href={CC_BY_SA.url} rel="noopener">{CC_BY_SA.name}</a>,
            credited to Everloot contributors. The records are open at <a href="/api/corpus/public">/api/corpus/public</a>.
            Distinct install IDs do not establish independent players.
          </p>
          <p className="mt-2 text-fg-2">
            The <Link href="/lore">lore archive</Link> holds Warcraft Wiki pages as of November 2023: lore and history, not collected Forever data.
          </p>
        </section>

        <SourceLine build={CLIENT_LAYER.build.version}>Item counts from the game files. {GAME_DATA_CREDIT}</SourceLine>
      </article>
    </Container>
  );
}
