import type { Metadata } from "next";
import Link from "next/link";
import { Container, DataTable, PageHeader, SectionHeading, SourceLine, type Column } from "@/components/ui";
import { trailFor } from "@/lib/breadcrumbs";
import { loadWorldFacts } from "@/lib/rollup-compute";
import { pageMetadata } from "@/lib/seo";
import { STORAGE_UNREACHABLE } from "@/lib/upload-store";
import { WORLD_MAP } from "@/lib/world-map";
import { publicZones, zoneContents, zoneHref, type ZoneContents, type ZoneSummary } from "@/lib/zones";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: "WoW Forever Zones",
  description: "Every zone of WoW: Forever by continent, with the dungeons and raids entered there and the NPCs, vendors and quests players have confirmed in each.",
  path: "/database/zones",
});

type Row = ZoneSummary & { contents: ZoneContents | null };

export default async function ZonesPage() {
  const facts = await loadWorldFacts();
  const contents = zoneContents(facts.unreachable ? { npcs: [], quests: [], vendors: [] } : facts);
  const zones = publicZones();
  const continents = WORLD_MAP.continents.map((c) => ({ ...c, rows: zones.filter((z) => z.continentId === c.id).map((z): Row => ({ ...z, contents: contents.get(z.mapId) ?? null })) })).filter((c) => c.rows.length);

  // Player counts are blank, not zero, while storage is down.
  const count = (pick: (c: ZoneContents) => number) => (row: Row) => (row.contents === null || facts.unreachable ? "–" : pick(row.contents));
  const columns: Column<Row>[] = [
    { key: "zone", header: "Zone", cell: (z) => <Link href={zoneHref(z.mapId, z.name)} className="text-accent hover:underline underline-offset-4">{z.name}</Link> },
    { key: "npcs", header: "NPCs", numeric: true, cell: count((c) => c.npcs.filter((n) => !n.vendor).length) },
    { key: "vendors", header: "Vendors", numeric: true, cell: count((c) => c.npcs.filter((n) => n.vendor).length) },
    { key: "quests", header: "Quests", numeric: true, cell: count((c) => c.quests.length) },
    { key: "instances", header: "Dungeons and raids", numeric: true, cell: (z) => z.contents?.entrances.length ?? 0 },
  ];

  return (
    <article>
      <Container>
        <PageHeader
          title="Zones"
          lede="The world by continent. Open a zone for its map, its dungeons and raids, and what players have found there."
          trail={trailFor("/database/zones") ?? undefined}
        />
        {facts.unreachable && <p className="mb-6 text-sm text-warning">{STORAGE_UNREACHABLE} Player counts are left blank until it is back.</p>}
        <div className="space-y-10">
          {continents.map((c) => (
            <section key={c.id} aria-labelledby={`continent-${c.id}`}>
              <SectionHeading id={`continent-${c.id}`} note={`${c.rows.length} zones`}>{c.name}</SectionHeading>
              <DataTable caption={`Zones of ${c.name}`} columns={columns} rows={c.rows} rowKey={(z) => String(z.mapId)} />
            </section>
          ))}
        </div>
        <p className="mt-8 max-w-[65ch] text-sm text-muted">
          Zones found only in the game files, which may not be released, are not listed. Counts are what 3 installs agree on; dungeon and raid entrances are read from the game files.
        </p>
        <SourceLine build={WORLD_MAP.source.version} licence="Zone list and entrances are Blizzard's data; counts are player reports under CC BY-SA 4.0" />
      </Container>
    </article>
  );
}
