/**
 * Holds the package to its versioning rule (CHANGELOG.md): anything a client could depend on that
 * disappears or tightens needs a major bump; anything added needs at least a minor bump. It compares the
 * committed schema/ folder with the one in the latest published tarball, so the comparison is
 * language-neutral and covers the record kinds, the envelope, the limits, the API shapes and the MCP tools.
 *
 * Run from packages/protocol: `npx tsx scripts/check-semver.ts`. With no published version it says so and
 * passes; when package.json already holds the published version there is nothing to compare.
 */
import { execSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export interface Diff {
  /** Changes that need a major bump, each in words with its path. */
  breaking: string[];
  /** Changes that need at least a minor bump. */
  additions: string[];
}

/** A tree of schema files: relative path with forward slashes, to parsed JSON. */
export type Tree = Record<string, unknown>;

/** Keys whose text can change freely: they describe, they do not constrain. */
const IGNORED_KEYS = new Set(["description", "title", "$id", "$schema", "$comment", "default", "examples", "x-everloot-output", "protocol"]);
const UPPER_LIMITS = new Set(["maxLength", "maxItems", "maximum", "exclusiveMaximum", "maxProperties"]);
const LOWER_LIMITS = new Set(["minLength", "minItems", "minimum", "exclusiveMinimum", "minProperties"]);
/** Keys whose change of value, or arrival, narrows what is accepted. */
const NARROWING = new Set(["type", "const", "pattern", "format", "enum", "required", ...UPPER_LIMITS, ...LOWER_LIMITS]);
const LOOSENING_ON_REMOVAL = new Set(["const", "pattern", "format", "enum", "required", ...UPPER_LIMITS, ...LOWER_LIMITS]);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** A limit outside JSON Schema, such as limits.json's maxBodyBytes: a name that starts with max or ends with Max. */
const isUpperLimitName = (key: string) => UPPER_LIMITS.has(key) || /^max[A-Z]/.test(key) || /Max$/.test(key) || /^(batchBytes|recordsPerBatch|recordsPerFile|realmsPerUpload)$/.test(key);
const isLowerLimitName = (key: string) => LOWER_LIMITS.has(key) || /^min[A-Z]/.test(key) || /Min$/.test(key);

function compareArrays(path: string, key: string, a: unknown[], b: unknown[], diff: Diff): void {
  const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
  const as = new Set(a.map((v) => JSON.stringify(v)));
  const bs = new Set(b.map((v) => JSON.stringify(v)));
  const removed = a.filter((v) => !bs.has(JSON.stringify(v)));
  const added = b.filter((v) => !as.has(JSON.stringify(v)));
  if (key === "required") {
    for (const v of added) diff.breaking.push(`${path}: ${show(v)} became required`);
    for (const v of removed) diff.additions.push(`${path}: ${show(v)} is no longer required`);
    return;
  }
  // enum values, index lists, routes: losing one breaks a reader, gaining one is new.
  for (const v of removed) diff.breaking.push(`${path}: ${show(v)} was removed`);
  for (const v of added) diff.additions.push(`${path}: ${show(v)} was added`);
}

function compareValues(path: string, key: string, a: unknown, b: unknown, diff: Diff): void {
  if (IGNORED_KEYS.has(key)) return;
  if (isObject(a) && isObject(b)) {
    const underProperties = key === "properties" || key === "$defs" || key === "definitions";
    for (const k of Object.keys(a)) {
      if (IGNORED_KEYS.has(k)) continue;
      const child = `${path}/${k}`;
      if (!(k in b)) {
        if (underProperties || !LOOSENING_ON_REMOVAL.has(k)) diff.breaking.push(`${child} was removed`);
        else diff.additions.push(`${child} was dropped, so more is accepted`);
        continue;
      }
      compareValues(child, k, a[k], b[k], diff);
    }
    for (const k of Object.keys(b)) {
      if (k in a || IGNORED_KEYS.has(k)) continue;
      const child = `${path}/${k}`;
      if (underProperties) diff.additions.push(`${child} was added`);
      else if (NARROWING.has(k)) diff.breaking.push(`${child} was added, so less is accepted`);
      else diff.additions.push(`${child} was added`);
    }
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    compareArrays(path, key, a, b, diff);
    return;
  }
  if (typeof a === "number" && typeof b === "number" && a !== b) {
    if (isUpperLimitName(key)) (b < a ? diff.breaking : diff.additions).push(`${path}: ${a} -> ${b}`);
    else if (isLowerLimitName(key)) (b > a ? diff.breaking : diff.additions).push(`${path}: ${a} -> ${b}`);
    else diff.breaking.push(`${path}: ${a} -> ${b}`);
    return;
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) diff.breaking.push(`${path}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
}

/** Every change between the published tree and the working tree, sorted into what it needs. */
export function compareTrees(published: Tree, current: Tree): Diff {
  const diff: Diff = { breaking: [], additions: [] };
  for (const file of Object.keys(published).sort()) {
    if (!(file in current)) { diff.breaking.push(`${file} was removed`); continue; }
    compareValues(file, "", published[file], current[file], diff);
  }
  for (const file of Object.keys(current).sort()) if (!(file in published)) diff.additions.push(`${file} was added`);
  return diff;
}

const semver = (v: string): [number, number, number] | null => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

/** The sentences that fail the check for this diff and these versions; empty means it passes. */
export function verdict(publishedVersion: string, currentVersion: string, diff: Diff): string[] {
  const from = semver(publishedVersion);
  const to = semver(currentVersion);
  if (!from || !to) return [`versions must be x.y.z: published ${publishedVersion}, package.json ${currentVersion}`];
  const problems: string[] = [];
  const majorBump = to[0] > from[0];
  const minorBump = majorBump || (to[0] === from[0] && to[1] > from[1]);
  if (diff.breaking.length > 0 && !majorBump) {
    problems.push(`${diff.breaking.length} change(s) need a major bump (${from[0] + 1}.0.0), package.json says ${currentVersion}:`, ...diff.breaking.map((s) => `  - ${s}`));
  }
  if (diff.additions.length > 0 && !minorBump) {
    problems.push(`${diff.additions.length} addition(s) need at least a minor bump, package.json says ${currentVersion}:`, ...diff.additions.map((s) => `  - ${s}`));
  }
  if ((to[0] - from[0] || to[1] - from[1] || to[2] - from[2]) < 0) {
    problems.push(`package.json ${currentVersion} is below the published ${publishedVersion}`);
  }
  return problems;
}

/** Every JSON file under a schema folder, keyed by its relative path with forward slashes. */
export function readTree(root: string): Tree {
  const tree: Tree = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".json")) tree[relative(root, full).replaceAll("\\", "/")] = JSON.parse(readFileSync(full, "utf8"));
    }
  };
  walk(root);
  return tree;
}

function main(): number {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as { name: string; version: string };
  let published: string | null = null;
  try {
    published = execSync(`npm view ${pkg.name} version`, { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" }).trim() || null;
  } catch {
    published = null;
  }
  if (!published) {
    console.log(`check-semver: ${pkg.name} is not on npm yet; nothing to compare. package.json is ${pkg.version}.`);
    return 0;
  }
  if (published === pkg.version) {
    console.log(`check-semver: package.json holds the published version ${published}; nothing to compare.`);
    return 0;
  }
  const tmp = mkdtempSync(join(tmpdir(), "everloot-protocol-semver-"));
  try {
    execSync(`npm pack ${pkg.name}@${published} --pack-destination "${tmp}"`, { stdio: ["ignore", "pipe", "ignore"] });
    const tgz = readdirSync(tmp).find((f) => f.endsWith(".tgz"));
    if (!tgz) throw new Error("npm pack wrote no tarball");
    execSync(`tar -xzf "${join(tmp, tgz)}" -C "${tmp}"`, { stdio: "ignore" });
    const diff = compareTrees(readTree(join(tmp, "package", "schema")), readTree(join(here, "..", "schema")));
    const problems = verdict(published, pkg.version, diff);
    console.log(`check-semver: published ${published}, package.json ${pkg.version}: ${diff.breaking.length} breaking, ${diff.additions.length} added.`);
    for (const line of problems) console.error(line);
    return problems.length === 0 ? 0 : 1;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main());
