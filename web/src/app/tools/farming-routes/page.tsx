import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import EmailCapture from "@/components/EmailCapture";
import { Card, Container, DataTable, DataTitle, FilterBar, SectionHeading, type Column, type FilterControl } from "@/components/ui";
import { FARM_CATEGORIES, farmingAreas, inLevels, type FarmArea, type FarmCategory } from "@/lib/farming";
import { computeRollups, loadWorldFacts } from "@/lib/rollup-compute";
import { STORAGE_UNREACHABLE } from "@/lib/upload-store";
import { npcRows } from "@/lib/world-lists";
import { publicZones, zoneContents, zoneHref, zoneMapHref } from "@/lib/zones";
import { LINK } from "../../database/entity";
import { LEVEL_BRACKETS, listHref, listMetadata, range, rangeParam, type Search } from "../../database/list-parts";

const META = {
  title: "WoW Forever Farming Routes",
  description: "WoW: Forever farming areas by what you farm: gold, herbs, ore, leather, cloth, reputation and dungeons, filled in from what players upload.",
  path: "/tools/farming-routes",
};
export const dynamic = "force-dynamic";

const SLUGS = new Set<string>(FARM_CATEGORIES.map((c) => c.slug));

interface FarmQuery { category?: FarmCategory; level?: { min: number; max: number } }

/** The page's filters from the URL: `category=cloth`, `level=10-20`. Null when a value is malformed (404). */
function farmQuery(search: Search): FarmQuery | null {
  const level = range(search, "level");
  const category = search.category;
  if (level === null || (category !== undefined && (typeof category !== "string" || !SLUGS.has(category)))) return null;
  return { ...(category ? { category: category as FarmCategory } : {}), ...(level ? { level } : {}) };
}

const href = (q: FarmQuery) => listHref(META.path, [["category", q.category], ["level", rangeParam(q.level)]]);
const filters = (q: FarmQuery) => Number(Boolean(q.category)) + Number(Boolean(q.level));

export async function generateMetadata(props: { searchParams?: Promise<Search> }): Promise<Metadata> {
  const q = farmQuery((await props.searchParams) ?? {});
  return { ...listMetadata(META, Boolean(q) && filters(q!) === 0), keywords: ["wow forever farming", "wow forever gold farm", "wow forever routes"] };
}

const levelsText = (a: FarmArea) => (a.levels ? (a.levels.min === a.levels.max ? String(a.levels.min) : `${a.levels.min}–${a.levels.max}`) : null);

export default async function FarmingRoutesPage(props: { searchParams?: Promise<Search> }) {
  const q = farmQuery((await props.searchParams) ?? {});
  if (!q) notFound();
  const [facts, { rates }] = await Promise.all([loadWorldFacts(), computeRollups()]);
  const down = facts.unreachable;
  const zones = publicZones();
  // Dungeon entrances come from the game files, so they show even when storage is down.
  const areas = farmingAreas(down ? [] : npcRows(facts, rates), down ? [] : rates, zones, zoneContents({ npcs: [], quests: [], vendors: [] }));
  const here = (over: FarmQuery) => href({ ...q, ...over });

  const dash = <span className="text-muted">—</span>;
  const zoneLink = (a: FarmArea) => <Link href={zoneHref(a.zone.mapId, a.zone.name)} className={LINK}>{a.zone.name}</Link>;
  const mapLink: Column<FarmArea> = { key: "map", header: "Map", cell: (a) => <Link href={zoneMapHref(a.zone.mapId)} className={LINK}>Map</Link> };
  const levels: Column<FarmArea> = { key: "levels", header: "Levels", numeric: true, cell: (a) => levelsText(a) ?? dash };
  const zoneColumns: Column<FarmArea>[] = [
    { key: "zone", header: "Zone", cell: zoneLink },
    { key: "continent", header: "Continent", cell: (a) => a.zone.continentName },
    levels,
    { key: "mobs", header: "Looted mobs", numeric: true, cell: (a) => a.mobs },
    mapLink,
  ];
  const dungeonColumns: Column<FarmArea>[] = [
    { key: "dungeon", header: "Dungeon", cell: (a) => a.dungeon },
    { key: "zone", header: "Entered from", cell: zoneLink },
    levels,
    mapLink,
  ];

  const controls: FilterControl[] = [
    {
      type: "menu", key: "category", label: "Farm",
      options: [{ label: "Everything", href: here({ category: undefined }), on: !q.category, reset: true }, ...FARM_CATEGORIES.map((c) => ({
        label: c.label, href: here({ category: c.slug }), on: q.category === c.slug, count: areas[c.slug].length,
      }))],
    },
    {
      type: "menu", key: "level", label: "Level",
      options: [{ label: "Any level", href: here({ level: undefined }), on: !q.level, reset: true }, ...LEVEL_BRACKETS.map((b) => ({
        label: `${b.min}–${b.max}`, href: here({ level: b }), on: q.level?.min === b.min && q.level?.max === b.max,
      }))],
    },
  ];

  const shown = FARM_CATEGORIES.filter((c) => !q.category || q.category === c.slug);
  const quiet = (text: string) => <p data-empty-state className="py-3 text-cell text-fg-2">{text}</p>;

  return (
    <Container width="data">
      <article>
        <DataTitle title="Farming areas" meta="Where to farm, by what you farm. Areas fill in as players upload." />
        <FilterBar label="Farming filters" controls={controls} active={filters(q)} clearHref={META.path} />
        <div className="mt-4 space-y-6">
          {shown.map((c) => {
            const all = areas[c.slug];
            const rows = q.level ? all.filter((a) => inLevels(a, q.level!)) : all;
            // Storage down: the mob-backed lists are unread, not empty.
            const empty = down && c.slug !== "dungeons" ? quiet(STORAGE_UNREACHABLE)
              : all.length === 0 ? quiet(`Routes for ${c.noun} arrive as players upload.`)
              : quiet(`Nothing here for levels ${rangeParam(q.level)}.`);
            return (
              <section key={c.slug} aria-labelledby={`farm-${c.slug}`} data-farm={c.slug}>
                <SectionHeading id={`farm-${c.slug}`} as="h2">{c.label}</SectionHeading>
                {rows.length === 0 ? empty : (
                  <DataTable
                    dense
                    caption={`${c.label} areas: ${rows.length}`}
                    columns={c.slug === "dungeons" ? dungeonColumns : zoneColumns}
                    rows={rows}
                    rowKey={(a) => a.key}
                    meta={(a) => [a.dungeon ? `${a.dungeon}, ${a.zone.name}` : a.zone.name, levelsText(a) && `Levels ${levelsText(a)}`].filter(Boolean).join(" · ")}
                  />
                )}
              </section>
            );
          })}
        </div>
        <Card className="mt-8 max-w-xl">
          <EmailCapture toolSlug="farming-routes" />
        </Card>
      </article>
    </Container>
  );
}
