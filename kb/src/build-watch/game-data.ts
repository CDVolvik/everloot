/**
 * The committed game-data files: what the repository keeps of a product's current build.
 *
 *   game-data/<product>/manifest.json        build stamp, class list, encrypted block counts
 *   game-data/<product>/talents/<class>.json the talent catalog without tooltip text
 *   game-data/changes/<product>-<buildId>.json  one changelog entry per build (see changes.ts)
 *
 * docs/DATA_POLICY.md allows the talent catalog in git: node ids, positions, ranks, gates,
 * prerequisites, spell ids, talent names and the build stamp. Tooltip text and icon files stay out, so
 * `toCommitted` drops the text and keeps only a short hash, which is enough to see that a tooltip changed.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { BuildStamp, ClassCatalog, Edge, Entry, LABEL, Node, Tree } from "../talents/catalog.js";
import { changeFileName, type ChangeEntry } from "./changes.js";

export const GAME_DATA_SCHEMA = "everloot.game-data/1";
export const COMMITTED_CATALOG_SCHEMA = "everloot.game-data.talent-catalog/1";

const CommittedEntry = Entry.omit({ description: true, auraDescription: true }).extend({
  /** First 12 hex digits of a sha256 over the tooltip texts; null when the spell has none. */
  textHash: z.string().nullable(),
});
const CommittedNode = Node.extend({ entries: z.array(CommittedEntry) });
const CommittedTree = Tree.extend({ nodes: z.array(CommittedNode), edges: z.array(Edge) });
export const CommittedClass = ClassCatalog.extend({ schema: z.literal(COMMITTED_CATALOG_SCHEMA), trees: z.array(CommittedTree) });
export type CommittedClass = z.infer<typeof CommittedClass>;

export const GameDataManifest = z.object({
  schema: z.literal(GAME_DATA_SCHEMA),
  label: z.literal(LABEL),
  build: BuildStamp,
  classes: z.array(z.object({ classId: z.number().int(), className: z.string().nullable(), file: z.string() })),
  /** Tables read for the files, with encrypted blocks skipped (null: not recorded). */
  tables: z.array(z.object({ table: z.string(), rows: z.number().int(), encryptedBlocks: z.number().int().nullable() })),
  warnings: z.array(z.string()),
});
export type GameDataManifest = z.infer<typeof GameDataManifest>;

export const textHash = (...texts: (string | null)[]): string | null =>
  texts.every((t) => t === null) ? null : createHash("sha256").update(texts.map((t) => t ?? "").join("\u0000")).digest("hex").slice(0, 12);

/** The catalog as it is committed: tooltip text replaced by a hash. */
export function toCommitted(catalog: ClassCatalog): CommittedClass {
  return CommittedClass.parse({
    ...catalog,
    schema: COMMITTED_CATALOG_SCHEMA,
    trees: catalog.trees.map((t) => ({
      ...t,
      nodes: t.nodes.map((n) => ({
        ...n,
        entries: n.entries.map(({ description, auraDescription, ...rest }) => ({ ...rest, textHash: textHash(description, auraDescription) })),
      })),
    })),
  });
}

const pretty = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
export const productDir = (root: string, product: string) => join(root, product);

export interface Committed { manifest: GameDataManifest; classes: CommittedClass[] }

/** What is committed for a product; null when nothing is yet. */
export function readCommitted(root: string, product: string): Committed | null {
  const dir = productDir(root, product);
  const path = join(dir, "manifest.json");
  if (!existsSync(path)) return null;
  const manifest = GameDataManifest.parse(JSON.parse(readFileSync(path, "utf8")));
  const classes = manifest.classes.map((c) => CommittedClass.parse(JSON.parse(readFileSync(join(dir, "talents", c.file), "utf8"))));
  return { manifest, classes };
}

/** Replaces the product's files. A class that left the build leaves no stale file behind. */
export function writeCommitted(root: string, product: string, manifest: GameDataManifest, classes: CommittedClass[]): string[] {
  const dir = productDir(root, product);
  rmSync(join(dir, "talents"), { recursive: true, force: true });
  mkdirSync(join(dir, "talents"), { recursive: true });
  const files = [join(dir, "manifest.json")];
  writeFileSync(files[0], pretty(GameDataManifest.parse(manifest)));
  for (const c of classes) {
    const file = manifest.classes.find((m) => m.classId === c.classId)!.file;
    const path = join(dir, "talents", file);
    writeFileSync(path, pretty(c));
    files.push(path);
  }
  return files;
}

export function writeChangeEntry(root: string, entry: ChangeEntry): string {
  const path = join(root, "changes", changeFileName(entry.product, entry.build.buildId));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, pretty(entry));
  return path;
}

/** The raid buff table of earlier builds is kept outside git (Actions cache), one file per build. */
const baselineFile = (dir: string, product: string, buildId: number) => join(dir, product, `${buildId}.json`);

export function saveBaseline(dir: string, product: string, buildId: number, table: unknown, keep = 4): void {
  const path = baselineFile(dir, product, buildId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, pretty(table));
  const ids = baselineIds(dir, product).sort((a, b) => b - a);
  for (const old of ids.slice(keep)) rmSync(baselineFile(dir, product, old), { force: true });
}

function baselineIds(dir: string, product: string): number[] {
  const d = join(dir, product);
  if (!existsSync(d)) return [];
  return readdirSync(d).map((f) => /^(\d+)\.json$/.exec(f)?.[1]).filter((n): n is string => !!n).map(Number);
}

/** The newest saved table from a build older than `buildId`; null when none. Re-running the same build finds the same one. */
export function loadBaselineBefore(dir: string, product: string, buildId: number): { buildId: number; table: unknown } | null {
  const id = baselineIds(dir, product).filter((n) => n < buildId).sort((a, b) => b - a)[0];
  return id === undefined ? null : { buildId: id, table: JSON.parse(readFileSync(baselineFile(dir, product, id), "utf8")) };
}
