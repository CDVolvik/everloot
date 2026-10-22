import recheckFile from "../../../kb/curated/recheck.json";
import { computeCoverage, parseCoverageExpected, RecheckFile, type CoverageExpected, type CoverageReport, type RecheckScope } from "../../../kb/src/coverage";
import { buildFolder, privateStoreFromEnv, type PrivateStore } from "./game-assets";
import { CLIENT_LAYER } from "./items";
import { assetsBaseUrl } from "./talents/assets";
import { uploadStore, type Corpus } from "./upload-store";
import { WORLD_MAP } from "./world-map";
import { placedEntrances, publicZones } from "./zones";

/** The client build the score is for: the build the site's game files are read from. */
export const COVERAGE_BUILD = CLIENT_LAYER.build.version;

/** The recheck scopes in kb/curated/recheck.json, bundled like the other curated files; a malformed file scopes nothing. */
export const RECHECK_SCOPES: readonly RecheckScope[] = (() => {
  const parsed = RecheckFile.safeParse(recheckFile);
  return parsed.success ? parsed.data.scopes : [];
})();

/**
 * The counts-only expected file (`<build folder>/coverage-expected.json` in the private bucket, uploaded by the
 * maintainer beside the item names). Null when it is missing, malformed, holds anything but counts, or is for
 * another build: the score then has no denominator and the pages show the reported facts alone. Never throws.
 */
export async function loadCoverageExpected(build: string = COVERAGE_BUILD, base: string | null = assetsBaseUrl(), store: PrivateStore | null = privateStoreFromEnv()): Promise<CoverageExpected | null> {
  const folder = base ? buildFolder(base) : null;
  if (!folder || !store) return null;
  return parseCoverageExpected(await store.read(`${folder}/coverage-expected.json`), build);
}

/** The score for one corpus: the released zones, the entrances the game files place, the expected counts and the recheck scopes. */
export function coverageFor(corpus: Pick<Corpus, "records" | "dataAsOf">, expected: CoverageExpected | null): CoverageReport {
  const fileEntrances = placedEntrances(WORLD_MAP).flatMap((e) => (e.files && e.zone ? [{ instanceMapIds: e.instanceMapIds, zone: e.zone.mapId }] : []));
  return computeCoverage({
    records: corpus.records, asOf: corpus.dataAsOf ?? null,
    zones: publicZones().map((z) => ({ mapId: z.mapId, name: z.name })),
    heldBack: WORLD_MAP.heldBackZones.map((z) => z.uiMapId),
    fileEntrances, expected, recheck: RECHECK_SCOPES,
  });
}

let memo: { key: string; expected: CoverageExpected | null; report: CoverageReport } | null = null;

/**
 * The score the coverage pages read, computed once per corpus version (the key rollup-compute.ts uses) and expected
 * file, so a page view pays nothing once it is warm. Null when storage is out of reach: unknown, never zero.
 */
export async function loadCoverage(): Promise<CoverageReport | null> {
  const [corpus, expected] = await Promise.all([uploadStore.loadCorpus(), loadCoverageExpected()]);
  if (corpus.unreachable) return null;
  const key = `${corpus.uploads}|${corpus.dataAsOf ?? ""}|${corpus.records.length}`;
  if (!memo || memo.key !== key || memo.expected !== expected) memo = { key, expected, report: coverageFor(corpus, expected) };
  return memo.report;
}
