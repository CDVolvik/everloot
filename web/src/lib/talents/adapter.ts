import { z } from "zod";
import type { TalentCatalog, TalentNode } from "./types";

// Turns one class file of our talent catalog (schema everloot.talent-catalog/1, written by
// `npm run kb -- client-catalog`, trimmed by scripts/trim-talent-catalog.mjs) into the shape the
// calculator reads, and refuses a file that is broken. Fields the calculator does not read, such as
// the spell text in a full catalog file, are ignored if present.

const entry = z.object({
  definitionId: z.number().int(),
  spellId: z.number().int(),
  name: z.string().nullable(),
  maxRanks: z.number().int().min(1),
});

const node = z.object({
  id: z.number().int(),
  row: z.number().int().min(0),
  col: z.number().int().min(0),
  kind: z.enum(["single", "tiered", "choice"]),
  maxRanks: z.number().int().min(1),
  entries: z.array(entry).min(1),
  prereqs: z.array(z.object({ nodeId: z.number().int(), rule: z.enum(["any", "all"]) })),
  unlock: z.object({
    // The row gate. The catalog may rename this field (spentRequired, with a scope); this file is
    // the only place that reads it, through `rowGate` below.
    pointsInTree: z.number().int().optional(),
    ranksInNode: z.object({ nodeId: z.number().int(), ranks: z.number().int() }).optional(),
  }),
});

const classCatalog = z.object({
  schema: z.literal("everloot.talent-catalog/1"),
  label: z.string(),
  build: z.object({ version: z.string().min(1) }),
  classId: z.number().int(),
  className: z.string().min(1),
  specId: z.number().int().nullable(),
  pointLevels: z.array(z.number().int()).min(1),
  trees: z.array(z.object({ id: z.number().int(), name: z.string().nullable(), order: z.number().int(), nodes: z.array(node) })).min(1),
});

const rowGate = (unlock: { pointsInTree?: number }): number | undefined => unlock.pointsInTree;

/** The level the beta notes give for the second talent set. Not in the game files we read. */
export const DUAL_SPEC_LEVEL = 40;

export class CatalogError extends Error {}

export function normalizeCatalog(input: unknown): TalentCatalog {
  const parsed = classCatalog.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new CatalogError(`Talent catalog is not valid: ${issue?.path.join(".") ?? ""} ${issue?.message ?? "unknown"}`);
  }
  const raw = parsed.data;
  const trees = [...raw.trees].sort((a, b) => a.order - b.order);
  const ids = new Set<number>();
  const nodes: TalentNode[] = [];

  for (const tree of trees) {
    for (const n of [...tree.nodes].sort((a, b) => a.row - b.row || a.col - b.col || a.id - b.id)) {
      if (ids.has(n.id)) throw new CatalogError(`Talent catalog has a repeated node id ${n.id}.`);
      ids.add(n.id);
      if (n.kind === "choice" && n.entries.length < 2) throw new CatalogError(`Choice node ${n.id} has fewer than two entries.`);
      const anyOf = n.prereqs.filter((p) => p.rule === "any").map((p) => p.nodeId);
      nodes.push({
        id: n.id,
        treeId: tree.id,
        row: n.row + 1,
        col: n.col + 1,
        maxRanks: n.maxRanks,
        kind: n.kind,
        entries: n.entries.map((e) => ({ definitionId: e.definitionId, spellId: e.spellId, name: e.name ?? `Talent ${e.spellId}`, maxRanks: e.maxRanks })),
        prereqs: n.prereqs.filter((p) => p.rule === "all").map((p) => p.nodeId),
        ...(anyOf.length > 0 ? { anyOf } : {}),
        ...(rowGate(n.unlock) || n.unlock.ranksInNode
          ? { unlock: { ...(rowGate(n.unlock) ? { pointsInTree: rowGate(n.unlock) } : {}), ...(n.unlock.ranksInNode ? { ranksInNode: n.unlock.ranksInNode } : {}) } }
          : {}),
      });
    }
  }
  for (const n of nodes) {
    for (const p of [...n.prereqs, ...(n.anyOf ?? []), ...(n.unlock?.ranksInNode ? [n.unlock.ranksInNode.nodeId] : [])]) {
      if (!ids.has(p)) throw new CatalogError(`Node ${n.id} needs ${p}, which is not in the catalog.`);
    }
  }

  const pointLevels = [...raw.pointLevels].sort((a, b) => a - b);
  return {
    classId: raw.classId,
    classSlug: raw.className.toLowerCase(),
    className: raw.className,
    specId: raw.specId ?? 0,
    build: raw.build.version,
    label: raw.label,
    rules: {
      firstPointLevel: pointLevels[0],
      maxLevel: pointLevels[pointLevels.length - 1],
      pointLevels,
      dualSpecLevel: DUAL_SPEC_LEVEL,
      status: "unconfirmed",
      note: "Points per level and row gates come from the game tables. Which points a gate counts is read as the points in the same tree. The second set at level 40 is from the beta notes.",
    },
    trees: trees.map((t) => ({ id: t.id, name: t.name ?? `Tree ${t.order + 1}` })),
    nodes,
  };
}
