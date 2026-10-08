import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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
const capturedAt = "2026-10-04T07:00:00.000Z";

/** Schema-valid records: a corpus normalizer parses stored rows, so a kind-only fixture is not a fixture. */
const lootRow = (over: Record<string, unknown> = {}) => ({
  kind: "loot",
  installId: "install-1",
  capturedAt,
  eventId: "evt-1",
  sourceNpcId: 1234,
  items: [{ itemId: 456, count: 2 }],
  ...over,
});
const questRow = () => ({
  kind: "quest",
  installId: "install-1",
  capturedAt,
  eventId: "evt-2",
  questId: 55,
  title: "Road to Westfall",
  level: 12,
  rewardItemIds: [],
});
const npcRow = () => ({
  kind: "npc_sighting",
  installId: "install-1",
  capturedAt,
  eventId: "evt-3",
  npcId: 1234,
  name: "Forest Spider",
  mapId: 141,
  x: 42.5,
  y: 61,
  level: 60,
  reaction: "hostile" as const,
});
const vendorRow = () => ({
  kind: "vendor",
  installId: "install-1",
  capturedAt,
  eventId: "evt-4",
  vendorNpcId: 7,
  items: [{ itemId: 456, priceCopper: 100 }],
});

const payload = { addonVersion: "0.1.0", records: [lootRow(), npcRow()] };

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
      [`${R2}uploads/a.json`, "GET", () => Response.json({ records: [lootRow(), questRow()] })],
      [`${R2}uploads/b.json`, "GET", () => new Response("{not json")],
    ]);
    const store = createUploadStore({ cloud, localDir: "unused", fetch: fn, now, cacheMs: 60_000 });
    const corpus = await store.loadCorpus();
    expect(corpus).toEqual({ uploads: 2, records: [lootRow(), questRow()], conflictTombstones: [] });

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

  test("a conflict inside one object excludes later copies in other objects", async () => {
    const { fn } = fakeFetch([
      [INDEX, "GET", () => Response.json([{ object_key: "uploads/a.json" }, { object_key: "uploads/b.json" }])],
      [`${R2}uploads/a.json`, "GET", () => Response.json({ records: [lootRow(), lootRow({ sourceNpcId: 99 })] })],
      [`${R2}uploads/b.json`, "GET", () => Response.json({ records: [lootRow()] })],
    ]);
    const corpus = await createUploadStore({ cloud, localDir: "unused", fetch: fn }).loadCorpus();
    expect(corpus.records).toEqual([]);
    expect(corpus.conflictTombstones).toEqual(["install-1|evt-1"]);
  });

  test("a snapshot reader excludes tombstoned rows", async () => {
    const { fn } = fakeFetch([[SNAP, "GET", () => Response.json({ records: [lootRow()], conflictTombstones: ["install-1|evt-1"] })]]);
    expect((await createUploadStore({ cloud, localDir: "unused", fetch: fn }).loadCorpus()).records).toEqual([]);
  });

  test("named records stay private until verified sharing and suppression are connected", async () => {
    const gear = { kind: "gear_snapshot", installId: "install-1", eventId: "gear-1", capturedAt,
      character: "PrivatePlayer", realm: "PrivateRealm", equipped: [{ slot: "head", itemId: 1, itemLevel: 10 }] };
    for (const snapshot of [false, true]) {
      const { fn } = fakeFetch([
        [SNAP, "GET", () => snapshot ? Response.json({ records: [lootRow(), gear] }) : new Response(null, { status: 404 })],
        [INDEX, "GET", () => Response.json([{ object_key: "uploads/a.json" }])],
        [`${R2}uploads/a.json`, "GET", () => Response.json({ records: [lootRow(), gear] })],
      ]);
      expect((await createUploadStore({ cloud, localDir: "unused", fetch: fn }).loadCorpus()).records).toEqual([lootRow()]);
    }
  });

  test("incremental snapshots preserve old and new tombstones", async () => {
    const { fn, calls } = fakeFetch([
      [SNAP, "GET", () => Response.json({ uploads: 1, records: [], conflictTombstones: ["install-1|evt-1"], lastReceivedAt: capturedAt, lastIds: ["old"] })],
      [INDEX, "GET", () => Response.json([{ id: "new", object_key: "uploads/new.json", received_at: "2026-10-05T00:00:00Z" }])],
      [`${R2}uploads/new.json`, "GET", () => Response.json({ records: [lootRow(), lootRow({ eventId: "conflict" }), lootRow({ eventId: "conflict", sourceNpcId: 99 })] })],
      [SNAP, "PUT", () => new Response(null, { status: 200 })],
    ]);
    await createUploadStore({ cloud, localDir: "unused", fetch: fn }).writeSnapshot();
    const snapshot = JSON.parse(calls.find(c => c.method === "PUT")!.body);
    expect(snapshot.records).toEqual([]);
    expect(snapshot.conflictTombstones.sort()).toEqual(["install-1|conflict", "install-1|evt-1"]);
  });

  test("the first snapshot reads every indexed upload and records where it stopped", async () => {
    const { fn, calls } = fakeFetch([
      [SNAP, "GET", () => new Response("missing", { status: 404 })],
      [INDEX, "GET", () => Response.json([
        { id: "a", object_key: "uploads/a.json", received_at: "2026-10-04T07:00:00+00:00" },
        { id: "b", object_key: "uploads/b.json", received_at: "2026-10-04T08:00:00+00:00" },
      ])],
      [`${R2}uploads/a.json`, "GET", () => Response.json({ records: [lootRow()] })],
      [`${R2}uploads/b.json`, "GET", () => Response.json({ records: [questRow()] })],
      [SNAP, "PUT", () => new Response(null, { status: 200 })],
    ]);
    const store = createUploadStore({ cloud, localDir: "unused", fetch: fn, now });
    expect(await store.writeSnapshot()).toEqual({ uploads: 2, added: 2 });
    const put = calls.find((c) => c.method === "PUT")!;
    expect(JSON.parse(put.body)).toEqual({
      generatedAt: "2026-10-04T12:00:00.000Z",
      uploads: 2,
      records: [lootRow(), questRow()],
      conflictTombstones: [],
      lastReceivedAt: "2026-10-04T08:00:00+00:00",
      lastIds: ["b"],
      dedupVersion: 2,
    });
  });

  test("a later snapshot reads only uploads it has not seen", async () => {
    const { fn, calls } = fakeFetch([
      [SNAP, "GET", () => Response.json({
        generatedAt: "x", uploads: 2, records: [lootRow(), questRow()],
        conflictTombstones: [], lastReceivedAt: "2026-10-04T08:00:00+00:00", lastIds: ["b"],
        dedupVersion: 2,
      })],
      [INDEX, "GET", () => Response.json([
        { id: "b", object_key: "uploads/b.json", received_at: "2026-10-04T08:00:00+00:00" },
        { id: "c", object_key: "uploads/c.json", received_at: "2026-10-04T09:00:00+00:00" },
      ])],
      [`${R2}uploads/c.json`, "GET", () => Response.json({ records: [vendorRow()] })],
      [SNAP, "PUT", () => new Response(null, { status: 200 })],
    ]);
    const store = createUploadStore({ cloud, localDir: "unused", fetch: fn, now });
    expect(await store.writeSnapshot()).toEqual({ uploads: 3, added: 1 });
    expect(calls.some((c) => c.url.endsWith("uploads/b.json"))).toBe(false);
    expect(calls.find((c) => c.method === "GET" && c.url.startsWith(INDEX))!.url).toContain("received_at=gte.2026-10-04T08%3A00%3A00%2B00%3A00");
    const put = JSON.parse(calls.find((c) => c.method === "PUT")!.body);
    expect(put.records).toEqual([lootRow(), questRow(), vendorRow()]);
    expect(put.conflictTombstones).toEqual([]);
    expect(put.lastIds).toEqual(["c"]);
    expect(put.dedupVersion).toBe(3);
  });

  test("an unreadable object is not a silent empty corpus and is not cached", async () => {
    const { fn, calls } = fakeFetch([
      [SNAP, "GET", () => new Response("missing", { status: 404 })],
      [INDEX, "GET", () => Response.json([{ object_key: "uploads/a.json" }])],
      [`${R2}uploads/a.json`, "GET", () => new Response("down", { status: 500 })],
    ]);
    const store = createUploadStore({ cloud, localDir: "unused", fetch: fn, now, cacheMs: 60_000 });
    expect(await store.loadCorpus()).toEqual({ uploads: 0, records: [], unreachable: true, conflictTombstones: [] });
    const before = calls.length;
    await store.loadCorpus();
    expect(calls.length).toBeGreaterThan(before);
  });

  test("a failed snapshot read is unreachable, not an empty corpus", async () => {
    const { fn } = fakeFetch([[SNAP, "GET", () => new Response("down", { status: 500 })]]);
    const store = createUploadStore({ cloud, localDir: "unused", fetch: fn, now, cacheMs: 60_000 });
    expect(await store.loadCorpus()).toEqual({ uploads: 0, records: [], unreachable: true, conflictTombstones: [] });
  });

  test("a missed object is not written into the snapshot", async () => {
    const { fn, calls } = fakeFetch([
      [SNAP, "GET", () => new Response("missing", { status: 404 })],
      [INDEX, "GET", () => Response.json([{ id: "a", object_key: "uploads/a.json", received_at: "2026-10-04T07:00:00+00:00" }])],
      [`${R2}uploads/a.json`, "GET", () => new Response("down", { status: 500 })],
      [SNAP, "PUT", () => new Response(null, { status: 200 })],
    ]);
    const store = createUploadStore({ cloud, localDir: "unused", fetch: fn, now });
    await expect(store.writeSnapshot()).rejects.toThrow(/unreadable/);
    expect(calls.some((call) => call.method === "PUT")).toBe(false);
  });

  test("pages read the snapshot in one request when it exists", async () => {
    const { fn, calls } = fakeFetch([
      [SNAP, "GET", () => Response.json({ generatedAt: "x", uploads: 5, records: [lootRow()], conflictTombstones: [], lastReceivedAt: null, lastIds: [], dedupVersion: 1 })],
    ]);
    const store = createUploadStore({ cloud, localDir: "unused", fetch: fn, now });
    expect(await store.loadCorpus()).toEqual({ uploads: 5, records: [lootRow()], conflictTombstones: [] });
    expect(calls).toHaveLength(1);
  });
});

describe("corpus normalization", () => {
  const SNAP = `${R2}snapshots/corpus.json`;
  const INDEX = "https://sb.example/rest/v1/uploads";
  const badRows: unknown[] = [
    { kind: "flying_mounts", installId: "install-1" },
    { ...lootRow(), sourceNpcId: 0, sourceObjectId: undefined },
    { ...lootRow(), capturedAt: "yesterday" },
    "not a record",
  ];

  test("a stored local file contributes only its valid records, and still counts as one upload", async () => {
    const dir = mkdtempSync(join(tmpdir(), "everloot-corpus-"));
    mkdirSync(join(dir, "uploads"));
    writeFileSync(join(dir, "uploads", "u-1.json"), JSON.stringify({ addonVersion: "0.1.0", records: [lootRow(), ...badRows] }));
    const store = createUploadStore({ cloud: null, localDir: dir, now, cacheMs: 0 });

    expect(await store.loadCorpus()).toEqual({ uploads: 1, records: [lootRow()], conflictTombstones: [] });
  });

  test("nested extra fields are stripped from a stored object", async () => {
    const dir = mkdtempSync(join(tmpdir(), "everloot-corpus-"));
    mkdirSync(join(dir, "uploads"));
    const nested = lootRow({ items: [{ itemId: 456, count: 2, smuggle: true }] });
    writeFileSync(join(dir, "uploads", "u-1.json"), JSON.stringify({ addonVersion: "0.1.0", records: [nested] }));
    const store = createUploadStore({ cloud: null, localDir: dir, now, cacheMs: 0 });

    expect(await store.loadCorpus()).toEqual({ uploads: 1, records: [lootRow()], conflictTombstones: [] });
  });

  test("an existing snapshot is normalized on read and stays normalized in the cache", async () => {
    const { fn, calls } = fakeFetch([
      [SNAP, "GET", () => Response.json({
        generatedAt: "x", uploads: 1, records: [lootRow(), ...badRows],
        conflictTombstones: [], lastReceivedAt: null, lastIds: [], dedupVersion: 1,
      })],
    ]);
    const store = createUploadStore({ cloud, localDir: "unused", fetch: fn, now, cacheMs: 60_000 });

    expect(await store.loadCorpus()).toEqual({ uploads: 1, records: [lootRow()], conflictTombstones: [] });
    expect(await store.loadCorpus()).toEqual({ uploads: 1, records: [lootRow()], conflictTombstones: [] });
    expect(calls).toHaveLength(1);
  });

  test("the next snapshot write normalizes the prior records it carries forward", async () => {
    const { fn, calls } = fakeFetch([
      [SNAP, "GET", () => Response.json({
        generatedAt: "x", uploads: 1, records: [lootRow(), ...badRows],
        conflictTombstones: [], lastReceivedAt: "2026-10-04T08:00:00+00:00", lastIds: ["b"], dedupVersion: 2,
      })],
      [INDEX, "GET", () => Response.json([
        { id: "c", object_key: "uploads/c.json", received_at: "2026-10-04T09:00:00+00:00" },
      ])],
      [`${R2}uploads/c.json`, "GET", () => Response.json({ records: [vendorRow(), ...badRows] })],
      [SNAP, "PUT", () => new Response(null, { status: 200 })],
    ]);
    const store = createUploadStore({ cloud, localDir: "unused", fetch: fn, now });

    expect(await store.writeSnapshot()).toEqual({ uploads: 2, added: 1 });
    const put = JSON.parse(calls.find((c) => c.method === "PUT")!.body);
    expect(put.records).toEqual([lootRow(), vendorRow()]);
    expect(put.conflictTombstones).toEqual([]);
  });

  test("a corpus larger than the 2000-row request cap keeps every valid record", async () => {
    const records = Array.from({ length: 2001 }, () => lootRow({ installId: `install-${String(Math.random()).slice(2, 10)}` }));
    const { fn } = fakeFetch([
      [SNAP, "GET", () => Response.json({ generatedAt: "x", uploads: 2001, records, lastReceivedAt: null, lastIds: [] })],
    ]);
    const store = createUploadStore({ cloud, localDir: "unused", fetch: fn, now, cacheMs: 0 });

    const corpus = await store.loadCorpus();
    expect(corpus.records).toHaveLength(2001);
  });

  test("a snapshot with no records array is unreachable, not an empty corpus", async () => {
    const { fn } = fakeFetch([
      [SNAP, "GET", () => Response.json({ generatedAt: "x", uploads: 3, conflictTombstones: [], lastReceivedAt: null, lastIds: [], dedupVersion: 1 })],
    ]);
    const store = createUploadStore({ cloud, localDir: "unused", fetch: fn, now, cacheMs: 0 });

    expect(await store.loadCorpus()).toEqual({ uploads: 0, records: [], unreachable: true, conflictTombstones: [] });
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
    expect(await store.loadCorpus()).toEqual({ uploads: 1, records: payload.records, conflictTombstones: [] });
  });

  test("a missing local directory is empty, not unreachable", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "everloot-store-")), "missing");
    const store = createUploadStore({ cloud: null, localDir: dir, now, cacheMs: 0 });
    expect(await store.loadCorpus()).toEqual({ uploads: 0, records: [] });
  });
});
