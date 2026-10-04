import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AwsClient } from "aws4fetch";

/**
 * Where uploads and waitlist signups live.
 * Cloud: the raw upload is an R2 object (cheap, the record of truth) and Supabase holds one index
 * row per upload plus the waitlist. Every rollup can be rebuilt from the R2 objects.
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
  records: unknown[];
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

function recordsOf(payload: unknown): unknown[] {
  const records = (payload as { records?: unknown })?.records;
  return Array.isArray(records) ? records : [];
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

  async function putUpload(uploadId: string, installId: string, payload: unknown): Promise<boolean> {
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
          record_count: recordsOf(payload).length,
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
    } catch {
      return { uploads: 0, records: [] };
    }
    const records: unknown[] = [];
    for (const f of files) {
      try {
        records.push(...recordsOf(JSON.parse(await readFile(join(dir, f), "utf8"))));
      } catch {
        continue; // a corrupt file never breaks a rollup
      }
    }
    return { uploads: files.length, records };
  }

  async function readCloud(): Promise<Corpus> {
    const keys: string[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const res = await doFetch(rest(`uploads?select=object_key&order=received_at.asc&limit=${PAGE}&offset=${offset}`), {
        headers: restHeaders(),
      });
      if (!res.ok) throw new Error(`upload index read failed (${res.status})`);
      const rows = (await res.json()) as Array<{ object_key: string }>;
      keys.push(...rows.map((r) => r.object_key));
      if (rows.length < PAGE) break;
    }
    const records: unknown[] = [];
    for (let i = 0; i < keys.length; i += PARALLEL_READS) {
      const batch = await Promise.all(keys.slice(i, i + PARALLEL_READS).map(async (key) => {
        try {
          const res = await r2Fetch(key, { method: "GET" });
          return res.ok ? recordsOf(JSON.parse(await res.text())) : [];
        } catch {
          return [];
        }
      }));
      for (const rows of batch) records.push(...rows);
    }
    return { uploads: keys.length, records };
  }

  async function loadCorpus(): Promise<Corpus> {
    if (cached && Date.now() - cached.at < cacheMs) return cached.corpus;
    const corpus = cloud ? await readCloud() : await readLocal();
    cached = { at: Date.now(), corpus };
    return corpus;
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

  return { putUpload, loadCorpus, putWaitlist };
}

/** The store the routes and pages use. */
export const uploadStore = createUploadStore({ cloud: cloudConfig(), localDir: join(process.cwd(), "data") });
