import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { NpcReaction } from "../../../../../kb/src/world-pages";
import { Container, DataTable, DataTitle, FilterBar, ResultStrip, type Column, type FilterControl } from "@/components/ui";
import { computeRollups, loadWorldFacts } from "@/lib/rollup-compute";
import { npcRows, type NpcRow } from "@/lib/world-lists";
import { parseZoneSegment, publicZones, zoneSlug } from "@/lib/zones";
import { LINK } from "../entity";
import {
  flag, LEVEL_BRACKETS, listHref, listMetadata, listQuery, nextSort, NoMatches, NoObservations, PER_PAGE, range, rangeParam, sortParam, sortRows, Unreadable,
  type ListQuery, type Search,
} from "../list-parts";

const META = { title: "WoW Forever NPC Lookup", description: "Look up a WoW: Forever NPC by id. A name or a map pin becomes public only after three installs agree, and single reports stay queued.", path: "/database/npcs" };
export const dynamic = "force-dynamic";

const SORTS = ["name", "level", "react", "zone", "drops", "id"] as const;
type Sort = (typeof SORTS)[number];
const DEFAULT_SORT = { key: "id" as Sort, desc: false };
const REACTIONS: Record<string, NpcReaction> = { f: "friendly", n: "neutral", h: "hostile" };
const REACTION_LABEL: Record<NpcReaction, string> = { friendly: "Friendly", neutral: "Neutral", hostile: "Hostile" };

interface NpcQuery extends ListQuery<Sort> { zone?: number; drops?: boolean; level?: { min: number; max: number }; react?: string }

/** The NPC list's filters from the URL: `q`, `zone` (its page segment, `1429-elwynn-forest`), `drops=1`, `level=10-20`, `react=f|n|h`. */
function npcQuery(search: Search): NpcQuery | null {
  const base = listQuery(search, SORTS);
  const drops = flag(search, "drops"), level = range(search, "level");
  const zoneRaw = typeof search.zone === "string" ? search.zone : undefined;
  const zone = zoneRaw === undefined ? undefined : parseZoneSegment(zoneRaw);
  const react = typeof search.react === "string" ? search.react : undefined;
  if (!base || drops === null || level === null || zone === null) return null;
  if (zone !== undefined && !publicZones().some((z) => z.mapId === zone)) return null;
  if (react !== undefined && !REACTIONS[react]) return null;
  return { ...base, ...(zone ? { zone } : {}), ...(drops ? { drops } : {}), ...(level ? { level } : {}), ...(react ? { react } : {}) };
}

const zoneParam = (id?: number) => { const z = id === undefined ? undefined : publicZones().find((x) => x.mapId === id); return z ? zoneSlug(z.mapId, z.name) : undefined; };
const href = (q: Partial<NpcQuery>) => listHref("/database/npcs", [
  ["q", q.q], ["zone", zoneParam(q.zone)], ["level", rangeParam(q.level)], ["react", q.react], ["drops", q.drops ? "1" : undefined], ["sort", sortParam(q.sort)],
  ["page", q.page && q.page > 1 ? String(q.page) : undefined],
]);
const filters = (q: NpcQuery) => Number(Boolean(q.q)) + Number(Boolean(q.zone)) + Number(Boolean(q.drops)) + Number(Boolean(q.level)) + Number(Boolean(q.react));

export async function generateMetadata(props: { searchParams?: Promise<Search> }): Promise<Metadata> {
  const q = npcQuery((await props.searchParams) ?? {});
  return listMetadata(META, Boolean(q) && filters(q!) === 0 && !q!.sort && q!.page === 1);
}

export default async function NpcListPage(props: { searchParams?: Promise<Search> }) {
  const q = npcQuery((await props.searchParams) ?? {});
  if (!q) notFound();
  const [facts, { rates }] = await Promise.all([loadWorldFacts(), computeRollups()]);
  const all = facts.unreachable ? [] : npcRows(facts, rates);
  const text = q.q?.toLowerCase();
  const id = text && /^#?\d+$/.test(text) ? Number(text.replace("#", "")) : null;
  const matched = all.filter((n) =>
    (!text || (id !== null ? n.npcId === id : Boolean(n.name?.toLowerCase().includes(text))))
    && (!q.zone || n.zone?.mapId === q.zone) && (!q.drops || n.drops > 0)
    && (!q.level || (n.level !== null && n.level >= q.level.min && n.level <= q.level.max))
    && (!q.react || n.reaction === REACTIONS[q.react]));
  const sort = q.sort ?? DEFAULT_SORT;
  const key = (n: NpcRow): string | number | null => sort.key === "name" ? n.name?.toLowerCase() ?? null : sort.key === "level" ? n.level
    : sort.key === "react" ? n.reaction : sort.key === "zone" ? n.zone?.name ?? null : sort.key === "drops" ? n.drops : n.npcId;
  const rows = sortRows(matched, key, sort.desc, (n) => n.npcId);
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  if (q.page > pages) notFound();
  const shown = rows.slice((q.page - 1) * PER_PAGE, q.page * PER_PAGE);
  const here = (over: Partial<NpcQuery>) => href({ ...q, page: 1, ...over });

  const dash = <span className="text-muted">—</span>;
  const columns: Column<NpcRow>[] = [
    { key: "name", header: "Name", sortable: true, cell: (n) => <Link href={`/database/npcs/${n.npcId}`} className={LINK}>{n.name ?? `NPC ${n.npcId}`}</Link> },
    { key: "level", header: "Level", numeric: true, sortable: true, cell: (n) => n.level ?? dash },
    { key: "react", header: "Reaction", sortable: true, cell: (n) => (n.reaction ? REACTION_LABEL[n.reaction] : dash) },
    { key: "zone", header: "Zone", sortable: true, cell: (n) => n.zone?.name ?? dash },
    { key: "drops", header: "Drops", numeric: true, sortable: true, cell: (n) => n.drops || dash },
    { key: "id", header: "ID", numeric: true, sortable: true, cell: (n) => n.npcId },
  ];

  const zones = [...new Map(all.filter((n) => n.zone).map((n) => [n.zone!.mapId, n.zone!])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const controls: FilterControl[] = [
    {
      type: "menu", key: "zone", label: "Zone",
      options: [{ label: "Any zone", href: here({ zone: undefined }), on: !q.zone, reset: true }, ...zones.map((z) => ({
        label: z.name, href: here({ zone: z.mapId }), on: q.zone === z.mapId, count: all.filter((n) => n.zone?.mapId === z.mapId).length,
      }))],
    },
    {
      type: "menu", key: "level", label: "Level",
      options: [{ label: "Any level", href: here({ level: undefined }), on: !q.level, reset: true }, ...LEVEL_BRACKETS.map((b) => ({
        label: `${b.min}–${b.max}`, href: here({ level: b }), on: q.level?.min === b.min && q.level?.max === b.max,
      }))],
    },
    {
      type: "menu", key: "react", label: "Reaction",
      options: [{ label: "Any reaction", href: here({ react: undefined }), on: !q.react, reset: true }, ...Object.entries(REACTIONS).map(([k, r]) => ({
        label: REACTION_LABEL[r], href: here({ react: k }), on: q.react === k,
      }))],
    },
    { type: "toggle", key: "drops", label: "Has drops", href: here({ drops: q.drops ? undefined : true }), on: Boolean(q.drops) },
  ];
  const keep = Object.fromEntries(new URLSearchParams(href({ ...q, q: undefined, page: 1 }).split("?")[1] ?? ""));
  const strip = <ResultStrip total={rows.length} noun={rows.length === 1 ? "NPC" : "NPCs"} page={q.page} perPage={PER_PAGE} href={(page) => href({ ...q, page })} label="NPC pages" />;
  const chips = [
    ...(q.q ? [{ label: `Name: ${q.q}`, href: here({ q: undefined }) }] : []),
    ...(q.zone ? [{ label: zones.find((z) => z.mapId === q.zone)?.name ?? "Zone", href: here({ zone: undefined }) }] : []),
    ...(q.level ? [{ label: `Level ${rangeParam(q.level)}`, href: here({ level: undefined }) }] : []),
    ...(q.react ? [{ label: REACTION_LABEL[REACTIONS[q.react]], href: here({ react: undefined }) }] : []),
    ...(q.drops ? [{ label: "Has drops", href: here({ drops: undefined }) }] : []),
  ];
  const empty = facts.unreachable ? <Unreadable />
    : filters(q) > 0 ? <>
        <NoMatches noun="NPCs" chips={chips} clearHref="/database/npcs" />
        {id !== null && <p className="pb-4 text-cell"><Link href={`/database/npcs/${id}`} className={LINK}>Open NPC {id}</Link></p>}
      </>
    : <NoObservations>No NPC has an agreed name or position yet; each shows here once 3 installs report it.</NoObservations>;

  return (
    <Container width="data">
      <article>
        <DataTitle title="NPCs" aside={strip} />
        <FilterBar
          label="NPC filters"
          search={{ action: "/database/npcs", value: q.q, placeholder: "Name or id", label: "Filter by name or id", keep }}
          controls={controls}
          active={filters(q)}
          clearHref="/database/npcs"
        />
        <div className="mt-2">
          <DataTable
            dense
            caption={`NPCs players have reported: ${rows.length}`}
            columns={columns}
            rows={shown}
            rowKey={(n) => String(n.npcId)}
            sort={{ key: sort.key, direction: sort.desc ? "desc" : "asc" }}
            sortHref={(k, dir) => here({ sort: nextSort(k, dir, DEFAULT_SORT) })}
            meta={(n) => [n.level !== null && `Level ${n.level}`, n.reaction && REACTION_LABEL[n.reaction], n.zone?.name, n.drops > 0 && `${n.drops} drops`, `ID ${n.npcId}`].filter(Boolean).join(" · ")}
            empty={empty}
          />
        </div>
        {pages > 1 && <div className="mt-2">{strip}</div>}
      </article>
    </Container>
  );
}
