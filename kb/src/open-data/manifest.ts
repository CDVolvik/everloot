import { z } from "zod";

/**
 * `manifest.json` of the open data export: what the folder holds, when the data was current, the rule that
 * decided what is in it, and for each file how many rows it has out of how many things players reported.
 * Strict, so the writer cannot add a key the page and the README do not know about.
 */
export const OPEN_DATA_SCHEMA = "everloot.open-data/1";

export const OPEN_DATA_LAYERS = ["observed", "game-files"] as const;
export type OpenDataLayer = (typeof OPEN_DATA_LAYERS)[number];

const count = z.number().int().nonnegative();

export const ManifestFile = z.object({
  /** Path inside the export folder, for example `observed/npcs.ndjson`. */
  path: z.string(),
  layer: z.enum(OPEN_DATA_LAYERS),
  dataset: z.string(),
  about: z.string(),
  /** The JSON Schema of one row, inside the same folder. */
  schema: z.string(),
  rows: count,
  /** The denominator: how many of the thing the rows are chosen from. Null when the layer has no count of its own. */
  candidates: count.nullable(),
  /** What `candidates` counts, in words, so a share is never a bare number. */
  candidatesAre: z.string(),
  bytes: count,
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
export type ManifestFile = z.infer<typeof ManifestFile>;

export const OpenDataManifest = z.object({
  schema: z.literal(OPEN_DATA_SCHEMA),
  /** When this export was made. */
  generatedAt: z.string().datetime({ offset: true }),
  /** When the uploads behind the observed files were current; null when the source did not say. */
  dataAsOf: z.string().datetime({ offset: true }).nullable(),
  method: z.object({
    /** Installs that must agree on a fact before it is a row. */
    agreement: z.number().int().min(3),
    text: z.string(),
  }).strict(),
  source: z.object({
    /** Public records read, of the kinds the export uses. */
    records: count,
    /** Distinct installs behind them, after Polestar Recorder installs that share a character or an address count once. */
    installs: count,
    kinds: z.array(z.string()),
  }).strict(),
  gameFiles: z.object({
    version: z.string(),
    extractedAt: z.string(),
    label: z.string(),
  }).strict(),
  licence: z.object({
    observed: z.object({ folder: z.literal("observed/"), name: z.string(), url: z.string(), credit: z.string() }).strict(),
    gameFiles: z.object({ folder: z.literal("game-files/"), name: z.string(), credit: z.string() }).strict(),
  }).strict(),
  /** What the files never hold, by rule. */
  excluded: z.array(z.string()),
  /** What a person might expect that this version does not carry yet. */
  notYet: z.array(z.string()),
  /** How to check a count. */
  verify: z.array(z.string()),
  files: z.array(ManifestFile),
}).strict();
export type OpenDataManifest = z.infer<typeof OpenDataManifest>;
