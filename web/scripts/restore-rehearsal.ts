/**
 * Restore rehearsal for an R2 mirror (scripts/backup-r2.mjs): rebuild the public corpus from the
 * mirrored raw uploads with the site's own local store, in a scratch folder, and check that every
 * event the backed-up snapshot published comes back. Nothing touches production.
 * Run: npx tsx scripts/restore-rehearsal.ts <mirror folder>
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUploadStore } from "../src/lib/upload-store";

type Row = { installId?: string; eventId?: string };
const key = (r: Row) => `${r.installId}|${r.eventId}`;

export async function rehearseRestore(mirror: string) {
  const scratch = mkdtempSync(join(tmpdir(), "everloot-restore-"));
  try {
    // The local store reads <dir>/uploads/*.json; the bucket nests them by date.
    mkdirSync(join(scratch, "uploads"));
    let uploads = 0;
    const root = join(mirror, "uploads");
    for (const day of existsSync(root) ? readdirSync(root) : []) {
      for (const file of readdirSync(join(root, day)).filter((f) => f.endsWith(".json"))) {
        cpSync(join(root, day, file), join(scratch, "uploads", file));
        uploads++;
      }
    }
    const store = createUploadStore({ cloud: null, localDir: scratch, cacheMs: 0 });
    const corpus = await store.loadCorpus();
    if (corpus.unreachable) throw new Error("rebuilt corpus is unreadable");
    const rebuilt = new Set(corpus.records.map((r) => key(r as Row)));
    const snapshotFile = join(mirror, "snapshots", "corpus.json");
    const snapshot = existsSync(snapshotFile) ? ((JSON.parse(readFileSync(snapshotFile, "utf8")).records ?? []) as Row[]) : [];
    const missing = snapshot.map(key).filter((k) => !rebuilt.has(k));
    return { ok: missing.length === 0, uploads, rebuilt: rebuilt.size, snapshot: snapshot.length, missing };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// Run directly (npx tsx): this package is CommonJS, so no top-level await. Imported by tests: skipped.
if (typeof require !== "undefined" && require.main === module) void (async () => {
  const mirror = process.argv[2];
  if (!mirror) throw new Error("usage: npx tsx scripts/restore-rehearsal.ts <mirror folder>");
  const result = await rehearseRestore(mirror);
  console.log(JSON.stringify({ ...result, missing: result.missing.length }, null, 1));
  if (!result.ok) process.exit(1);
})();
