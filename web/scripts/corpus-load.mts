/**
 * Local scale check for the corpus path: npx tsx scripts/corpus-load.mts [records...]
 * Synthetic loot rows only, in memory; nothing is read from or written to any store.
 * Measures the cron merge, snapshot size, a cold page read (parse + replay) and the drop rollup.
 */
import { performance } from "node:perf_hooks";
import { mergeCorpus, publicRecords } from "../../kb/src/corpus";
import { lootWindowsFromRecords, rollupDrops } from "../../kb/src/drop-rollup";
import { createUploadStore, type CloudConfig } from "../src/lib/upload-store";

const cloud: CloudConfig = {
  r2AccountId: "acct", r2AccessKeyId: "AKID", r2SecretAccessKey: "synthetic", r2Bucket: "everloot-uploads",
  supabaseUrl: "https://sb.example", supabaseServiceKey: "synthetic",
};

function rows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    kind: "loot" as const,
    // 500 sources; each source's kills spread over many installs, so rollups can reach agreement.
    eventId: `epoch-${Math.floor(i / 500) % 200}:${i}`,
    installId: `install-${Math.floor(i / 500) % 200}`,
    capturedAt: "2026-10-09T12:00:00.000Z",
    sourceNpcId: 1000 + (i % 500),
    sourceEvidence: "loot-api" as const,
    sourceGuid: `Creature-0-1-2-3-${1000 + (i % 500)}-${i}`,
    items: i % 4 === 0 ? [] : [{ itemId: 5000 + (i % 300), count: 1 + (i % 3) }],
  }));
}

function time<T>(fn: () => T): [T, number] {
  const start = performance.now();
  const value = fn();
  return [value, performance.now() - start];
}

async function measure(n: number) {
  const records = rows(n);
  const [state, mergeMs] = time(() => mergeCorpus(undefined, records));
  const snapshot = JSON.stringify({
    generatedAt: "2026-10-09T12:00:00.000Z", uploads: Math.ceil(n / 500), records: publicRecords(state),
    corpusState: state, lastReceivedAt: null, lastIds: [],
  });
  const fetch = (async () => new Response(snapshot, { headers: { etag: '"load"' } })) as typeof globalThis.fetch;
  const store = createUploadStore({ cloud, localDir: "unused", fetch, cacheMs: 0 });
  const readStart = performance.now();
  const corpus = await store.loadCorpus();
  const readMs = performance.now() - readStart;
  if (corpus.unreachable || corpus.records.length !== state.events.length) throw new Error("read did not return the merged corpus");
  const [rollup, rollupMs] = time(() => rollupDrops(lootWindowsFromRecords(corpus.records)));
  return {
    records: n,
    "merge ms": Math.round(mergeMs),
    "snapshot MB": +(snapshot.length / 1_048_576).toFixed(1),
    "cold read ms": Math.round(readMs),
    // /api/corpus/public returns this body; the MCP reader refuses a body over 2,000,000 bytes.
    "public API MB": +(JSON.stringify({ ok: true, ...corpus }).length / 1_048_576).toFixed(1),
    "loot windows": lootWindowsFromRecords(corpus.records).length,
    "rollup ms": Math.round(rollupMs),
    "public rates": rollup.rates.filter((r) => r.public).length,
    "heap MB": Math.round(process.memoryUsage().heapUsed / 1_048_576),
  };
}

const sizes = process.argv.slice(2).map(Number).filter((n) => Number.isInteger(n) && n > 0);
const results = [];
for (const n of sizes.length ? sizes : [1_000, 5_000, 10_000, 25_000, 50_000]) results.push(await measure(n));
console.table(results);
