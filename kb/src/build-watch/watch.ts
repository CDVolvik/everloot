/**
 * Build watch: notice a new game build, regenerate the committed game data, and prepare what a pull
 * request needs (changed files, a changelog entry, a body). It never touches git or GitHub's write
 * side; the workflow does that with the plan this produces. See docs/BUILD_WATCH.md.
 *
 * Everything outside this file's decisions is injected (`WatchDeps`), so tests run on fixtures.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { parseVersions, type VersionRow } from "../builds.js";
import { RaidBuffTable } from "../raid-buffs.js";
import type { BuildStamp, CatalogIndex, ClassCatalog } from "../talents/catalog.js";
import { buildChangeEntry } from "./diff.js";
import type { ChangeEntry } from "./changes.js";
import {
  GameDataManifest, loadBaselineBefore, readCommitted, saveBaseline, toCommitted, writeChangeEntry, writeCommitted,
} from "./game-data.js";
import { branchFor, decide, olderOpen, titleFor, type Action, type PrRef } from "./plan.js";
import { prBody, terminalSummary } from "./render.js";

export const PRODUCT_ID = /^[a-z0-9_]+$/;

export const WatchConfig = z.object({
  region: z.string().regex(/^[a-z]{2}$/).default("us"),
  products: z.array(z.object({
    product: z.string().regex(PRODUCT_ID),
    label: z.string(),
    /** True once players can play the product. Everything from a product that is not live is a spoiler. */
    live: z.boolean(),
  })).min(1),
});
export type WatchConfig = z.infer<typeof WatchConfig>;

export interface Extracted {
  build: BuildStamp;
  classes: ClassCatalog[];
  index: CatalogIndex;
  raidBuffs: RaidBuffTable;
  encryptedTables: { table: string; blocks: number }[];
  warnings: string[];
}

export interface WatchDeps {
  /** The version service's table for a product (see builds.ts). */
  fetchVersions(product: string): Promise<string>;
  /** Every pull request whose branch starts with `game-build/`, any state. */
  listPrs(): Promise<PrRef[]>;
  extract(product: string): Promise<Extracted>;
  now(): Date;
}

export interface WatchOptions {
  config: WatchConfig;
  /** Committed game data (read for the comparison; written unless dry run). */
  gameDataDir: string;
  /** Earlier raid buff tables, kept out of git. */
  baselineDir: string;
  /** Plan, pull request bodies and dry-run files go here. */
  outDir: string;
  dryRun: boolean;
  /** Only look: decide per product, extract nothing. */
  checkOnly: boolean;
  /** Reopen a build whose pull request was closed without merging. */
  redo: boolean;
  runUrl?: string;
}

export interface ProductResult {
  product: string;
  action: Action["kind"];
  pr?: number;
  version?: string;
  buildId?: number;
  branch?: string;
  title?: string;
  /** Files to commit, relative to the repository root when gameDataDir is `game-data`. */
  paths: string[];
  bodyFile?: string;
  summary?: string;
  error?: string;
}

const VERSION = /^\d+(\.\d+){2,3}$/;

/** The first region row: Blizzard ships one build to every region at once, and the registry already tracks the others. */
function latestRow(text: string): VersionRow {
  const { rows } = parseVersions(text);
  const row = rows.find((r) => r.region === "us") ?? rows[0];
  if (!row) throw new Error("the version service listed no build");
  if (!VERSION.test(row.version)) throw new Error(`the version service gave an odd version name: ${row.version.slice(0, 40)}`);
  return row;
}

export async function runWatch(opts: WatchOptions, deps: WatchDeps): Promise<ProductResult[]> {
  const prs = await deps.listPrs();
  const results: ProductResult[] = [];
  for (const cfg of opts.config.products) {
    try {
      results.push(await watchProduct(cfg, prs, opts, deps));
    } catch (err) {
      results.push({ product: cfg.product, action: "up-to-date", paths: [], error: err instanceof Error ? err.message : String(err) });
    }
  }
  mkdirSync(opts.outDir, { recursive: true });
  writeFileSync(join(opts.outDir, "plan.json"), `${JSON.stringify(results, null, 2)}\n`);
  return results;
}

async function watchProduct(cfg: WatchConfig["products"][number], prs: PrRef[], opts: WatchOptions, deps: WatchDeps): Promise<ProductResult> {
  const row = latestRow(await deps.fetchVersions(cfg.product));
  const committed = readCommitted(opts.gameDataDir, cfg.product);
  const ident = (b: { buildConfig: string; buildId: number }) => ({ buildConfig: b.buildConfig, buildId: b.buildId });
  const first = decide(cfg.product, committed && ident(committed.manifest.build), ident(row), prs, { redo: opts.redo });
  const base = { product: cfg.product, version: row.version, buildId: row.buildId, paths: [] as string[] };
  if (first.kind !== "create" && first.kind !== "update") return { ...base, action: first.kind, ...("number" in first ? { pr: first.number } : {}) };
  if (opts.checkOnly) return { ...base, action: first.kind, ...("number" in first ? { pr: first.number } : {}) };

  const got = await deps.extract(cfg.product);
  // The CDN can be a build ahead of the version service. Trust the files we actually read.
  const build = got.build;
  const action = build.buildConfig === row.buildConfig ? first : decide(cfg.product, committed && ident(committed.manifest.build), ident(build), prs, { redo: opts.redo });
  if (action.kind !== "create" && action.kind !== "update") {
    return { ...base, version: build.version, buildId: build.buildId, action: action.kind, ...("number" in action ? { pr: action.number } : {}) };
  }

  const classes = got.classes.map(toCommitted).sort((a, b) => a.classId - b.classId);
  const manifest = GameDataManifest.parse({
    schema: "everloot.game-data/1",
    label: got.index.label,
    build,
    classes: got.index.classes.map((c) => ({ classId: c.classId, className: c.className, file: c.file })).sort((a, b) => a.classId - b.classId),
    tables: got.index.tables,
    warnings: got.index.warnings,
  });
  const baseline = loadBaselineBefore(opts.baselineDir, cfg.product, build.buildId);
  const entry: ChangeEntry = buildChangeEntry({
    product: cfg.product,
    live: cfg.live,
    detectedAt: deps.now().toISOString(),
    build: { version: build.version, buildId: build.buildId, buildConfig: build.buildConfig },
    manifest,
    classes,
    raidBuffs: got.raidBuffs,
    committed,
    raidBaseline: baseline ? RaidBuffTable.parse(baseline.table) : null,
    encryptedTables: got.encryptedTables,
    warnings: got.warnings,
  });

  const branch = branchFor(cfg.product, build);
  const body = prBody(entry, {
    supersedes: olderOpen(cfg.product, build, prs),
    runUrl: opts.runUrl,
    classes: classes.length,
    nodes: classes.reduce((n, c) => n + c.trees.reduce((m, t) => m + t.nodes.length, 0), 0),
  });
  mkdirSync(join(opts.outDir, cfg.product), { recursive: true });
  const bodyFile = join(opts.outDir, cfg.product, "pr-body.md");
  writeFileSync(bodyFile, `${body}\n`);

  // A dry run writes the files it would commit into the out directory instead of the repository.
  const root = opts.dryRun ? join(opts.outDir, "dry-run", "game-data") : opts.gameDataDir;
  const paths = [...writeCommitted(root, cfg.product, manifest, classes), writeChangeEntry(root, entry)];
  if (!opts.dryRun) saveBaseline(opts.baselineDir, cfg.product, build.buildId, got.raidBuffs);

  return {
    product: cfg.product,
    action: action.kind,
    ...("number" in action ? { pr: action.number } : {}),
    version: build.version,
    buildId: build.buildId,
    branch,
    title: titleFor(build.version),
    paths,
    bodyFile,
    summary: terminalSummary(entry),
  };
}
