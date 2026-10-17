/**
 * The talent catalog: one JSON document per class, read from the trait tables of one game build.
 * This file is the contract with the talent calculator, so it stays small. A change to the shape bumps
 * `SCHEMA`. How each field is derived, and what is not confirmed, is in docs/TALENT_CATALOG.md.
 *
 * The data is Blizzard's, read from files the launcher downloads. It is not published, and it never
 * goes into the CC BY-SA release.
 */
import { z } from "zod";

export const SCHEMA = "everloot.talent-catalog/1";
/** Every record from the game files carries this label (docs/DATA_POLICY.md). */
export const LABEL = "found in game files, unconfirmed";

export const BuildStamp = z.object({
  product: z.string(),
  buildId: z.number().int(),
  version: z.string(),
  buildConfig: z.string(),
  /** WoWDBDefs commit the column names came from; null when it was not recorded. */
  definitions: z.string().nullable(),
  extractedAt: z.string(),
});
export type BuildStamp = z.infer<typeof BuildStamp>;

export const Entry = z.object({
  definitionId: z.number().int(),
  spellId: z.number().int(),
  /** Spell name from the client; null when the spell's name sits in an encrypted block we skip. */
  name: z.string().nullable(),
  maxRanks: z.number().int(),
  /** SpellMisc.SpellIconFileDataID of the shown spell; null when the spell has none. Only the id is recorded, never the image. */
  iconFileId: z.number().int().nullable(),
  /** Whether that file is in the build's root listing and not flagged encrypted. "unchecked": the snapshot has no file status. */
  iconFile: z.enum(["present", "encrypted", "absent", "unchecked"]),
  /** Spell text exactly as the client stores it, `$` tokens (`$s1`, `$d`, `$a1`...) kept as they are. */
  description: z.string().nullable(),
  auraDescription: z.string().nullable(),
  /** The values the tokens refer to: `$s1` is effects[0] basePoints, `$d` is durationMs, `$a1` is radiusYards, `$t1` periodMs, `$x1` chainTargets. */
  effects: z.array(z.object({
    index: z.number().int(),
    basePoints: z.number(),
    dieSides: z.number().int(),
    periodMs: z.number().int(),
    chainTargets: z.number().int(),
    miscValue: z.number().int(),
    radiusYards: z.number().nullable(),
  })),
  /** Duration from SpellDuration, in milliseconds as listed; null when the spell has none. */
  durationMs: z.number().int().nullable(),
});

export const Prereq = z.object({
  nodeId: z.number().int(),
  /** "any": buying this node is enough to open the node. "all": this node must be bought, as must every other "all" node. */
  rule: z.enum(["any", "all"]),
});

export const Unlock = z.object({
  /** Points spent in the same talent tree before this node can be bought (the row gate). Absent: no gate. */
  pointsInTree: z.number().int().optional(),
  /** The node needs `ranks` bought in another node. Rare: one such node in build 70450. */
  ranksInNode: z.object({ nodeId: z.number().int(), ranks: z.number().int() }).optional(),
});

export const Node = z.object({
  id: z.number().int(),
  /** Position as the client stores it. */
  x: z.number().int(),
  y: z.number().int(),
  /** Rank of y and x among the distinct positions in this tree, from 0. Derived, for laying out a grid. */
  row: z.number().int(),
  col: z.number().int(),
  /** single: one talent. tiered: several entries bought in order. choice: pick one of the entries. */
  kind: z.enum(["single", "tiered", "choice"]),
  /** Total ranks that can be bought: single, the entry's; tiered, the sum; choice, the largest. */
  maxRanks: z.number().int(),
  entries: z.array(Entry),
  prereqs: z.array(Prereq),
  unlock: Unlock,
});
export type Node = z.infer<typeof Node>;

export const Edge = z.object({
  from: z.number().int(),
  to: z.number().int(),
  type: z.enum(["visual", "sufficient", "required", "exclusive"]),
});

export const Tree = z.object({
  /** Id of the node group the client lists as this talent tree. */
  id: z.number().int(),
  name: z.string().nullable(),
  skillLineId: z.number().int(),
  /** Left to right order in the client. */
  order: z.number().int(),
  nodes: z.array(Node),
  edges: z.array(Edge),
});
export type Tree = z.infer<typeof Tree>;

export const ClassCatalog = z.object({
  schema: z.literal(SCHEMA),
  label: z.literal(LABEL),
  build: BuildStamp,
  classId: z.number().int(),
  className: z.string().nullable(),
  /** ChrSpecialization id. Forever has no specializations; the client keeps one id per class. */
  specId: z.number().int().nullable(),
  /** The class's trait tree in the client; its three talent trees are `trees`. */
  traitTreeId: z.number().int(),
  /** Talent points: the level each point arrives at, one per entry. Empty when the build lists none. */
  pointLevels: z.array(z.number().int()),
  trees: z.array(Tree),
  /** Things the extraction could not resolve for this class. */
  warnings: z.array(z.string()),
});
export type ClassCatalog = z.infer<typeof ClassCatalog>;

export const CatalogIndex = z.object({
  schema: z.literal(SCHEMA),
  label: z.literal(LABEL),
  build: BuildStamp,
  classes: z.array(z.object({ classId: z.number().int(), className: z.string().nullable(), file: z.string(), trees: z.number().int(), nodes: z.number().int() })),
  /** Trait trees in the build that are not a class talent tree (professions, Legacy, and so on). */
  otherTraitTrees: z.array(z.number().int()),
  /** Tables the catalog read, with row counts and encrypted blocks skipped (null when no manifest sat beside the snapshot). */
  tables: z.array(z.object({ table: z.string(), rows: z.number().int(), encryptedBlocks: z.number().int().nullable() })),
  warnings: z.array(z.string()),
});
export type CatalogIndex = z.infer<typeof CatalogIndex>;
