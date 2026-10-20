import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import AdSlot from "@/components/AdSlot";
import ZonePreview from "@/components/ZonePreview";
import {
  AgreementMeter, Badge, Card, Container, DataTable, EmptyState, PageHeader, SectionHeading, Tabs,
  type Column, type TabItem,
} from "@/components/ui";
import { GAME_NAME_TITLE } from "@/components/EntityRelations";
import { loadQuestNames, loadSiteAssets } from "@/lib/game-assets";
import { CLIENT_LAYER } from "@/lib/items";
import { loadWorldFacts } from "@/lib/rollup-compute";
import { pageMetadata } from "@/lib/seo";
import { STORAGE_UNREACHABLE } from "@/lib/upload-store";
import { WORLD_MAP } from "@/lib/world-map";
import {
  hasContent, parseZoneSegment, zoneByMapId, zoneContents, zoneHref, zoneMapHref,
  type ZoneEntrance, type ZoneNpc, type ZoneQuest,
} from "@/lib/zones";
import { zoneLore } from "@/lib/zone-lore";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ zone: string }> };

const link = "text-accent hover:underline underline-offset-4";

/** Resolves the segment to a released zone, or null; a held-back zone is the same as one that does not exist. */
function find(segment: string) {
  const id = parseZoneSegment(segment);
  return id === null ? null : zoneByMapId(id) ?? null;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { zone: segment } = await props.params;
  const zone = find(segment);
  if (!zone) return { robots: { index: false, follow: true } };
  const facts = await loadWorldFacts();
  const here = facts.unreachable ? undefined : zoneContents(facts).get(zone.mapId);
  // Indexed once there is something on it (a player-confirmed NPC or quest, or an entrance), and as the sitemap lists it.
  // Storage down: noindex rather than cache a thin page.
  const indexable = !facts.unreachable && hasContent(here);
  return {
    ...pageMetadata({
      title: `${zone.name}, ${zone.continentName}`,
      description: `${zone.name} in ${zone.continentName}: its map, the dungeons and raids entered here, and the NPCs, vendors and quests players have confirmed. WoW: Forever.`,
      path: zoneHref(zone.mapId, zone.name),
    }),
    robots: { index: indexable, follow: true },
  };
}

const position = (x: number, y: number) => `${x}, ${y}`;

export default async function ZonePage(props: Props) {
  const { zone: segment } = await props.params;
  const zone = find(segment);
  if (!zone) notFound();
  const canonical = zoneHref(zone.mapId, zone.name);
  if (`/database/zones/${segment}` !== canonical) permanentRedirect(canonical);

  const facts = await loadWorldFacts();
  // Entrances come from the game files, so they show even when storage is down; player reports do not.
  const here = zoneContents(facts.unreachable ? { npcs: [], quests: [], vendors: [] } : facts).get(zone.mapId);
  const lore = zoneLore(zone.name);
  const shape = WORLD_MAP.zones.find((z) => z.uiMapId === zone.mapId)!;
  const assets = await loadSiteAssets();
  const art = assets?.maps.find((m) => m.kind === "zone" && m.uiMapId === zone.mapId && !m.heldBack) ?? null;

  const npcs = (here?.npcs ?? []).filter((n) => !n.vendor);
  const vendors = (here?.npcs ?? []).filter((n) => n.vendor);
  const quests = here?.quests ?? [];
  const wikiTitles = quests.some((q) => !q.title) ? await loadQuestNames(CLIENT_LAYER.build.version) : null;
  const entrances = here?.entrances ?? [];
  const nameOf = (n: ZoneNpc) => n.name ?? `NPC ${n.npcId}`;
  const empty = (message: string) => <EmptyState message={message} framed={false} />;

  const npcColumns = (kind: "npcs" | "vendors"): Column<ZoneNpc>[] => [
    { key: "name", header: "Name", cell: (n) => <Link href={`/database/${kind}/${n.npcId}`} className={link}>{nameOf(n)}</Link> },
    { key: "at", header: "Position", numeric: true, cell: (n) => position(n.x, n.y) },
    { key: "installs", header: "Installs", cell: (n) => <AgreementMeter count={n.reporters} /> },
  ];
  const npcLink = (id: number | null) => (id === null ? "unrecorded" : <Link href={`/database/npcs/${id}`} className={link}>NPC {id}</Link>);
  const questColumns: Column<ZoneQuest>[] = [
    { key: "title", header: "Quest", cell: (q) => {
      // A title players agree on; else the Warcraft Wiki's, with its source as the tooltip.
      const wiki = q.title ? undefined : wikiTitles?.names.get(q.questId)?.name;
      return <Link href={`/database/quests/${q.questId}`} title={wiki ? GAME_NAME_TITLE.wiki : undefined} className={link}>
        {q.title ?? wiki ?? `Quest ${q.questId}`}
        {wiki && <span className="sr-only"> ({GAME_NAME_TITLE.wiki.toLowerCase()})</span>}
      </Link>;
    } },
    { key: "level", header: "Level", numeric: true, cell: (q) => q.level ?? "–" },
    { key: "giver", header: "Giver", cell: (q) => npcLink(q.giverNpcId) },
    { key: "turnin", header: "Turn-in", cell: (q) => npcLink(q.turnInNpcId) },
  ];
  const entranceColumns: Column<ZoneEntrance>[] = [
    { key: "name", header: "Name", cell: (e) => e.names.join(", ") },
    { key: "kind", header: "Type", cell: (e) => <Badge tone="neutral">{e.raid ? "Raid" : "Dungeon"}</Badge> },
    { key: "at", header: "Entrance", numeric: true, cell: (e) => position(e.x, e.y) },
    { key: "src", header: "Source", cell: () => <Badge tone="files" /> },
  ];

  const all: TabItem[] = [
    { id: "npcs", label: "NPCs", count: npcs.length, panel: <DataTable dense caption={`NPCs players placed in ${zone.name}`} columns={npcColumns("npcs")} rows={npcs} rowKey={(n) => String(n.npcId)} empty={empty("No NPC has a confirmed position here yet. A pin needs 3 installs on the same map.")} /> },
    { id: "vendors", label: "Vendors", count: vendors.length, panel: <DataTable dense caption={`Vendors players placed in ${zone.name}`} columns={npcColumns("vendors")} rows={vendors} rowKey={(n) => String(n.npcId)} empty={empty("No vendor here has prices 3 installs agree on yet.")} /> },
    { id: "quests", label: "Quests", count: quests.length, panel: <DataTable dense caption={`Quests given or turned in at confirmed NPCs in ${zone.name}`} columns={questColumns} rows={quests} rowKey={(q) => String(q.questId)} empty={empty("No quest has a confirmed giver or turn-in here yet.")} /> },
    { id: "dungeons", label: "Dungeons and raids", count: entrances.length, panel: <DataTable dense caption={`Dungeon and raid entrances in ${zone.name}`} columns={entranceColumns} rows={entrances} rowKey={(e) => e.names.join("|")} empty={<p className="px-4 py-8 text-fg-2 sm:px-6">No dungeon or raid is entered from this zone.</p>} /> },
    { id: "objects", label: "Objects", count: 0, panel: <EmptyState message="Chests, herbs and ore veins have no position in what players have reported yet, so none can be placed in a zone." framed={false} /> },
  ];
  // Storage down: an empty list would read as "nobody has seen anything", so only the game-file list stays.
  const tabs = facts.unreachable ? all.filter((t) => t.id === "dungeons") : all;

  return (
    <article>
      <Container>
        <PageHeader
          title={zone.name}
          lede={`A zone in ${zone.continentName}.`}
          trail={[
            { name: "Home", path: "/" },
            { name: "Database", path: "/database" },
            { name: "Zones", path: "/database/zones" },
            { name: zone.name, path: canonical },
          ]}
          meta={<Badge tone="files">Zone outline · from game files</Badge>}
          actions={<Link href={zoneMapHref(zone.mapId)} className="btn btn-primary">Open on the map</Link>}
        />

        {facts.unreachable && <p className="mb-6 text-sm text-warning">{STORAGE_UNREACHABLE} The lists below cannot be shown until it is back.</p>}

        <div className="space-y-10">
          <ZonePreview
            name={zone.name}
            width={shape.bounds.left - shape.bounds.right}
            height={shape.bounds.top - shape.bounds.bottom}
            art={art?.url ?? null}
            npcs={here?.npcs ?? []}
            entrances={entrances}
          />

          {lore && (
            <section aria-labelledby="lore">
              <SectionHeading id="lore">Lore</SectionHeading>
              <Card as="div">
                <p className="max-w-[65ch] text-fg">{lore.text}</p>
                <p className="mt-3 text-sm text-muted">
                  From the archive of the Warcraft Wiki, 2023 · {lore.licence} ·{" "}
                  <Link href={lore.href} className={link}>Read the full lore page</Link>
                </p>
              </Card>
            </section>
          )}

          <section aria-labelledby="known">
            <SectionHeading id="known" note="Positions and quests are public once 3 installs agree. Entrances are read from the game files.">
              What we know here
            </SectionHeading>
            <Tabs label={`Known in ${zone.name}`} tabs={tabs} />
          </section>
        </div>
        {!facts.unreachable && hasContent(here) && <AdSlot slot="inContent" />}
      </Container>
    </article>
  );
}
