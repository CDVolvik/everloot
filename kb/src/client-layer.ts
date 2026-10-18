/**
 * The client layer: what Everloot derives from one build's game files for the database pages, in one
 * build-stamped file. It is Blizzard's data, labelled "found in game files, unconfirmed", kept apart
 * from the CC BY-SA release, and committed as a game-data file like the map layer (docs/DATA_POLICY.md,
 * "The client layer"). The build watch regenerates it with every new build.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { GAME_DATA_CREDIT } from "@everloot/protocol";
import { readClientMeta, readClientRows, readClientTables } from "./client-snapshot.js";
import { CLIENT_LABEL, clientEdges, RELS, type Edge, type EdgeKind, type Rel } from "./edges.js";
import { buildTaxonomy, type Taxonomy } from "./item-taxonomy.js";

export const LAYER_SCHEMA = "everloot.client-layer/2";

const KINDS = ["item", "spell", "npc", "object", "quest", "zone", "item_set", "icon", "skill"] as const satisfies readonly EdgeKind[];

export const ClientLayer = z.object({
  schema: z.literal(LAYER_SCHEMA),
  label: z.literal(CLIENT_LABEL),
  credit: z.string(),
  build: z.object({
    product: z.string(), buildId: z.number().int(), version: z.string(), buildConfig: z.string(),
    definitions: z.string().nullable(), extractedAt: z.string(),
  }),
  counts: z.record(z.string(), z.number().int()),
  /** [fromKind, fromId, rel, toKind, toId]; every row shares the build above. */
  edges: z.array(z.tuple([z.enum(KINDS), z.number().int(), z.enum(RELS), z.enum(KINDS), z.number().int()])),
  /** Item classes and subclasses with the client's English names, the slugs made from them, and item counts. */
  categories: z.object({
    classes: z.array(z.object({ id: z.number().int(), name: z.string(), label: z.string(), slug: z.string(), items: z.number().int() })),
    subclasses: z.array(z.object({ classId: z.number().int(), id: z.number().int(), name: z.string().nullable(), slug: z.string(), items: z.number().int() })),
    /** The professions the `in_skill_line` relations point at, with the client's names (Blacksmithing, Cooking). */
    skills: z.array(z.object({ id: z.number().int(), name: z.string() })),
  }),
  /** [itemId, classId, subclassId, inventoryType, quality or null], one per item in `Item`. */
  items: z.array(z.tuple([z.number().int(), z.number().int(), z.number().int(), z.number().int(), z.number().int().nullable()])),
});
export type ClientLayer = z.infer<typeof ClientLayer>;

export function buildClientLayer(snapshotPath: string): ClientLayer {
  const meta = readClientMeta(snapshotPath);
  const present = new Set(readClientTables(snapshotPath));
  const get = (t: string) => (present.has(t) ? readClientRows(snapshotPath, t) : undefined);
  const edges = clientEdges(get, meta);
  const taxonomy = buildTaxonomy(get);
  const counts: Record<string, number> = {};
  for (const e of edges) counts[e.rel] = (counts[e.rel] ?? 0) + 1;
  return ClientLayer.parse({
    schema: LAYER_SCHEMA, label: CLIENT_LABEL, credit: GAME_DATA_CREDIT,
    build: { product: meta.product, buildId: meta.buildId, version: meta.version, buildConfig: meta.buildConfig, definitions: meta.definitions, extractedAt: meta.extractedAt },
    counts,
    edges: edges.map((e) => [e.fromKind, e.fromId, e.rel, e.toKind, e.toId]),
    categories: { classes: taxonomy.classes, subclasses: taxonomy.subclasses, skills: skillsOf(get, edges) },
    items: taxonomy.items,
  });
}

/** JSON with one edge, category and item per line, so a new build's file reads as a line diff in review. */
export function serializeClientLayer(layer: ClientLayer): string {
  const { edges, categories, items, ...head } = layer;
  const top = JSON.stringify(head, null, 1).replace(/\n}$/, "");
  const rows = (list: unknown[]) => list.map((r) => `  ${JSON.stringify(r)}`).join(",\n");
  return `${top},\n "edges": [\n${rows(edges)}\n ],\n "categories": {\n "classes": [\n${rows(categories.classes)}\n ],\n "subclasses": [\n${rows(categories.subclasses)}\n ],\n "skills": [\n${rows(categories.skills)}\n ]\n },\n "items": [\n${rows(items)}\n ]\n}\n`;
}

/** Writes the layer to `path` (the site's copy is web/src/data/game-data/client-layer.json). */
export function writeClientLayer(snapshotPath: string, path: string): ClientLayer {
  const layer = buildClientLayer(snapshotPath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeClientLayer(layer));
  return layer;
}

export function readLayerEdges(layer: ClientLayer): Edge[] {
  return layer.edges.map(([fromKind, fromId, rel, toKind, toId]) => ({
    fromKind, fromId, rel: rel as Rel, toKind, toId, evidence: "client", build: layer.build.version, installs: null,
    firstSeen: layer.build.extractedAt, lastSeen: layer.build.extractedAt,
  }));
}

/** The profession names the relations point at, from SkillLine. */
function skillsOf(get: (t: string) => Map<number, Record<string, unknown>> | undefined, edges: Edge[]): { id: number; name: string }[] {
  const used = new Set(edges.filter((e) => e.rel === "in_skill_line").map((e) => e.toId));
  const out: { id: number; name: string }[] = [];
  for (const r of get("SkillLine")?.values() ?? []) {
    const name = typeof r.DisplayName_lang === "string" ? r.DisplayName_lang.trim() : "";
    if (used.has(Number(r.ID)) && name) out.push({ id: Number(r.ID), name });
  }
  return out.sort((a, b) => a.id - b.id);
}

/** Profession id -> name. */
export function readLayerSkills(layer: ClientLayer): Map<number, string> {
  return new Map(layer.categories.skills.map((s) => [s.id, s.name]));
}

export function readLayerTaxonomy(layer: ClientLayer): Taxonomy {
  return { classes: layer.categories.classes, subclasses: layer.categories.subclasses, items: layer.items };
}
