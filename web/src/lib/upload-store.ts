import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AwsClient } from "aws4fetch";
import { parseRecords, type CanonicalUpload, type IntakeRecord } from "./intake";
import { mergeCorpus, mergeCorpusBatches, publicRecords, type CorpusState } from "../../../kb/src/corpus";
import { createSharingStore } from "./sharing-store";

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
  legacyRecords?: number;
  /**
   * When these records were current: the snapshot's build time, or the read time for a live read.
   * Null when a snapshot carries no valid time — its age is then unrecorded, never "now".
   */
  dataAsOf?: string | null;
}

interface RawCorpus { uploads: number; state: CorpusState; unreachable?: boolean; dataAsOf: string | null }

function validTime(value: string): string | null {
  return value && Number.isFinite(Date.parse(value)) ? value : null;
}

export interface SnapshotHealth {
  status: "fresh" | "stale" | "missing" | "unavailable" | "local";
  updatedAt: string | null;
  ageSeconds: number | null;
}

export const STORAGE_UNREACHABLE = "Storage unreachable. These figures are unrecorded, not zero.";

interface Snapshot extends Corpus {
  conflictTombstones?: string[];
  corpusState?: CorpusState;
  seenUploadIds?: string[];
  etag?: string;
  generatedAt: string;
  /** received_at of the newest upload included, and the ids sharing it, so ties are not re-read. */
  lastReceivedAt: string | null;
  lastIds: string[];
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

/** Cloud mode requires every variable. Production rejects incomplete configuration. */
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
export function createUploadStore(opts: {
  cloud: CloudConfig | null;
  localDir: string;
  fetch?: typeof fetch;
  now?: () => Date;
  cacheMs?: number;
  /** Recheck current publication authority on EVERY read, including cache hits. */
  publication?: (state: CorpusState) => Promise<IntakeRecord[]>;
}) {
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? (() => new Date());
  const cacheMs = opts.cacheMs ?? 5 * 60 * 1000;
  let cached: { at: number; corpus: RawCorpus } | null = null;

  const cloud = opts.cloud;
  const unavailable = !cloud && process.env.NODE_ENV === "production";
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

  async function putUpload(uploadId: string, installId: string, payload: CanonicalUpload, publicationGrants: string[] = []): Promise<boolean> {
    if (unavailable) return false;
    const body = JSON.stringify(publicationGrants.length ? { ...payload, publicationGrants } : payload);
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

  function grantsOf(payload: unknown): string[] {
    const grants = (payload as { publicationGrants?: unknown })?.publicationGrants;
    return Array.isArray(grants) ? grants.filter((g) => typeof g === "string" && /^[a-f0-9]{64}$/.test(g)) : [];
  }

  async function readLocal(): Promise<RawCorpus> {
    const dir = join(opts.localDir, "uploads");
    let files: string[] = [];
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return { uploads: 0, state: mergeCorpus(undefined, []), dataAsOf: now().toISOString() };
      return { uploads: 0, state: mergeCorpus(undefined, []), unreachable: true, dataAsOf: null };
    }
    const batches: { raw: unknown[]; grants: string[] }[] = [];
    for (const f of files) {
      try {
        const payload = JSON.parse(await readFile(join(dir, f), "utf8"));
        batches.push({ raw: rawRecordsOf(payload), grants: grantsOf(payload) });
      } catch {
        continue; // a corrupt file never breaks a rollup
      }
    }
    const state = mergeCorpusBatches(undefined, batches);
    return { uploads: files.length, state, dataAsOf: now().toISOString() };
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

  async function readObjects(keys: string[], previous?: CorpusState): Promise<{ state: CorpusState; missed: boolean }> {
    const batches: { raw: unknown[]; grants: string[] }[] = [];
    let missed = false;
    for (let i = 0; i < keys.length; i += PARALLEL_READS) {
      const batch = await Promise.all(keys.slice(i, i + PARALLEL_READS).map(async (key) => {
        try {
          const res = await r2Fetch(key, { method: "GET" });
          if (!res.ok) return { payload: null, missed: true };
          try {
            return { payload: JSON.parse(await res.text()) as unknown, missed: false };
          } catch {
            return { payload: null, missed: false };
          }
        } catch {
          return { payload: null, missed: true };
        }
      }));
      for (const row of batch) {
        if (row.missed) missed = true;
        else batches.push({ raw: rawRecordsOf(row.payload), grants: grantsOf(row.payload) });
      }
    }
    return { state: mergeCorpusBatches(previous ?? mergeCorpus(undefined, []), batches), missed };
  }

  async function readSnapshot(): Promise<Snapshot | null> {
    // Compression can turn the object's strong ETag into a weak response validator.
    const res = await r2Fetch(SNAPSHOT_KEY, { method: "GET", headers: { "accept-encoding": "identity" } });
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
    return {
      corpusState: parsed.corpusState,
      conflictTombstones: parsed.conflictTombstones,
      seenUploadIds: parsed.seenUploadIds,
      etag: res.headers.get("etag") ?? undefined,
      generatedAt: parsed.generatedAt ?? "",
      uploads: typeof parsed.uploads === "number" ? parsed.uploads : 0,
      records: parseRecords(parsed.records).records,
      lastReceivedAt: parsed.lastReceivedAt ?? null,
      lastIds: Array.isArray(parsed.lastIds) ? parsed.lastIds : [],
    };
  }

  function stateOf(snapshot: Snapshot): CorpusState {
    const state = snapshot.corpusState;
    if (!state) {
      // The first recovery deployment used pipe-delimited conflict identities.
      // Migrate unambiguous keys; refuse ambiguous ones instead of resurrecting data.
      const conflicts = (snapshot.conflictTombstones ?? []).map(key => {
        const parts = typeof key === "string" ? key.split("|") : [];
        if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error("Legacy conflicts need a reviewed migration");
        return JSON.stringify(parts);
      });
      return mergeCorpus({ version: 1, events: [], conflicts, legacyRecords: 0 }, snapshot.records);
    }
    if (state.version !== 1 || !Array.isArray(state.events) || !Array.isArray(state.conflicts) ||
        !state.conflicts.every((k) => typeof k === "string") || !Number.isSafeInteger(state.legacyRecords) || state.legacyRecords < 0) {
      throw new Error("snapshot replay state is invalid");
    }
    const start: CorpusState = { version: 1, events: [], conflicts: state.conflicts, legacyRecords: state.legacyRecords };
    const batches = state.events.map((event) => {
      if (!event?.record || !event.record.eventId || !Array.isArray(event.grants)) throw new Error("snapshot event is invalid");
      return { raw: [event.record], grants: grantsOf({ publicationGrants: event.grants }) };
    });
    return mergeCorpusBatches(start, batches);
  }

  async function readCloud(): Promise<RawCorpus> {
    const snapshot = await readSnapshot();
    if (snapshot) return { uploads: snapshot.uploads, state: stateOf(snapshot), dataAsOf: validTime(snapshot.generatedAt) };
    const readAt = now().toISOString();
    const keys = (await listIndex()).map((r) => r.object_key);
    const read = await readObjects(keys);
    if (read.missed) throw new Error("upload object unreadable");
    return { uploads: keys.length, state: read.state, dataAsOf: readAt };
  }

  /**
   * Extend the snapshot with uploads newer than its last one (cron). `rebuild` starts from empty,
   * which is how a deleted upload leaves the snapshot.
   */
  async function writeSnapshot(opts: { rebuild?: boolean } = {}): Promise<{ uploads: number; added: number }> {
    if (!cloud) throw new Error("snapshots need the cloud store");
    const current = await readSnapshot();
    if (current && !current.etag) throw new Error("snapshot has no ETag: cannot safely update it");
    if (current?.etag?.startsWith("W/")) throw new Error("snapshot has a weak ETag: cannot safely update it");
    const prev = opts.rebuild ? null : current;
    const seen = prev?.seenUploadIds ? new Set(prev.seenUploadIds) : null;
    const rows = await listIndex(seen ? undefined : prev?.lastReceivedAt ?? undefined);
    const fresh = rows.filter((r) => seen ? !seen.has(r.id) : !(prev && r.received_at === prev.lastReceivedAt && prev.lastIds.includes(r.id)));
    // Rebuilds preserve known conflict tombstones, including after a raw file is removed.
    const start = prev ? stateOf(prev) : current
      ? { ...mergeCorpus(undefined, []), conflicts: stateOf(current).conflicts } : undefined;
    const read = await readObjects(fresh.map((r) => r.object_key), start);
    if (read.missed) throw new Error("upload object unreadable");
    const records = publicRecords(read.state);
    const lastReceivedAt = rows.length > 0 ? rows[rows.length - 1].received_at : prev?.lastReceivedAt ?? null;
    const lastIds = rows.length > 0 ? rows.filter((r) => r.received_at === lastReceivedAt).map((r) => r.id) : prev?.lastIds ?? [];
    const snapshot: Snapshot = {
      generatedAt: now().toISOString(),
      uploads: (prev?.uploads ?? 0) + fresh.length,
      records,
      corpusState: read.state,
      // A legacy watermark query covers only a suffix of the index. Stay in that
      // mode until a full rebuild supplies the complete upload inventory.
      seenUploadIds: seen || !prev ? [...new Set([...(prev?.seenUploadIds ?? []), ...rows.map((r) => r.id)])].sort() : undefined,
      lastReceivedAt,
      lastIds,
    };
    const put = await r2Fetch(SNAPSHOT_KEY, {
      method: "PUT",
      body: JSON.stringify(snapshot),
      // R2 supports conditional PutObject; a race fails instead of losing tombstones.
      // https://developers.cloudflare.com/r2/api/s3/api/
      headers: { "content-type": "application/json", ...(current ? { "if-match": current.etag! } : { "if-none-match": "*" }) },
    });
    if (!put.ok) throw new Error(`snapshot write failed (${put.status})`);
    cached = null;
    return { uploads: snapshot.uploads, added: fresh.length };
  }

  async function loadCorpus(): Promise<Corpus> {
    try {
      if (unavailable) throw new Error("Production storage is not configured");
      const corpus = cached && Date.now() - cached.at < cacheMs
        ? cached.corpus : cloud ? await readCloud() : await readLocal();
      if (corpus.unreachable) throw new Error("corpus unreachable");
      cached = { at: Date.now(), corpus };
      const records = opts.publication ? await opts.publication(corpus.state) : publicRecords(corpus.state);
      return {
        uploads: corpus.uploads,
        records,
        ...(corpus.state.legacyRecords ? { legacyRecords: corpus.state.legacyRecords } : {}),
        dataAsOf: corpus.dataAsOf,
      };
    } catch {
      return { uploads: 0, records: [], unreachable: true };
    }
  }

  async function putWaitlist(entry: WaitlistEntry): Promise<boolean> {
    if (unavailable) return false;
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

  async function snapshotHealth(): Promise<SnapshotHealth> {
    const unknown = { updatedAt: null, ageSeconds: null };
    if (unavailable) return { status: "unavailable", ...unknown };
    if (!cloud) return { status: "local", ...unknown };
    try {
      // Metadata only: never expose raw snapshot contents, keys or credentials.
      const res = await r2Fetch(SNAPSHOT_KEY, { method: "HEAD", signal: AbortSignal.timeout(10_000) });
      if (res.status === 404) return { status: "missing", ...unknown };
      if (!res.ok) return { status: "unavailable", ...unknown };
      const modified = Date.parse(res.headers.get("last-modified") ?? "");
      const age = now().getTime() - modified;
      if (!Number.isFinite(age) || age < -30_000) return { status: "unavailable", ...unknown };
      return { status: age > 30 * 60_000 ? "stale" : "fresh", updatedAt: new Date(modified).toISOString(), ageSeconds: Math.max(0, Math.floor(age / 1000)) };
    } catch { return { status: "unavailable", ...unknown }; }
  }

  return { putUpload, loadCorpus, putWaitlist, writeSnapshot, snapshotHealth };
}

/** The store the routes and pages use. */
const configuredCloud = cloudConfig();
const localDir = join(process.cwd(), "data");
export const sharingStore = createSharingStore({ cloud: configuredCloud, localDir });
export const uploadStore = createUploadStore({ cloud: configuredCloud, localDir, publication: sharingStore.publish });
