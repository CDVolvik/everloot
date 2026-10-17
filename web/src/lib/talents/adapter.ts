import { z } from "zod";
import type { TalentCatalog, TalentNode } from "./types";

// Turns a catalog from either source into the shape the calculator reads, and refuses one that is
// broken. Sources:
//   - src/data/talents/*.json, from Talents Forever's export (already in this shape), and
//   - the client extract's kb/src/talents/catalog.ts, which may give nodes as a list or as an object
//     keyed by id, a position as row/col or x/y, `max` for `maxRanks`, and prerequisites as a list of
//     node ids or as edges.
// Whatever the extract settles on, this is the only file that should need to change.

const entry = z.object({
  definitionId: z.number().int().nullable().optional(),
  spellId: z.number().int().nullable().optional(),
  name: z.string().min(1),
});

const rawNode = z.object({
  id: z.number().int().optional(),
  treeId: z.number().int().optional(),
  tree: z.number().int().optional(),
  row: z.number().int().optional(),
  col: z.number().int().optional(),
  x: z.number().int().optional(),
  y: z.number().int().optional(),
  maxRanks: z.number().int().min(1).optional(),
  max: z.number().int().min(1).optional(),
  kind: z.enum(["single", "choice"]).optional(),
  entries: z.array(entry).min(1),
  prereqs: z.array(z.number().int()).optional(),
  unlock: z.object({ pointsInTree: z.number().int().min(0).optional(), pointsTotal: z.number().int().min(0).optional() }).optional(),
});

const rawCatalog = z.object({
  classId: z.number().int(),
  classSlug: z.string().optional(),
  className: z.string().optional(),
  specId: z.number().int(),
  build: z.string().min(1),
  trees: z.array(z.object({ id: z.number().int(), name: z.string().min(1) })).min(1),
  nodes: z.union([z.array(rawNode), z.record(z.string(), rawNode)]),
  edges: z.array(z.object({ from: z.number().int(), to: z.number().int() })).optional(),
  source: z.custom<TalentCatalog["source"]>().optional(),
  rules: z.custom<TalentCatalog["rules"]>().optional(),
});

const DEFAULT_RULES: TalentCatalog["rules"] = {
  firstPointLevel: 10,
  maxLevel: 60,
  dualSpecLevel: 40,
  status: "unconfirmed",
  note: "Assumed: one point per level from level 10, a second talent set at level 40.",
};

const DEFAULT_SOURCE: TalentCatalog["source"] = {
  name: "Everloot client extract",
  url: "https://github.com/CDVolvik/everloot",
  licence: "Blizzard game data, not under our licence",
  licenceUrl: "https://github.com/CDVolvik/everloot/blob/main/docs/DATA_POLICY.md",
  retrieved: "",
  kind: "read from the game files",
};

export class CatalogError extends Error {}

export function normalizeCatalog(input: unknown): TalentCatalog {
  const parsed = rawCatalog.safeParse(input);
  if (!parsed.success) throw new CatalogError(`Talent catalog is not valid: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  const raw = parsed.data;
  const list = Array.isArray(raw.nodes) ? raw.nodes.map((n) => ({ key: n.id, n })) : Object.entries(raw.nodes).map(([k, n]) => ({ key: n.id ?? Number(k), n }));
  const hasZeroX = list.some(({ n }) => n.x === 0);
  const hasZeroY = list.some(({ n }) => n.y === 0);
  const treeIds = new Set(raw.trees.map((t) => t.id));
  const edgesTo = new Map<number, number[]>();
  for (const e of raw.edges ?? []) edgesTo.set(e.to, [...(edgesTo.get(e.to) ?? []), e.from]);

  const nodes: TalentNode[] = list.map(({ key, n }) => {
    if (!Number.isInteger(key)) throw new CatalogError("Talent catalog has a node without an id.");
    const treeId = n.treeId ?? n.tree;
    const row = n.row ?? (n.y === undefined ? undefined : n.y + (hasZeroY ? 1 : 0));
    const col = n.col ?? (n.x === undefined ? undefined : n.x + (hasZeroX ? 1 : 0));
    if (treeId === undefined || !treeIds.has(treeId)) throw new CatalogError(`Node ${key} is in no known tree.`);
    if (row === undefined || col === undefined) throw new CatalogError(`Node ${key} has no position.`);
    const kind = n.kind ?? (n.entries.length > 1 ? "choice" : "single");
    return {
      id: key as number,
      treeId,
      row,
      col,
      maxRanks: n.maxRanks ?? n.max ?? 1,
      kind,
      entries: n.entries.map((e) => ({ definitionId: e.definitionId ?? null, spellId: e.spellId ?? null, name: e.name })),
      prereqs: [...new Set([...(n.prereqs ?? []), ...(edgesTo.get(key as number) ?? [])])],
      ...(n.unlock && (n.unlock.pointsInTree || n.unlock.pointsTotal) ? { unlock: n.unlock } : {}),
    };
  });

  const ids = new Set(nodes.map((n) => n.id));
  if (ids.size !== nodes.length) throw new CatalogError("Talent catalog has a repeated node id.");
  for (const n of nodes) {
    for (const p of n.prereqs) if (!ids.has(p)) throw new CatalogError(`Node ${n.id} needs ${p}, which is not in the catalog.`);
    if (n.kind === "choice" && n.entries.length < 2) throw new CatalogError(`Choice node ${n.id} has fewer than two entries.`);
  }

  nodes.sort((a, b) => a.treeId - b.treeId || a.row - b.row || a.col - b.col);
  return {
    classId: raw.classId,
    classSlug: raw.classSlug ?? String(raw.classId),
    className: raw.className ?? raw.classSlug ?? String(raw.classId),
    specId: raw.specId,
    build: raw.build,
    source: raw.source ?? DEFAULT_SOURCE,
    rules: raw.rules ?? DEFAULT_RULES,
    trees: raw.trees,
    nodes,
  };
}
