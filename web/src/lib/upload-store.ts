import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AwsClient } from "aws4fetch";
import { parseRecords, type CanonicalUpload, type IntakeRecord } from "./intake";

/**
 * Where uploads and waitlist signups live.
 * Cloud: the raw upload is an R2 object (cheap, the record of truth) and Supabase holds one index
 * row per upload plus the waitlist. Every rollup can be rebuilt from the R2 objects.
 * Pages read one snapshot object (`snapshots/corpus.json`) that a cron job extends with only the
 * uploads it has not seen yet. With no snapshot they fall back to reading every indexed object.
 * Local (no cloud variables, i.e. dev): the same files under web/data, as before.
 */

export interface CloudConfig {
  r2AccountId: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2Bucket: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
}

export interface Corpus {
  uploads: number;
  /** Every record already passed its kind schema, so a rollup never reads a row no schema accepted. */
  records: IntakeRecord[];
  /** Set when the read failed. An empty `records` array is then not a count of uploads. */
  unreachable?: boolean;
  /** Conflict tombstones: event keys that had conflicting payloads and are excluded from public facts. */
  conflictTombstones?: string[];
}

export const STORAGE_UNREACHABLE = "Storage unreachable. These figures are unrecorded, not zero.";

interface Snapshot extends Corpus {
  generatedAt: string;
  /** received_at of the newest upload included, and the ids sharing it, so ties are not re-read. */
  lastReceivedAt: string | null;
  lastIds: string[];
  /** Dedup state version for incremental rebuild agreement. */
  dedupVersion: number;
}

/** Create a stable deduplication key from installId and eventId. */
export function dedupKey(record: IntakeRecord): string {
  return `${record.installId}|${record.eventId}`;
}

/** Compare two records for canonical equality (ignoring metadata fields that don't affect facts). */
export function recordsEqual(a: IntakeRecord, b: IntakeRecord): boolean {
  // Compare all fields except capturedAt, kindLoggedAt (added at store time), eventId (the identity key)
  const { capturedAt: _, kindLoggedAt: __, eventId: ___, ...aRest } = a as Record<string, unknown>;
  const { capturedAt: ____ , kindLoggedAt: _____, eventId: ______, ...bRest } = b as Record<string, unknown>;
  return JSON.stringify(aRest) === JSON.stringify(bRest);
}

/**
 * Deduplicate records by (installId, eventId).
 * - Equal payloads: keep one
 * - Conflicting payloads: exclude both, add to conflict tombstones
 * Returns deduplicated records and conflict tombstones.
 */
export function deduplicateRecords(records: IntakeRecord[]): { records: IntakeRecord[]; conflictTombstones: string[] } {
  const seen = new Map<string, IntakeRecord[]>();
  for (const r of records) {
    const key = dedupKey(r);
    const existing = seen.get(key);
    if (existing) {
      existing.push(r);
    } else {
      seen.set(key, [r]);
    }
  }

  const deduped: IntakeRecord[] = [];
  const conflictTombstones: string[] = [];

  for (const [key, group] of seen) {
    if (group.length === 1) {
      deduped.push(group[0]);
    } else {
      // Check if all payloads are equal
      const first = group[0];
      const allEqual = group.every(r => recordsEqual(first, r));
      if (allEqual) {
        deduped.push(first);
      } else {
        // Conflict: exclude all, add tombstone
        conflictTombstones.push(key);
      }
    }
  }

  return { records: deduped, conflictTombstones };
}

interface IndexRow {
  id: string;
  object_key: string;
  received_at: string;
}

export interface WaitlistEntry {
  toolSlug: string;
  email: string;
  ts: string;
}

/** Cloud mode only when every variable is set. Half a config falls back to local, never half-writes. */
export function cloudConfig(env: Record<string, string | undefined> = process.env): CloudConfig | null {
  const v = (k: string) => env[k]?.trim() || undefined;
  const c = {
    r2AccountId: v("R2_ACCOUNT_ID"),
    r2AccessKeyId: v("R2_ACCESS_KEY_ID"),
    r2SecretAccessKey: v("R2_SECRET_ACCESS_KEY"),
    r2Bucket: v("R2_BUCKET"),
    supabaseUrl: v("SUPABASE_URL"),
    supabaseServiceKey: v("SUPABASE_SERVICE_ROLE_KEY"),
  };
  return Object.values(c).every(Boolean) ? (c as CloudConfig) : null;
}

const PAGE = 1000; // PostgREST's default row cap on Supabase
const PARALLEL_READS = 16;
const SNAPSHOT_KEY = "snapshots/corpus.json";

function rawRecordsOf(payload: unknown): unknown[] {
  const records = (payload as { records?: unknown })?.records;
  return Array.isArray(records) ? records : [];
}

/**
 * Every read boundary normalizes through the same kind schemas: stored files, R2 objects and
 * snapshot rows may predate a schema change. Unknown kinds and invalid rows are dropped, extra
 * fields stripped. No aggregate cap — 2,000 is a per-request limit, not a corpus size.
 */
function normalizedRecordsOf(payload: unknown): IntakeRecord[] {
  // No verified ownership, named opt-in or durable suppression reader is wired
  // yet. Preserve raw accepted uploads privately, but exclude named public facts.
  const privateKinds = new Set(["guild_snapshot", "raid_lockout", "attendance", "loot_award",
    "gear_snapshot", "gold_snapshot", "money_event"]);
  return parseRecords(rawRecordsOf(payload)).records.filter(r => !privateKinds.has(r.kind));
}

export function createUploadStore(opts: {
  cloud: CloudConfig | null;
  localDir: string;
  fetch?: typeof fetch;
  now?: () => Date;
  cacheMs?: number;
}) {
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? (() => new Date());
  const cacheMs = opts.cacheMs ?? 5 * 60 * 1000;
  let cached: { at: number; corpus: Corpus } | null = null;

  const cloud = opts.cloud;
  const r2 = cloud && new AwsClient({
    accessKeyId: cloud.r2AccessKeyId,
    secretAccessKey: cloud.r2SecretAccessKey,
    service: "s3",
    region: "auto",
  });
  const objectUrl = (key: string) => `https://${cloud!.r2AccountId}.r2.cloudflarestorage.com/${cloud!.r2Bucket}/${key}`;
  const rest = (path: string) => `${cloud!.supabaseUrl.replace(/\/$/, "")}/rest/v1/${path}`;
  const restHeaders = (extra: Record<string, string> = {}) => ({
    apikey: cloud!.supabaseServiceKey,
    authorization: `Bearer ${cloud!.supabaseServiceKey}`,
    "content-type": "application/json",
    ...extra,
  });

  async function r2Fetch(key: string, init: RequestInit): Promise<Response> {
    return doFetch(await r2!.sign(objectUrl(key), init));
  }

  async function putUpload(uploadId: string, installId: string, payload: CanonicalUpload): Promise<boolean> {
    const body = JSON.stringify(payload);
    if (!cloud) {
      try {
        const dir = join(opts.localDir, "uploads");
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, `${uploadId}.json`), body);
        cached = null;
        return true;
      } catch {
        return false;
      }
    }
    const key = `uploads/${now().toISOString().slice(0, 10)}/${uploadId}.json`;
    try {
      const put = await r2Fetch(key, { method: "PUT", body, headers: { "content-type": "application/json" } });
      if (!put.ok) return false;
      const index = await doFetch(rest("uploads"), {
        method: "POST",
        headers: restHeaders({ prefer: "return=minimal" }),
        body: JSON.stringify({
          id: uploadId,
          install_id: installId,
          record_count: rawRecordsOf(payload).length,
          bytes: body.length,
          object_key: key,
        }),
      });
      if (!index.ok) {
        console.error(`upload ${uploadId}: R2 object stored but index insert failed (${index.status})`);
        return false;
      }
      cached = null;
      return true;
    } catch (err) {
      console.error(`upload ${uploadId}: store failed`, err);
      return false;
    }
  }

  async function readLocal(): Promise<Corpus> {
    const dir = join(opts.localDir, "uploads");
    let files: string[] = [];
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return { uploads: 0, records: [] };
      return { uploads: 0, records: [], unreachable: true };
    }
    const records: IntakeRecord[] = [];
    for (const f of files) {
      try {
        records.push(...normalizedRecordsOf(JSON.parse(await readFile(join(dir, f), "utf8"))));
      } catch {
        continue; // a corrupt file never breaks a rollup
      }
    }
    const { records: deduped, conflictTombstones } = deduplicateRecords(records);
    return { uploads: files.length, records: deduped, conflictTombstones };
  }

  async function listIndex(since?: string): Promise<IndexRow[]> {
    const filter = since ? `&received_at=gte.${encodeURIComponent(since)}` : "";
    const rows: IndexRow[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const res = await doFetch(
        rest(`uploads?select=id,object_key,received_at&order=received_at.asc,id.asc&limit=${PAGE}&offset=${offset}${filter}`),
        { headers: restHeaders() },
      );
      if (!res.ok) throw new Error(`upload index read failed (${res.status})`);
      const page = (await res.json()) as IndexRow[];
      rows.push(...page);
      if (page.length < PAGE) break;
    }
    return rows;
  }

  async function readObjects(keys: string[]): Promise<{ records: IntakeRecord[]; missed: boolean; conflictTombstones: string[] }> {
    const records: IntakeRecord[] = [];
    const tombstones = new Set<string>();
    let missed = false;
    for (let i = 0; i < keys.length; i += PARALLEL_READS) {
      const batch = await Promise.all(keys.slice(i, i + PARALLEL_READS).map(async (key) => {
        try {
          const res = await r2Fetch(key, { method: "GET" });
          if (!res.ok) return { records: [] as IntakeRecord[], missed: true, conflictTombstones: [] as string[] };
          try {
            const { records: normalized, conflictTombstones } = deduplicateRecords(normalizedRecordsOf(JSON.parse(await res.text())));
            return { records: normalized, missed: false, conflictTombstones };
          } catch {
            return { records: [] as IntakeRecord[], missed: false, conflictTombstones: [] as string[] };
          }
        } catch {
          return { records: [] as IntakeRecord[], missed: true, conflictTombstones: [] as string[] };
        }
      }));
      for (const row of batch) {
        if (row.missed) missed = true;
        else records.push(...row.records);
        for (const key of row.conflictTombstones) tombstones.add(key);
      }
    }
    // Deduplicate across all objects
    const { records: deduped, conflictTombstones } = deduplicateRecords(records);
    for (const key of conflictTombstones) tombstones.add(key);
    return { records: deduped.filter(r => !tombstones.has(dedupKey(r))), missed, conflictTombstones: [...tombstones] };
  }

  async function readSnapshot(): Promise<Snapshot | null> {
    const res = await r2Fetch(SNAPSHOT_KEY, { method: "GET" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`snapshot read failed (${res.status})`);
    let parsed: Partial<Snapshot>;
    try {
      parsed = JSON.parse(await res.text()) as Partial<Snapshot>;
    } catch {
      throw new Error("snapshot is not JSON");
    }
    // A snapshot without a records array is unreadable, never an empty corpus.
    if (!Array.isArray(parsed.records)) throw new Error("snapshot has no records array");
    const deduped = deduplicateRecords(normalizedRecordsOf(parsed));
    const tombstones = new Set([
      ...(Array.isArray(parsed.conflictTombstones) ? parsed.conflictTombstones.filter(k => typeof k === "string") : []),
      ...deduped.conflictTombstones,
    ]);
    return {
      generatedAt: parsed.generatedAt ?? "",
      uploads: typeof parsed.uploads === "number" ? parsed.uploads : 0,
      records: deduped.records.filter(r => !tombstones.has(dedupKey(r))),
      conflictTombstones: [...tombstones],
      lastReceivedAt: parsed.lastReceivedAt ?? null,
      lastIds: Array.isArray(parsed.lastIds) ? parsed.lastIds : [],
      dedupVersion: typeof parsed.dedupVersion === "number" ? parsed.dedupVersion : 1,
    };
  }

  async function readCloud(): Promise<Corpus> {
    const snapshot = await readSnapshot();
    if (snapshot) {
      return {
        uploads: snapshot.uploads,
        records: snapshot.records,
        conflictTombstones: snapshot.conflictTombstones,
      };
    }
    const keys = (await listIndex()).map((r) => r.object_key);
    const read = await readObjects(keys);
    if (read.missed) throw new Error("upload object unreadable");
    return { uploads: keys.length, records: read.records, conflictTombstones: read.conflictTombstones };
  }

  /**
   * Extend the snapshot with uploads newer than its last one (cron). `rebuild` starts from empty,
   * which is how a deleted upload leaves the snapshot.
   */
  async function writeSnapshot(opts: { rebuild?: boolean } = {}): Promise<{ uploads: number; added: number }> {
    if (!cloud) throw new Error("snapshots need the cloud store");
    const prev = opts.rebuild ? null : await readSnapshot();
    const rows = await listIndex(prev?.lastReceivedAt ?? undefined);
    const fresh = rows.filter((r) => !(prev && r.received_at === prev.lastReceivedAt && prev.lastIds.includes(r.id)));
    const read = await readObjects(fresh.map((r) => r.object_key));
    if (read.missed) throw new Error("upload object unreadable");
    
    // Combine previous records with fresh records, then deduplicate
    const combinedRecords = [...(prev?.records ?? []), ...read.records];
    const { records: deduped, conflictTombstones } = deduplicateRecords(combinedRecords);
    const tombstones = new Set([...(prev?.conflictTombstones ?? []), ...read.conflictTombstones, ...conflictTombstones]);
    
    const lastReceivedAt = rows.length > 0 ? rows[rows.length - 1].received_at : prev?.lastReceivedAt ?? null;
    const lastIds = rows.length > 0 ? rows.filter((r) => r.received_at === lastReceivedAt).map((r) => r.id) : prev?.lastIds ?? [];
    const snapshot: Snapshot = {
      generatedAt: now().toISOString(),
      uploads: (prev?.uploads ?? 0) + fresh.length,
      records: deduped.filter(r => !tombstones.has(dedupKey(r))),
      conflictTombstones: [...tombstones],
      lastReceivedAt,
      lastIds,
      dedupVersion: (prev?.dedupVersion ?? 1) + (opts.rebuild ? 0 : 1),
    };
    const put = await r2Fetch(SNAPSHOT_KEY, {
      method: "PUT",
      body: JSON.stringify(snapshot),
      headers: { "content-type": "application/json" },
    });
    if (!put.ok) throw new Error(`snapshot write failed (${put.status})`);
    cached = null;
    return { uploads: snapshot.uploads, added: fresh.length };
  }

  async function loadCorpus(): Promise<Corpus> {
    if (cached && Date.now() - cached.at < cacheMs) return cached.corpus;
    try {
      const corpus = cloud ? await readCloud() : await readLocal();
      cached = { at: Date.now(), corpus };
      return corpus;
    } catch {
      return { uploads: 0, records: [], unreachable: true, conflictTombstones: [] };
    }
  }

  async function putWaitlist(entry: WaitlistEntry): Promise<boolean> {
    if (!cloud) {
      try {
        await mkdir(opts.localDir, { recursive: true });
        const file = join(opts.localDir, "waitlist.json");
        let list: WaitlistEntry[] = [];
        try {
          const parsed = JSON.parse(await readFile(file, "utf8"));
          if (Array.isArray(parsed)) list = parsed;
        } catch {
          list = [];
        }
        if (!list.some((e) => e.email === entry.email && e.toolSlug === entry.toolSlug)) {
          list.push(entry);
          await writeFile(file, JSON.stringify(list, null, 2));
        }
        return true;
      } catch {
        return false;
      }
    }
    try {
      const res = await doFetch(rest("waitlist"), {
        method: "POST",
        headers: restHeaders({ prefer: "resolution=ignore-duplicates,return=minimal" }),
        body: JSON.stringify({ email: entry.email, tool_slug: entry.toolSlug, created_at: entry.ts }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  return { putUpload, loadCorpus, putWaitlist, writeSnapshot };
}

/** The store the routes and pages use. */
export const uploadStore = createUploadStore({ cloud: cloudConfig(), localDir: join(process.cwd(), "data") });
