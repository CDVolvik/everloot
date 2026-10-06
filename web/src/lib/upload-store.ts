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
}

export const STORAGE_UNREACHABLE = "Storage unreachable. These figures are unrecorded, not zero.";

interface Snapshot extends Corpus {
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
  return parseRecords(rawRecordsOf(payload)).records;
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
    return { uploads: files.length, records };
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

  async function readObjects(keys: string[]): Promise<{ records: IntakeRecord[]; missed: boolean }> {
    const records: IntakeRecord[] = [];
    let missed = false;
    for (let i = 0; i < keys.length; i += PARALLEL_READS) {
      const batch = await Promise.all(keys.slice(i, i + PARALLEL_READS).map(async (key) => {
        try {
          const res = await r2Fetch(key, { method: "GET" });
          if (!res.ok) return { records: [] as IntakeRecord[], missed: true };
          try {
            return { records: normalizedRecordsOf(JSON.parse(await res.text())), missed: false };
          } catch {
            return { records: [] as IntakeRecord[], missed: false };
          }
        } catch {
          return { records: [] as IntakeRecord[], missed: true };
        }
      }));
      for (const row of batch) {
        if (row.missed) missed = true;
        else records.push(...row.records);
      }
    }
    return { records, missed };
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
    return {
      generatedAt: parsed.generatedAt ?? "",
      uploads: typeof parsed.uploads === "number" ? parsed.uploads : 0,
      records: parseRecords(parsed.records).records,
      lastReceivedAt: parsed.lastReceivedAt ?? null,
      lastIds: Array.isArray(parsed.lastIds) ? parsed.lastIds : [],
    };
  }

  async function readCloud(): Promise<Corpus> {
    const snapshot = await readSnapshot();
    if (snapshot) return { uploads: snapshot.uploads, records: snapshot.records };
    const keys = (await listIndex()).map((r) => r.object_key);
    const read = await readObjects(keys);
    if (read.missed) throw new Error("upload object unreadable");
    return { uploads: keys.length, records: read.records };
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
    const records = [...(prev?.records ?? []), ...read.records];
    const lastReceivedAt = rows.length > 0 ? rows[rows.length - 1].received_at : prev?.lastReceivedAt ?? null;
    const lastIds = rows.length > 0 ? rows.filter((r) => r.received_at === lastReceivedAt).map((r) => r.id) : prev?.lastIds ?? [];
    const snapshot: Snapshot = {
      generatedAt: now().toISOString(),
      uploads: (prev?.uploads ?? 0) + fresh.length,
      records,
      lastReceivedAt,
      lastIds,
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
      return { uploads: 0, records: [], unreachable: true };
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
