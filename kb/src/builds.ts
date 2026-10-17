import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

/**
 * Build registry from Blizzard's public version service (http://us.patch.battle.net:1119/<product>/versions):
 * which builds of each product exist, and when Everloot first saw them. It reads build identifiers only,
 * never game files. A build is identified by product + BuildConfig, not by its version label.
 */

export interface VersionRow {
  region: string;
  buildConfig: string;
  cdnConfig: string;
  buildId: number;
  version: string;
  productConfig: string;
}

export interface VersionsResponse {
  /** The service's sequence number for this answer; null when absent. */
  seqn: number | null;
  rows: VersionRow[];
}

export interface BuildEntry {
  key: string;
  product: string;
  buildConfig: string;
  buildId: number;
  version: string;
  regions: string[];
  firstSeen: string;
  lastSeen: string;
  /** "queued" until a later step (extraction) has handled the build. */
  status: "queued" | "processed";
}

export interface BuildRegistry {
  builds: BuildEntry[];
}

const HEX32 = /^[0-9a-f]{32}$/;

/** Parse the service's pipe-separated table: a typed header row, `## seqn = N`, then one row per region. */
export function parseVersions(text: string): VersionsResponse {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const header = lines.find((l) => !l.startsWith("#"));
  if (!header || !header.includes("|") || !header.includes("!")) throw new Error("not a Blizzard version list");
  const columns = header.split("|").map((c) => c.split("!")[0].toLowerCase());
  const at = (name: string) => {
    const i = columns.indexOf(name.toLowerCase());
    if (i < 0) throw new Error(`version list has no ${name} column`);
    return i;
  };
  const idx = {
    region: at("Region"), buildConfig: at("BuildConfig"), cdnConfig: at("CDNConfig"),
    buildId: at("BuildId"), version: at("VersionsName"), productConfig: at("ProductConfig"),
  };
  const seqnLine = lines.find((l) => /^##\s*seqn\s*=/i.test(l));
  const seqn = seqnLine ? Number(seqnLine.split("=")[1].trim()) : null;
  const rows = lines.filter((l) => !l.startsWith("#") && l !== header).map((line) => {
    const f = line.split("|");
    const buildId = Number(f[idx.buildId]);
    if (!Number.isInteger(buildId) || buildId <= 0) throw new Error(`version list row has a bad BuildId: ${line}`);
    const row: VersionRow = {
      region: f[idx.region], buildConfig: f[idx.buildConfig], cdnConfig: f[idx.cdnConfig],
      buildId, version: f[idx.version], productConfig: f[idx.productConfig],
    };
    if (!HEX32.test(row.buildConfig)) throw new Error(`version list row has a bad BuildConfig: ${line}`);
    return row;
  });
  return { seqn: Number.isInteger(seqn) ? seqn : null, rows };
}

/** Add builds not seen before (queued), refresh the ones already known. Pure: returns a new registry. */
export function recordBuilds(
  registry: BuildRegistry,
  product: string,
  response: VersionsResponse,
  now: Date,
): { registry: BuildRegistry; added: BuildEntry[] } {
  const builds = registry.builds.map((b) => ({ ...b, regions: [...b.regions] }));
  const added: BuildEntry[] = [];
  const stamp = now.toISOString();
  for (const row of response.rows) {
    const key = `${product}:${row.buildConfig}`;
    let entry = builds.find((b) => b.key === key);
    if (!entry) {
      entry = {
        key, product, buildConfig: row.buildConfig, buildId: row.buildId, version: row.version,
        regions: [], firstSeen: stamp, lastSeen: stamp, status: "queued",
      };
      builds.push(entry);
      added.push(entry);
    }
    entry.lastSeen = stamp;
    if (!entry.regions.includes(row.region)) entry.regions = [...entry.regions, row.region].sort();
  }
  return { registry: { builds }, added };
}

export const VERSION_SERVICE = "http://us.patch.battle.net:1119";

/** The registry at `path`; a file that does not exist yet is an empty registry. */
export function loadRegistry(path: string): BuildRegistry {
  if (!existsSync(path)) return { builds: [] };
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!parsed || !Array.isArray(parsed.builds)) throw new Error(`${path} is not a build registry`);
  return parsed as BuildRegistry;
}

/** Written beside the target and renamed into place, so a crash never leaves half a registry. */
export function saveRegistry(path: string, registry: BuildRegistry): void {
  writeFileSync(`${path}.tmp`, `${JSON.stringify(registry, null, 2)}
`);
  renameSync(`${path}.tmp`, path);
}

/**
 * Ask the version service about each product and record what it says. A product that fails (network,
 * or an answer that is not a version list) is reported and left as it was; the others still update.
 */
export async function checkBuilds(
  registry: BuildRegistry,
  products: string[],
  fetchText: (product: string) => Promise<string>,
  now: Date,
): Promise<{ registry: BuildRegistry; added: BuildEntry[]; errors: { product: string; error: string }[] }> {
  let current = registry;
  const added: BuildEntry[] = [];
  const errors: { product: string; error: string }[] = [];
  for (const product of products) {
    try {
      const result = recordBuilds(current, product, parseVersions(await fetchText(product)), now);
      current = result.registry;
      added.push(...result.added);
    } catch (err) {
      errors.push({ product, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { registry: current, added, errors };
}
