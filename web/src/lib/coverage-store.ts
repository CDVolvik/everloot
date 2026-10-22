import { AwsClient } from "aws4fetch";
import { COVERAGE_BUILD, coverageFor, loadCoverageExpected } from "./coverage-compute";
import { cloudConfig, uploadStore, type CloudConfig } from "./upload-store";

/** Where the cron keeps the score for a client build: counts only, beside the corpus snapshot. */
export const coverageKey = (build: string): string => `coverage/${build}.json`;

/**
 * Computes the coverage score from the current corpus and writes it to R2 as `coverage/<build>.json`, for the
 * snapshot cron to call after `writeSnapshot`, and only when that added uploads (`added > 0`) or rebuilt: with no
 * new uploads the score cannot change, so it returns `{ written: false }` without reading anything. The cron
 * route is lane 1's file; this is the whole of the call it needs.
 */
export async function writeCoverage(opts: { added: number; rebuild?: boolean }, deps: {
  cloud?: CloudConfig | null; fetch?: typeof fetch; build?: string;
} = {}): Promise<{ written: boolean; key?: string; zones?: number }> {
  if (opts.added <= 0 && !opts.rebuild) return { written: false };
  const cloud = deps.cloud === undefined ? cloudConfig() : deps.cloud;
  if (!cloud) throw new Error("coverage needs the cloud store");
  const corpus = await uploadStore.loadCorpus();
  if (corpus.unreachable) throw new Error("corpus unreachable");
  const build = deps.build ?? COVERAGE_BUILD;
  const report = coverageFor(corpus, await loadCoverageExpected(build));
  const r2 = new AwsClient({ accessKeyId: cloud.r2AccessKeyId, secretAccessKey: cloud.r2SecretAccessKey, service: "s3", region: "auto" });
  const key = coverageKey(build);
  const url = `https://${cloud.r2AccountId}.r2.cloudflarestorage.com/${cloud.r2Bucket}/${key}`;
  const put = await (deps.fetch ?? fetch)(await r2.sign(url, { method: "PUT", body: JSON.stringify({ build, ...report }), headers: { "content-type": "application/json" } }));
  if (!put.ok) throw new Error(`coverage write failed (${put.status})`);
  return { written: true, key, zones: report.zones.length };
}
