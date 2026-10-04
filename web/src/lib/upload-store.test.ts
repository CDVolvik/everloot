import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { cloudConfig, createUploadStore, type CloudConfig } from "./upload-store.js";

const cloud: CloudConfig = {
  r2AccountId: "acct",
  r2AccessKeyId: "AKID",
  r2SecretAccessKey: "secret",
  r2Bucket: "everloot-uploads",
  supabaseUrl: "https://sb.example",
  supabaseServiceKey: "svc",
};

interface Call { url: string; method: string; headers: Headers; body: string }

/** A fetch that records every call and answers from a list of [url-prefix, method, response] routes. */
function fakeFetch(routes: Array<[string, string, () => Response]>) {
  const calls: Call[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    calls.push({ url: req.url, method: req.method, headers: req.headers, body: await req.text() });
    const hit = routes.find(([prefix, method]) => req.url.startsWith(prefix) && req.method === method);
    return hit ? hit[2]() : new Response("no route", { status: 404 });
  }) as typeof fetch;
  return { fn, calls };
}

const R2 = "https://acct.r2.cloudflarestorage.com/everloot-uploads/";
const now = () => new Date("2026-10-04T12:00:00Z");
const payload = { records: [{ kind: "loot", installId: "install-1" }, { kind: "npc_sighting", installId: "install-1" }] };

describe("upload store, cloud mode", () => {
  test("a stored upload is a signed R2 object plus one index row", async () => {
    const { fn, calls } = fakeFetch([
      [R2, "PUT", () => new Response(null, { status: 200 })],
      ["https://sb.example/rest/v1/uploads", "POST", () => new Response(null, { status: 201 })],
    ]);
    const store = createUploadStore({ cloud, localDir: "unused", fetch: fn, now });
    expect(await store.putUpload("u-1", "install-1", payload)).toBe(true);

    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe(`${R2}uploads/2026-10-04/u-1.json`);
    expect(calls[0].headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 /);
    expect(JSON.parse(calls[0].body)).toEqual(payload);

    expect(calls[1].headers.get("apikey")).toBe("svc");
    expect(JSON.parse(calls[1].body)).toEqual({
      id: "u-1",
      install_id: "install-1",
      record_count: 2,
      bytes: JSON.stringify(payload).length,
      object_key: "uploads/2026-10-04/u-1.json",
    });
  });

  test("an R2 failure is not persisted and writes no index row", async () => {
    const { fn, calls } = fakeFetch([[R2, "PUT", () => new Response("down", { status: 500 })]]);
    const store = createUploadStore({ cloud, localDir: "unused", fetch: fn, now });
    expect(await store.putUpload("u-1", "install-1", payload)).toBe(false);
    expect(calls).toHaveLength(1);
  });

  test("an index failure is not persisted, because the reader only sees indexed uploads", async () => {
    const { fn } = fakeFetch([
      [R2, "PUT", () => new Response(null, { status: 200 })],
      ["https://sb.example/rest/v1/uploads", "POST", () => new Response("bad", { status: 400 })],
    ]);
    const store = createUploadStore({ cloud, localDir: "unused", fetch: fn, now });
    expect(await store.putUpload("u-1", "install-1", payload)).toBe(false);
  });

  test("the corpus reads indexed objects, skips a corrupt one, and caches", async () => {
    const { fn, calls } = fakeFetch([
      ["https://sb.example/rest/v1/uploads", "GET", () => Response.json([{ object_key: "uploads/a.json" }, { object_key: "uploads/b.json" }])],
      [`${R2}uploads/a.json`, "GET", () => Response.json({ records: [{ kind: "loot" }, { kind: "quest" }] })],
      [`${R2}uploads/b.json`, "GET", () => new Response("{not json")],
    ]);
    const store = createUploadStore({ cloud, localDir: "unused", fetch: fn, now, cacheMs: 60_000 });
    const corpus = await store.loadCorpus();
    expect(corpus).toEqual({ uploads: 2, records: [{ kind: "loot" }, { kind: "quest" }] });

    const before = calls.length;
    await store.loadCorpus();
    expect(calls.length).toBe(before);
  });

  test("a waitlist signup is one row, and a repeat is ignored by the table", async () => {
    const { fn, calls } = fakeFetch([["https://sb.example/rest/v1/waitlist", "POST", () => new Response(null, { status: 201 })]]);
    const store = createUploadStore({ cloud, localDir: "unused", fetch: fn, now });
    expect(await store.putWaitlist({ toolSlug: "auctions", email: "a@b.co", ts: "2026-10-04T12:00:00Z" })).toBe(true);
    expect(calls[0].headers.get("prefer")).toContain("resolution=ignore-duplicates");
    expect(JSON.parse(calls[0].body)).toEqual({ email: "a@b.co", tool_slug: "auctions", created_at: "2026-10-04T12:00:00Z" });
  });
});

describe("corpus snapshot", () => {
  const SNAP = `${R2}snapshots/corpus.json`;
  const INDEX = "https://sb.example/rest/v1/uploads";

  test("the first snapshot reads every indexed upload and records where it stopped", async () => {
    const { fn, calls } = fakeFetch([
      [SNAP, "GET", () => new Response("missing", { status: 404 })],
      [INDEX, "GET", () => Response.json([
        { id: "a", object_key: "uploads/a.json", received_at: "2026-10-04T07:00:00+00:00" },
        { id: "b", object_key: "uploads/b.json", received_at: "2026-10-04T08:00:00+00:00" },
      ])],
      [`${R2}uploads/a.json`, "GET", () => Response.json({ records: [{ kind: "loot" }] })],
      [`${R2}uploads/b.json`, "GET", () => Response.json({ records: [{ kind: "quest" }] })],
      [SNAP, "PUT", () => new Response(null, { status: 200 })],
    ]);
    const store = createUploadStore({ cloud, localDir: "unused", fetch: fn, now });
    expect(await store.writeSnapshot()).toEqual({ uploads: 2, added: 2 });
    const put = calls.find((c) => c.method === "PUT")!;
    expect(JSON.parse(put.body)).toEqual({
      generatedAt: "2026-10-04T12:00:00.000Z",
      uploads: 2,
      records: [{ kind: "loot" }, { kind: "quest" }],
      lastReceivedAt: "2026-10-04T08:00:00+00:00",
      lastIds: ["b"],
    });
  });

  test("a later snapshot reads only uploads it has not seen", async () => {
    const { fn, calls } = fakeFetch([
      [SNAP, "GET", () => Response.json({
        generatedAt: "x", uploads: 2, records: [{ kind: "loot" }, { kind: "quest" }],
        lastReceivedAt: "2026-10-04T08:00:00+00:00", lastIds: ["b"],
      })],
      [INDEX, "GET", () => Response.json([
        { id: "b", object_key: "uploads/b.json", received_at: "2026-10-04T08:00:00+00:00" },
        { id: "c", object_key: "uploads/c.json", received_at: "2026-10-04T09:00:00+00:00" },
      ])],
      [`${R2}uploads/c.json`, "GET", () => Response.json({ records: [{ kind: "vendor" }] })],
      [SNAP, "PUT", () => new Response(null, { status: 200 })],
    ]);
    const store = createUploadStore({ cloud, localDir: "unused", fetch: fn, now });
    expect(await store.writeSnapshot()).toEqual({ uploads: 3, added: 1 });
    expect(calls.some((c) => c.url.endsWith("uploads/b.json"))).toBe(false);
    expect(calls.find((c) => c.method === "GET" && c.url.startsWith(INDEX))!.url).toContain("received_at=gte.2026-10-04T08%3A00%3A00%2B00%3A00");
    const put = JSON.parse(calls.find((c) => c.method === "PUT")!.body);
    expect(put.records).toEqual([{ kind: "loot" }, { kind: "quest" }, { kind: "vendor" }]);
    expect(put.lastIds).toEqual(["c"]);
  });

  test("pages read the snapshot in one request when it exists", async () => {
    const { fn, calls } = fakeFetch([
      [SNAP, "GET", () => Response.json({ generatedAt: "x", uploads: 5, records: [{ kind: "loot" }], lastReceivedAt: null, lastIds: [] })],
    ]);
    const store = createUploadStore({ cloud, localDir: "unused", fetch: fn, now });
    expect(await store.loadCorpus()).toEqual({ uploads: 5, records: [{ kind: "loot" }] });
    expect(calls).toHaveLength(1);
  });
});

describe("upload store, local mode", () => {
  test("cloud mode needs every variable", () => {
    expect(cloudConfig({})).toBeNull();
    expect(cloudConfig({
      R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "b", R2_SECRET_ACCESS_KEY: "c", R2_BUCKET: "d",
      SUPABASE_URL: "https://e", SUPABASE_SERVICE_ROLE_KEY: "f",
    })).toEqual({
      r2AccountId: "a", r2AccessKeyId: "b", r2SecretAccessKey: "c", r2Bucket: "d",
      supabaseUrl: "https://e", supabaseServiceKey: "f",
    });
    expect(cloudConfig({ R2_ACCOUNT_ID: "a", SUPABASE_URL: "https://e" })).toBeNull();
  });

  test("without cloud variables an upload round-trips through the local folder", async () => {
    const dir = mkdtempSync(join(tmpdir(), "everloot-store-"));
    const store = createUploadStore({ cloud: null, localDir: dir, now, cacheMs: 0 });
    expect(await store.putUpload("u-1", "install-1", payload)).toBe(true);
    expect(await store.loadCorpus()).toEqual({ uploads: 1, records: payload.records });
  });
});
