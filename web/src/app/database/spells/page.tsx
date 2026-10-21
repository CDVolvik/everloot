import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container, DataTable, DataTitle, FilterBar, ResultStrip, type Column } from "@/components/ui";
import { loadSpellNames } from "@/lib/game-assets";
import { CLIENT_LAYER } from "@/lib/items";
import { LINK } from "../entity";
import {
  listHref, listMetadata, listQuery, nextSort, NoMatches, NoObservations, PER_PAGE, sortParam, sortRows, Unreadable,
  type ListQuery, type Search,
} from "../list-parts";

/**
 * The spell list. Spells are the game's own data: the list is the spellbook of one build, with the
 * names the site's naming rule allows showing, and every row links to the spell's page.
 */
const META = { title: "WoW Forever Spell List", description: "Spells in WoW: Forever, read from the client files of one build: what each one creates, what it costs and which talent teaches it.", path: "/database/spells" };
export const dynamic = "force-dynamic";

const SORTS = ["name", "id"] as const;
type Sort = (typeof SORTS)[number];
const DEFAULT_SORT = { key: "id" as Sort, desc: false };

const href = (q: Partial<ListQuery<Sort>>) => listHref("/database/spells", [
  ["q", q.q], ["sort", sortParam(q.sort)], ["page", q.page && q.page > 1 ? String(q.page) : undefined],
]);

export async function generateMetadata(props: { searchParams?: Promise<Search> }): Promise<Metadata> {
  const q = listQuery((await props.searchParams) ?? {}, SORTS);
  return listMetadata(META, Boolean(q) && !q!.q && !q!.sort, q?.page);
}

export default async function SpellListPage(props: { searchParams?: Promise<Search> }) {
  const q = listQuery((await props.searchParams) ?? {}, SORTS);
  if (!q) notFound();
  const names = await loadSpellNames(CLIENT_LAYER.build.version);
  const all = names?.names ?? new Map<number, string>();
  const text = q.q?.toLowerCase();
  const id = text && /^#?\d+$/.test(text) ? Number(text.replace("#", "")) : null;
  const rows = [...all.entries()]
    .filter(([spellId, name]) => !text || (id !== null ? spellId === id : name.toLowerCase().includes(text)))
    .map(([spellId, name]) => ({ spellId, name }));
  const sort = q.sort ?? DEFAULT_SORT;
  const sorted = sortRows(rows, (x) => (sort.key === "name" ? x.name.toLowerCase() : x.spellId), sort.desc, (x) => x.spellId);
  const pages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  if (q.page > pages) notFound();
  const shown = sorted.slice((q.page - 1) * PER_PAGE, q.page * PER_PAGE);
  const here = (over: Partial<ListQuery<Sort>>) => href({ ...q, page: 1, ...over });

  const columns: Column<(typeof rows)[number]>[] = [
    { key: "name", header: "Spell", sortable: true, cell: (x) => <a href={`/database/spells/${x.spellId}`} className={LINK}>{x.name}</a> },
    { key: "id", header: "ID", numeric: true, sortable: true, cell: (x) => x.spellId },
  ];
  const keep = Object.fromEntries(new URLSearchParams(href({ ...q, q: undefined, page: 1 }).split("?")[1] ?? ""));
  const strip = <ResultStrip total={sorted.length} noun={sorted.length === 1 ? "spell" : "spells"} page={q.page} perPage={PER_PAGE} href={(page) => href({ ...q, page })} label="Spell pages" />;
  const chips = q.q ? [{ label: `Name: ${q.q}`, href: here({ q: undefined }) }] : [];
  const empty = !names ? <Unreadable />
    : q.q ? <NoMatches noun="spells" chips={chips} clearHref="/database/spells" />
    : <NoObservations>No spell is listed yet.</NoObservations>;

  return (
    <Container width="data">
      <article>
        <DataTitle title="Spells" aside={strip} />
        <FilterBar
          label="Spell filters"
          search={{ action: "/database/spells", value: q.q, placeholder: "Name or id", label: "Filter by name or id", keep }}
          controls={[]}
          active={q.q ? 1 : 0}
          clearHref="/database/spells"
        />
        <div className="mt-2">
          <DataTable
            dense
            caption={`Spells in the game files: ${sorted.length}`}
            columns={columns}
            rows={shown}
            rowKey={(x) => String(x.spellId)}
            sort={{ key: sort.key, direction: sort.desc ? "desc" : "asc" }}
            sortHref={(k, dir) => here({ sort: nextSort(k, dir, DEFAULT_SORT) })}
            meta={(x) => `ID ${x.spellId}`}
            empty={empty}
          />
        </div>
      </article>
    </Container>
  );
}
