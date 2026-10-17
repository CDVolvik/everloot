/**
 * Icons, tooltip text and talent-frame art for the talent catalog, read from the public client and
 * written to a local directory with a build-stamped manifest. The directory is uploaded to asset
 * storage by a maintainer (docs/ASSETS.md). It is never committed (docs/DATA_POLICY.md, "Blizzard's
 * icons, tooltip text and window frame").
 *
 * Only unencrypted files are read. A file with an encrypted block, or one that is not in the build, is
 * counted and left out. No key is loaded and no listfile: icon ids come from the spell tables and frame
 * pieces from the interface atlas tables (UiTextureAtlas*), all by file data id.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { TableSource } from "./client-extract.js";
import { readClientMeta, readClientRows, readClientTables } from "./client-snapshot.js";
import { resolveTooltip, type EffectFacts, type SpellFacts } from "./assets/tooltip.js";
import { buildTalentCatalog, type Rows, type TableReader } from "./talents/build-catalog.js";
import { LABEL, type BuildStamp } from "./talents/catalog.js";

export const ASSET_SCHEMA = "everloot.game-assets/1";

/** Atlas element names the talent window needs, by purpose. Which exist in a build is checked, not assumed. */
const SHAPES = ["circle", "square", "choice"] as const;
const NODE_STATES = ["gray", "green", "yellow", "locked", "shadow", "greenglow"] as const;
export const FRAME_ELEMENTS: string[] = [
  ...SHAPES.flatMap((s) => NODE_STATES.map((st) => `talents-node-${s}-${st}`)),
  ...["gray", "locked", "yellow"].flatMap((st) => [`talents-arrow-head-${st}`, `talents-arrow-line-${st}`]),
  "talents-gate",
];

/**
 * Our tree name -> the client's per-spec background. The Classic trees keep their Classic names, the
 * client's backgrounds are named for the modern specs, so a few are the nearest match, listed here and
 * in the manifest as such rather than hidden.
 */
export const BACKGROUND_FOR: Record<string, { element: string; nearest?: true }> = {
  "warrior:Arms": { element: "talents-background-warrior-arms" },
  "warrior:Fury": { element: "talents-background-warrior-fury" },
  "warrior:Protection": { element: "talents-background-warrior-protection" },
  "paladin:Holy": { element: "talents-background-paladin-holy" },
  "paladin:Protection": { element: "talents-background-paladin-protection" },
  "paladin:Retribution": { element: "talents-background-paladin-retribution" },
  "hunter:Beast Mastery": { element: "talents-background-hunter-beastmastery" },
  "hunter:Marksmanship": { element: "talents-background-hunter-marksmanship" },
  "hunter:Survival": { element: "talents-background-hunter-survival" },
  "rogue:Assassination": { element: "talents-background-rogue-assassination" },
  "rogue:Combat": { element: "talents-background-rogue-outlaw", nearest: true },
  "rogue:Subtlety": { element: "talents-background-rogue-subtlety" },
  "priest:Discipline": { element: "talents-background-priest-discipline" },
  "priest:Holy": { element: "talents-background-priest-holy" },
  "priest:Shadow Magic": { element: "talents-background-priest-shadow", nearest: true },
  "shaman:Elemental Combat": { element: "talents-background-shaman-elemental", nearest: true },
  "shaman:Enhancement": { element: "talents-background-shaman-enhancement" },
  "shaman:Restoration": { element: "talents-background-shaman-restoration" },
  "mage:Arcane": { element: "talents-background-mage-arcane" },
  "mage:Fire": { element: "talents-background-mage-fire" },
  "mage:Frost": { element: "talents-background-mage-frost" },
  "warlock:Affliction": { element: "talents-background-warlock-affliction" },
  "warlock:Demonology": { element: "talents-background-warlock-demonology" },
  "warlock:Destruction": { element: "talents-background-warlock-destruction" },
  "druid:Balance": { element: "talents-background-druid-balance" },
  "druid:Feral Combat": { element: "talents-background-druid-feral", nearest: true },
  "druid:Restoration": { element: "talents-background-druid-restoration" },
};

const File = z.object({ file: z.string(), width: z.number().int(), height: z.number().int(), bytes: z.number().int(), sha256: z.string() });
const Text = z.object({ text: z.string(), unresolved: z.array(z.string()) });

export const AssetManifest = z.object({
  schema: z.literal(ASSET_SCHEMA),
  label: z.literal(LABEL),
  build: z.object({ product: z.string(), buildId: z.number().int(), version: z.string(), buildConfig: z.string(), extractedAt: z.string() }),
  /** Talent entries by trait definition id. */
  spells: z.record(z.string(), z.object({
    spellId: z.number().int(),
    name: z.string().nullable(),
    /** Icon file name inside `icons`, or null when the icon was encrypted, absent or unreadable. */
    icon: z.string().nullable(),
    /** Passive spells get the square border, active ones the round one (SpellMisc attribute bit, not our guess). */
    passive: z.boolean().nullable(),
    description: Text.nullable(),
  })),
  icons: z.record(z.string(), File),
  frames: z.record(z.string(), File),
  /** "class:Tree name" -> frame element. `nearest`: the client has no background for that Classic tree, this is the closest. */
  backgrounds: z.record(z.string(), z.object({ element: z.string(), nearest: z.boolean() })),
  counts: z.object({
    iconsExtracted: z.number().int(), iconsEncrypted: z.number().int(), iconsAbsent: z.number().int(), iconsFailed: z.number().int(),
    framesExtracted: z.number().int(), framesEncrypted: z.number().int(), framesAbsent: z.number().int(), framesFailed: z.number().int(),
    tooltipsResolved: z.number().int(), tooltipsUnresolved: z.number().int(), tooltipsEmpty: z.number().int(),
  }),
  /** Frame elements the build does not have or that could not be read; the site falls back for these. */
  missingFrames: z.array(z.string()),
});
export type AssetManifest = z.infer<typeof AssetManifest>;

export interface ConvertJob { src: string; dst: string; crop?: [number, number, number, number] | null; max?: number | null }
export interface ConvertResult { dst: string; ok: boolean; width: number; height: number; error: string | null }
export type Converter = (jobs: ConvertJob[]) => Promise<ConvertResult[]>;

/**
 * Converts BLP to WebP with Pillow (scripts/blp_convert.py). Python must have Pillow installed. `-E` ignores
 * PYTHON* variables but, unlike `-I`, keeps the user's site-packages where Pillow usually is; the script's own
 * folder is the working directory and holds nothing but that script, and the downloaded files are only read as data.
 */
export const pillowConverter: Converter = async (jobs) => {
  if (!jobs.length) return [];
  // The script runs from its own folder, so every path it is given is absolute.
  const jobFile = resolve(dirname(jobs[0].src), "jobs.json");
  writeFileSync(jobFile, JSON.stringify(jobs.map((j) => ({ ...j, src: resolve(j.src), dst: resolve(j.dst) }))));
  const script = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "blp_convert.py");
  const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  const out = await new Promise<string>((resolve, reject) => {
    const child = spawn(python, ["-E", script, jobFile], { cwd: dirname(script), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => reject(new Error(`could not start ${python}: ${e.message}`)));
    child.on("close", (code) => (code === 0 ? resolve(stdout) : reject(new Error(`blp_convert.py exited ${code}: ${stderr.trim()}`))));
  });
  return out.split("\n").filter(Boolean).map((l) => JSON.parse(l) as ConvertResult);
};

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const text = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const list = (rows: Rows | undefined) => [...(rows?.values() ?? [])];
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/** SPELL_ATTR0_PASSIVE: bit 6 of the first SpellMisc attribute word. */
const ATTR_PASSIVE = 0x40;

export interface AssetRun {
  dir: string;
  manifest: AssetManifest;
  /** Plain-language lines for the console. */
  notes: string[];
}

interface Fetched { status: "ok" | "encrypted" | "absent" | "failed"; buffer?: Buffer }

/** Reads the tables from a snapshot file, then builds the assets. */
export async function buildClientAssets(opts: { snapshotPath: string; outDir: string; source: TableSource; convert?: Converter }): Promise<AssetRun> {
  const meta = readClientMeta(opts.snapshotPath);
  const present = new Set(readClientTables(opts.snapshotPath));
  const cache = new Map<string, Rows>();
  const get: TableReader = (table) => {
    if (!present.has(table)) return undefined;
    if (!cache.has(table)) cache.set(table, readClientRows(opts.snapshotPath, table));
    return cache.get(table);
  };
  const build: BuildStamp = { product: meta.product, buildId: meta.buildId, version: meta.version, buildConfig: meta.buildConfig, definitions: meta.definitions, extractedAt: meta.extractedAt };
  return buildAssetsFromTables({ get, build, outDir: opts.outDir, source: opts.source, convert: opts.convert });
}

export async function buildAssetsFromTables(opts: { get: TableReader; build: BuildStamp; outDir: string; source: TableSource; convert?: Converter }): Promise<AssetRun> {
  const { get, build, source } = opts;
  const meta = build;
  const convert = opts.convert ?? pillowConverter;
  if (!source.readFile) throw new Error("this source cannot read files");
  for (const t of ["UiTextureAtlas", "UiTextureAtlasElement", "UiTextureAtlasMember", "SpellMisc", "SpellEffect", "Spell", "TraitDefinition"]) {
    if (!get(t)) throw new Error(`the snapshot has no ${t} table; run \`client-extract --refresh\` first`);
  }
  const { classes } = buildTalentCatalog({ get, build, tables: [] });

  // Spell facts by id, from the tables, for tooltips.
  const radius = new Map(list(get("SpellRadius")).map((r) => [num(r.ID), num(r.Radius)]));
  const durations = new Map(list(get("SpellDuration")).map((r) => [num(r.ID), num(r.Duration)]));
  const misc = new Map(list(get("SpellMisc")).filter((r) => num(r.DifficultyID) === 0).map((r) => [num(r.SpellID), r]));
  const aura = new Map(list(get("SpellAuraOptions")).filter((r) => num(r.DifficultyID) === 0).map((r) => [num(r.SpellID), r]));
  const names = new Map(list(get("SpellName")).map((r) => [num(r.ID), text(r.Name_lang)]));
  const spellRows = new Map(list(get("Spell")).map((r) => [num(r.ID), r]));
  const effects = new Map<number, Record<string, unknown>[]>();
  for (const r of list(get("SpellEffect"))) {
    if (num(r.DifficultyID) !== 0) continue;
    const id = num(r.SpellID);
    effects.set(id, [...(effects.get(id) ?? []), r]);
  }
  const definitions = new Map(list(get("TraitDefinition")).map((r) => [num(r.ID), r]));
  const factsFor = (id: number): SpellFacts | undefined => {
    if (!effects.has(id) && !misc.has(id)) return undefined;
    const durationIndex = num(misc.get(id)?.DurationIndex);
    const eff: EffectFacts[] = (effects.get(id) ?? []).map((e) => ({
      index: num(e.EffectIndex),
      basePoints: typeof e.EffectBasePointsF === "number" ? e.EffectBasePointsF : num(e.EffectBasePoints),
      dieSides: num(e.EffectDieSides), periodMs: num(e.EffectAuraPeriod), chainTargets: num(e.EffectChainTargets),
      radiusYards: Math.max(0, ...(Array.isArray(e.EffectRadiusIndex) ? e.EffectRadiusIndex : [e.EffectRadiusIndex]).map((i) => radius.get(num(i)) ?? 0)) || null,
    }));
    const a = aura.get(id);
    return {
      effects: eff, durationMs: durationIndex && durations.has(durationIndex) ? durations.get(durationIndex)! : null,
      procChance: num(a?.ProcChance) > 0 && num(a?.ProcChance) <= 100 ? num(a?.ProcChance) : null, procCharges: num(a?.ProcCharges) || null, name: names.get(id) ?? null,
    };
  };

  const dir = join(opts.outDir, `${meta.product}-${meta.buildId}-${meta.buildConfig.slice(0, 8)}`);
  const work = join(dir, "_work");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "icons"), { recursive: true });
  mkdirSync(join(dir, "frames"), { recursive: true });
  mkdirSync(work, { recursive: true });

  const fetched = new Map<number, Fetched>();
  async function fetchFile(id: number): Promise<Fetched> {
    const known = fetched.get(id);
    if (known) return known;
    let result: Fetched;
    try {
      const status = source.fileStatus?.(id);
      if (status === "absent") result = { status: "absent" };
      else if (status === "encrypted") result = { status: "encrypted" };
      else {
        const read = await source.readFile!(id);
        result = !read ? { status: "absent" } : read.encryptedBlocks > 0 ? { status: "encrypted" } : { status: "ok", buffer: read.buffer };
      }
    } catch {
      result = { status: "failed" };
    }
    fetched.set(id, result);
    return result;
  }

  // Icons and tooltips, one per talent entry.
  const spells: AssetManifest["spells"] = {};
  const iconIdOf = new Map<string, number>();
  let resolved = 0, unresolvedCount = 0, empty = 0;
  for (const c of classes) {
    for (const tree of c.trees) {
      for (const node of tree.nodes) {
        for (const entry of node.entries) {
          const key = String(entry.definitionId);
          if (spells[key]) continue;
          const def = definitions.get(entry.definitionId);
          const shown = num(def?.VisibleSpellID) || num(def?.SpellID) || entry.spellId;
          const raw = text(spellRows.get(shown)?.Description_lang);
          const self = factsFor(shown) ?? { effects: [], durationMs: null };
          let description: { text: string; unresolved: string[] } | null = null;
          if (raw) {
            description = resolveTooltip(raw, self, factsFor);
            if (description.unresolved.length) unresolvedCount += 1; else resolved += 1;
          } else empty += 1;
          const attrs = misc.get(shown)?.Attributes;
          const word = Array.isArray(attrs) ? num(attrs[0]) : null;
          spells[key] = { spellId: entry.spellId, name: entry.name, icon: null, passive: word === null ? null : (word & ATTR_PASSIVE) !== 0, description };
          if (entry.iconFileId) iconIdOf.set(key, entry.iconFileId);
        }
      }
    }
  }

  const failures = new Set<string>();
  const stats = { iconsExtracted: 0, iconsEncrypted: 0, iconsAbsent: 0, iconsFailed: 0, framesExtracted: 0, framesEncrypted: 0, framesAbsent: 0, framesFailed: 0 };
  const count = (kind: "icons" | "frames", status: Fetched["status"] | "extracted") => {
    const k = `${kind}${status === "ok" || status === "extracted" ? "Extracted" : status === "encrypted" ? "Encrypted" : status === "absent" ? "Absent" : "Failed"}` as keyof typeof stats;
    stats[k] += 1;
  };

  async function convertAll(jobs: (ConvertJob & { key: string })[], kind: "icons" | "frames", into: Record<string, z.infer<typeof File>>, folder: string) {
    const results = await convert(jobs.map(({ key: _k, ...j }) => j));
    for (let i = 0; i < jobs.length; i++) {
      const r = results[i];
      if (!r?.ok) { count(kind, "failed"); failures.add(`${kind}: ${r?.error ?? "no answer"}`); continue; }
      const bytes = readFileSync(jobs[i].dst);
      into[jobs[i].key] = { file: `${folder}/${jobs[i].dst.split(/[\\/]/).pop()}`, width: r.width, height: r.height, bytes: bytes.length, sha256: sha(bytes) };
      count(kind, "extracted");
    }
  }

  // Icons: one file per file data id.
  const icons: AssetManifest["icons"] = {};
  const iconJobs: (ConvertJob & { key: string })[] = [];
  for (const id of new Set(iconIdOf.values())) {
    const f = await fetchFile(id);
    if (f.status !== "ok") { count("icons", f.status); continue; }
    const src = join(work, `icon-${id}.blp`);
    writeFileSync(src, f.buffer!);
    iconJobs.push({ key: String(id), src, dst: join(dir, "icons", `${id}.webp`), max: 128 });
  }
  await convertAll(iconJobs, "icons", icons, "icons");
  for (const [key, id] of iconIdOf) if (icons[String(id)]) spells[key].icon = icons[String(id)].file.replace(/^icons\//, "");

  // Frame pieces: the atlas element names the window needs, cut out of their atlas files.
  const atlases = new Map(list(get("UiTextureAtlas")).map((r) => [num(r.ID), r]));
  const elementByName = new Map(list(get("UiTextureAtlasElement")).map((r) => [String(r.Name), num(r.ID)]));
  const memberOf = new Map<number, Record<string, unknown>>();
  for (const m of list(get("UiTextureAtlasMember"))) if (!memberOf.has(num(m.UiTextureAtlasElementID))) memberOf.set(num(m.UiTextureAtlasElementID), m);
  const backgrounds: AssetManifest["backgrounds"] = {};
  const wanted = new Set(FRAME_ELEMENTS);
  for (const [k, v] of Object.entries(BACKGROUND_FOR)) { wanted.add(v.element); backgrounds[k] = { element: v.element, nearest: v.nearest === true }; }
  const frames: AssetManifest["frames"] = {};
  const missingFrames: string[] = [];
  const frameJobs: (ConvertJob & { key: string })[] = [];
  for (const name of wanted) {
    const el = elementByName.get(name);
    const member = el === undefined ? undefined : memberOf.get(el);
    const atlas = member ? atlases.get(num(member.UiTextureAtlasID)) : undefined;
    if (!member || !atlas) { missingFrames.push(name); count("frames", "absent"); continue; }
    const fileId = num(atlas.FileDataID);
    const f = await fetchFile(fileId);
    if (f.status !== "ok") { missingFrames.push(name); count("frames", f.status); continue; }
    const src = join(work, `atlas-${fileId}.blp`);
    writeFileSync(src, f.buffer!);
    frameJobs.push({ key: name, src, dst: join(dir, "frames", `${name}.webp`), crop: [num(member.CommittedLeft), num(member.CommittedTop), num(member.CommittedRight), num(member.CommittedBottom)] });
  }
  await convertAll(frameJobs, "frames", frames, "frames");
  for (const name of wanted) if (!frames[name] && !missingFrames.includes(name)) missingFrames.push(name);
  for (const [k, v] of Object.entries(backgrounds)) if (!frames[v.element]) delete backgrounds[k];

  rmSync(work, { recursive: true, force: true });
  const manifest = AssetManifest.parse({
    schema: ASSET_SCHEMA, label: LABEL,
    build: { product: build.product, buildId: build.buildId, version: build.version, buildConfig: build.buildConfig, extractedAt: new Date().toISOString() },
    spells, icons, frames, backgrounds,
    counts: { ...stats, tooltipsResolved: resolved, tooltipsUnresolved: unresolvedCount, tooltipsEmpty: empty },
    missingFrames: missingFrames.sort(),
  });
  writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`);
  const c = manifest.counts;
  const notes = [
    ...[...failures].slice(0, 5).map((f) => `could not convert (${f})`),
    `icons: ${c.iconsExtracted} extracted, ${c.iconsEncrypted} encrypted skipped, ${c.iconsAbsent} not in build, ${c.iconsFailed} failed`,
    `frame pieces: ${c.framesExtracted} extracted, ${c.framesEncrypted} encrypted skipped, ${c.framesAbsent} not in build, ${c.framesFailed} failed`,
    `tooltips: ${c.tooltipsResolved} fully resolved, ${c.tooltipsUnresolved} with placeholders, ${c.tooltipsEmpty} without text`,
  ];
  return { dir, manifest, notes };
}
