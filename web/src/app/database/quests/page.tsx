import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { itemPage } from "../../../../../kb/src/item-page";
import type { QuestPage } from "../../../../../kb/src/world-pages";
import GameIcon from "@/components/game/GameIcon";
import { Container, DataTable, DataTitle, FilterBar, ResultStrip, type Column, type FilterControl } from "@/components/ui";
import { loadItemTips, loadSiteAssets } from "@/lib/game-assets";
import { shownItemName } from "@/lib/items";
import { npcNames } from "@/lib/names";
import { loadWorldFacts } from "@/lib/rollup-compute";
import { loadShownNames } from "@/lib/shown-item-names";
import { publicQuests } from "@/lib/world-lists";
import { LINK } from "../entity";
import {
  flag, LEVEL_BRACKETS, listHref, listMetadata, listQuery, nextSort, NoMatches, NoObservations, PER_PAGE, range, rangeParam, sortParam, sortRows, Unreadable,
  type ListQuery, type Search,
} from "../list-parts";

const META = { title: "WoW Forever Quest Lookup", description: "Look up a WoW: Forever quest by id. Title, level, giver, turn-in and rewards become public after three installs agree on them.", path: "/database/quests" };
export const dynamic = "force-dynamic";

const SORTS = ["name", "level", "giver", "turnin", "rewards", "id"] as const;
type Sort = (typeof SORTS)[number];
const DEFAULT_SORT = { key: "id" as Sort, desc: false };

interface QuestQuery extends ListQuery<Sort> { level?: { min: number; max: number }; rewards?: boolean }

/** The quest list's filters from the URL: `q`, `level=10-20`, `rewards=1`. */
function questQuery(search: Search): QuestQuery | null {
  const base = listQuery(search, SORTS);
  const level = range(search, "level"), rewards = flag(search, "rewards");
  if (!base || level === null || rewards === null) return null;
  return { ...base, ...(level ? { level } : {}), ...(rewards ? { rewards } : {}) };
}

const href = (q: Partial<QuestQuery>) => listHref("/database/quests", [
  ["q", q.q], ["level", rangeParam(q.level)], ["rewards", q.rewards ? "1" : undefined], ["sort", sortParam(q.sort)], ["page", q.page && q.page > 1 ? String(q.page) : undefined],
]);
const filters = (q: QuestQuery) => Number(Boolean(q.q)) + Number(Boolean(q.level)) + Number(Boolean(q.rewards));

export async function generateMetadata(props: { searchParams?: Promise<Search> }): Promise<Metadata> {
  const q = questQuery((await props.searchParams) ?? {});
  return listMetadata(META, Boolean(q) && filters(q!) === 0 && !q!.sort && q!.page === 1);
}

export default async function QuestListPage(props: { searchParams?: Promise<Search> }) {
  const q = questQuery((await props.searchParams) ?? {});
  if (!q) notFound();
  const facts = await loadWorldFacts();
  const all = facts.unreachable ? [] : publicQuests(facts);
  const npcs = facts.unreachable ? new Map<number, string>() : npcNames(facts);
  const text = q.q?.toLowerCase();
  const id = text && /^#?\d+$/.test(text) ? Number(text.replace("#", "")) : null;
  const matched = all.filter((x) =>
    (!text || (id !== null ? x.questId === id : Boolean(x.title?.toLowerCase().includes(text))))
    && (!q.level || (x.level !== null && x.level >= q.level.min && x.level <= q.level.max)) && (!q.rewards || x.rewards.length > 0));
  const sort = q.sort ?? DEFAULT_SORT;
  const npcKey = (n: number | null) => (n === null ? null : npcs.get(n)?.toLowerCase() ?? `~${String(n).padStart(9, "0")}`);
  const key = (x: QuestPage): string | number | null => sort.key === "name" ? x.title?.toLowerCase() ?? null : sort.key === "level" ? x.level
    : sort.key === "giver" ? npcKey(x.giverNpcId) : sort.key === "turnin" ? npcKey(x.turnInNpcId) : sort.key === "rewards" ? x.rewards.length : x.questId;
  const rows = sortRows(matched, key, sort.desc, (x) => x.questId);
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  if (q.page > pages) notFound();
  const shown = rows.slice((q.page - 1) * PER_PAGE, q.page * PER_PAGE);
  const here = (over: Partial<QuestQuery>) => href({ ...q, page: 1, ...over });

  // Reward icons and names under the item lists' rule: art only for items players reported or the wiki names.
  const rewardIds = [...new Set(shown.flatMap((x) => x.rewards))];
  const shownNames = rewardIds.length ? await loadShownNames() : null;
  const reported = !shownNames || shownNames.facts.unreachable ? [] : rewardIds.filter((rid) => { const p = itemPage(rid, shownNames.facts); return Boolean(p.name || p.drops.length || p.pins.length); });
  const withArt = [...new Set([...reported, ...rewardIds.filter((rid) => shownNames?.matched?.names.has(rid))])];
  const tips = await loadItemTips(withArt.length ? await loadSiteAssets() : null, withArt);
  const itemName = (rid: number) => (shownNames ? shownItemName(rid, shownNames.agreed, shownNames.matched?.names, reported.includes(rid) ? tips.get(rid) : null)?.name : undefined) ?? `Item ${rid}`;

  const dash = <span className="text-muted">—</span>;
  const npc = (n: number | null) => (n === null ? dash : <Link href={`/database/npcs/${n}`} className={LINK}>{npcs.get(n) ?? `NPC ${n}`}</Link>);
  const columns: Column<QuestPage>[] = [
    { key: "name", header: "Name", sortable: true, cell: (x) => <Link href={`/database/quests/${x.questId}`} className={LINK}>{x.title ?? `Quest ${x.questId}`}</Link> },
    { key: "level", header: "Level", numeric: true, sortable: true, cell: (x) => x.level ?? dash },
    { key: "giver", header: "Giver", sortable: true, cell: (x) => npc(x.giverNpcId) },
    { key: "turnin", header: "Turn-in", sortable: true, cell: (x) => npc(x.turnInNpcId) },
    {
      key: "rewards", header: "Rewards", sortable: true, cell: (x) => x.rewards.length === 0 ? dash : (
        <span className="flex flex-wrap items-center gap-1">
          {x.rewards.map((rid) => {
            const icon = tips.get(rid)?.icon;
            return icon
              ? <Link key={rid} href={`/database/items/${rid}`} title={itemName(rid)} aria-label={itemName(rid)}><GameIcon src={icon} size={24} /></Link>
              : <Link key={rid} href={`/database/items/${rid}`} className={`${LINK} mr-2`}>{itemName(rid)}</Link>;
          })}
        </span>
      ),
    },
    { key: "id", header: "ID", numeric: true, sortable: true, cell: (x) => x.questId },
  ];

  const controls: FilterControl[] = [
    {
      type: "menu", key: "level", label: "Level",
      options: [{ label: "Any level", href: here({ level: undefined }), on: !q.level, reset: true }, ...LEVEL_BRACKETS.map((b) => ({
        label: `${b.min}–${b.max}`, href: here({ level: b }), on: q.level?.min === b.min && q.level?.max === b.max,
      }))],
    },
    { type: "toggle", key: "rewards", label: "Has rewards", href: here({ rewards: q.rewards ? undefined : true }), on: Boolean(q.rewards) },
  ];
  const keep = Object.fromEntries(new URLSearchParams(href({ ...q, q: undefined, page: 1 }).split("?")[1] ?? ""));
  const strip = <ResultStrip total={rows.length} noun={rows.length === 1 ? "quest" : "quests"} page={q.page} perPage={PER_PAGE} href={(page) => href({ ...q, page })} label="Quest pages" />;
  const chips = [
    ...(q.q ? [{ label: `Name: ${q.q}`, href: here({ q: undefined }) }] : []),
    ...(q.level ? [{ label: `Level ${rangeParam(q.level)}`, href: here({ level: undefined }) }] : []),
    ...(q.rewards ? [{ label: "Has rewards", href: here({ rewards: undefined }) }] : []),
  ];
  const empty = facts.unreachable ? <Unreadable />
    : filters(q) > 0 ? <>
        <NoMatches noun="quests" chips={chips} clearHref="/database/quests" />
        {id !== null && <p className="pb-4 text-cell"><Link href={`/database/quests/${id}`} className={LINK}>Open quest {id}</Link></p>}
      </>
    : <NoObservations>No quest has agreed facts yet; each shows here once 3 installs report it.</NoObservations>;

  return (
    <Container width="data">
      <article>
        <DataTitle title="Quests" aside={strip} />
        <FilterBar
          label="Quest filters"
          search={{ action: "/database/quests", value: q.q, placeholder: "Name or id", label: "Filter by name or id", keep }}
          controls={controls}
          active={filters(q)}
          clearHref="/database/quests"
        />
        <div className="mt-2">
          <DataTable
            dense
            caption={`Quests with agreed facts: ${rows.length}`}
            columns={columns}
            rows={shown}
            rowKey={(x) => String(x.questId)}
            sort={{ key: sort.key, direction: sort.desc ? "desc" : "asc" }}
            sortHref={(k, dir) => here({ sort: nextSort(k, dir, DEFAULT_SORT) })}
            meta={(x) => [x.level !== null && `Level ${x.level}`, x.giverNpcId !== null && `From ${npcs.get(x.giverNpcId) ?? `NPC ${x.giverNpcId}`}`, x.rewards.length > 0 && `${x.rewards.length} reward${x.rewards.length === 1 ? "" : "s"}`, `ID ${x.questId}`].filter(Boolean).join(" · ")}
            empty={empty}
          />
        </div>
        {pages > 1 && <div className="mt-2">{strip}</div>}
      </article>
    </Container>
  );
}
