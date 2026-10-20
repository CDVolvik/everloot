import { tools, toolHref } from "@/data/tools";
import { entityHref } from "@/components/EntityLink";
import { objectList } from "../../../kb/src/object-page";
import { loreSlug, MAX_QUERY, searchLore, UNAVAILABLE } from "./lore";
import { loadNames } from "./names";
import { loadObjectFacts } from "./objects";
import { WORLD_MAP } from "./world-map";
import { zoneHref } from "./zones";

/** One page the search found. `exact` is an exact id or an exact name: those lead their group, and the page. */
export interface SearchResult { label: string; href: string; note?: string; exact: boolean }
export type SearchType = "item" | "npc" | "quest" | "object" | "zone" | "lore" | "tool";
export interface SearchGroup { type: SearchType; heading: string; results: SearchResult[] }

export const GROUP_LIMIT = 8;
export const LORE_LIMIT = 5;

const HEADINGS: Record<SearchType, string> = {
  item: "Items", npc: "NPCs", quest: "Quests", object: "Objects", zone: "Zones", lore: "Lore archive", tool: "Tools",
};
const ORDER: SearchType[] = ["item", "npc", "quest", "object", "zone", "lore", "tool"];

/** 0 exact, 1 starts with, 2 contains, null no match; both sides lowercase. */
function rank(name: string, q: string): number | null {
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  return name.includes(q) ? 2 : null;
}

/** The best matches of `entries` (exact name first, then prefix, then contains, then alphabetical), at most `limit`. */
function byName<T extends { name: string }>(entries: Iterable<T>, q: string, limit: number): { entry: T; exact: boolean }[] {
  const hits: { entry: T; r: number; n: string }[] = [];
  for (const entry of entries) {
    const n = entry.name.toLowerCase();
    const r = rank(n, q);
    if (r !== null) hits.push({ entry, r, n });
  }
  return hits.sort((a, b) => a.r - b.r || a.n.localeCompare(b.n)).slice(0, limit).map((h) => ({ entry: h.entry, exact: h.r === 0 }));
}

/** An id typed whole ("1234", "#1234"): the digits, else null. */
export function exactId(q: string): number | null {
  const m = q.match(/^#?([1-9]\d{0,8})$/);
  return m ? Number(m[1]) : null;
}

function agreed(kind: "item" | "npc" | "quest", names: Map<number, string>, q: string, id: number | null): SearchResult[] {
  const out: SearchResult[] = [];
  if (id !== null) out.push({ label: names.get(id) ?? `${kind === "npc" ? "NPC" : kind === "item" ? "Item" : "Quest"} ${id}`, href: entityHref(kind, id), note: `id ${id}`, exact: true });
  const rows = byName([...names].map(([n, name]) => ({ id: n, name })), q, GROUP_LIMIT);
  for (const { entry, exact } of rows) {
    if (entry.id === id) continue;
    out.push({ label: entry.name, href: entityHref(kind, entry.id), note: `id ${entry.id}`, exact });
  }
  return out.slice(0, GROUP_LIMIT);
}

/**
 * Everything the site knows by this name or id, grouped by type. Names are the ones players agree on (the
 * database pages' own rule), zones are the released ones on the map, lore comes from the archive, tools from
 * the tool list. A group with an exact id or name match comes first; an empty group is left out.
 */
export async function siteSearch(raw: string): Promise<SearchGroup[]> {
  const text = raw.trim().slice(0, MAX_QUERY);
  const q = text.toLowerCase();
  if (!q) return [];
  const id = exactId(q);
  const found = new Map<SearchType, SearchResult[]>();

  const names = await loadNames();
  found.set("item", agreed("item", names.items, q, id));
  found.set("npc", agreed("npc", names.npcs, q, id));
  found.set("quest", agreed("quest", names.quests, q, id));

  // Objects have no names in uploads yet: an id that has public loot observations is the only way to one.
  if (id !== null) {
    const facts = await loadObjectFacts();
    if (!facts.unreachable && objectList(facts).some((o) => o.objectId === id)) {
      found.set("object", [{ label: `Object ${id}`, href: entityHref("object", id), note: `id ${id}`, exact: true }]);
    }
  }

  found.set("zone", byName(WORLD_MAP.zones.map((z) => ({ id: z.uiMapId, name: z.name })), q, GROUP_LIMIT)
    .map(({ entry, exact }) => ({ label: entry.name, href: zoneHref(entry.id, entry.name), note: "zone", exact })));

  const lore = searchLore(text, 1);
  if (lore !== UNAVAILABLE) {
    found.set("lore", lore.hits.slice(0, LORE_LIMIT).map((h) => ({ label: h.name, href: `/lore/${loreSlug(h)}`, note: h.snippet, exact: h.name.toLowerCase() === q })));
  }

  found.set("tool", tools.flatMap((t) => {
    const hay = [t.title, t.shortTitle, ...t.keywords].map((s) => s.toLowerCase());
    const r = rank(t.title.toLowerCase(), q) ?? (hay.some((s) => s.includes(q)) ? 2 : null);
    return r === null ? [] : [{ label: t.title, href: toolHref(t), note: t.tagline, exact: r === 0 }];
  }).sort((a, b) => Number(b.exact) - Number(a.exact)));

  return ORDER
    .map((type) => ({ type, heading: HEADINGS[type], results: found.get(type) ?? [] }))
    .filter((g) => g.results.length > 0)
    // Stable: groups with an exact hit move up, the rest keep their order.
    .map((g, i) => ({ g, i, exact: g.results.some((r) => r.exact) }))
    .sort((a, b) => Number(b.exact) - Number(a.exact) || a.i - b.i)
    .map(({ g }) => g);
}
