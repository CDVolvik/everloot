import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createUploadStore, type CloudConfig } from "./upload-store.js";
import { lootWindowsFromRecords } from "./rollups.js";

/**
 * One mixed submission, all the way through: route parsing, the real store, the corpus readers and
 * the rollup that publishes the number. The point is that a row no schema accepted can never become
 * a published fact, whichever storage path it arrived through.
 */

const cloud: CloudConfig = {
  r2AccountId: "acct",
  r2AccessKeyId: "AKID",
  r2SecretAccessKey: "secret",
  r2Bucket: "everloot-uploads",
  supabaseUrl: "https://sb.example",
  supabaseServiceKey: "svc",
};
const R2 = "https://acct.r2.cloudflarestorage.com/everloot-uploads/";
const now = () => new Date("2026-10-05T12:00:00Z");
const capturedAt = "2026-10-05T00:00:00.000Z";

const goodLoot = {
  kind: "loot",
  installId: "install-1234",
  capturedAt,
  sourceNpcId: 123,
  items: [{ itemId: 456, count: 1 }],
};
/** Same install, a source with no id, so the loot refinement refuses it. */
const rejectedLoot = { ...goodLoot, sourceNpcId: 0, sourceObjectId: undefined };
const mixedPayload = { addonVersion: "0.1.0", records: [goodLoot, rejectedLoot] };

function jsonRequest(payload: unknown): Request {
  return new Request("https://everloot.app/api/intake", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/** Load the route with a chosen store as its singleton, so the real store code is what runs. */
async function postWith(store: unknown) {
  vi.resetModules();
  vi.doMock("@/lib/upload-store", () => ({ uploadStore: store }));
  const { POST } = await import("../app/api/intake/route.js");
  return POST;
}

beforeEach(() => {
  vi.doUnmock("@/lib/upload-store");
});

describe("intake through the store into published facts", () => {
  test("local: one valid row is stored, read back, and becomes one loot window", async () => {
    const dir = mkdtempSync(join(tmpdir(), "everloot-intake-"));
    const store = createUploadStore({ cloud: null, localDir: dir, now, cacheMs: 0 });
    const POST = await postWith(store);

    const response = await POST(jsonRequest(mixedPayload));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, persisted: true, accepted: [{ index: 0, kind: "loot" }] });

    const files = readdirSync(join(dir, "uploads"));
    expect(files).toHaveLength(1);
    expect(JSON.parse(readFileSync(join(dir, "uploads", files[0]), "utf8"))).toEqual({
      addonVersion: "0.1.0",
      records: [goodLoot],
    });

    const corpus = await store.loadCorpus();
    expect(corpus.records).toEqual([goodLoot]);
    expect(corpus.unreachable).not.toBe(true);
    expect(lootWindowsFromRecords(corpus.records)).toEqual([
      { installId: "install-1234", sourceNpcId: 123, items: [{ itemId: 456, count: 1 }] },
    ]);
  });

  test("cloud: the snapshot the cron writes holds only the accepted row, and serves it back", async () => {
    const stored: Record<string, string> = {};
    let snapshotBody = "";
    const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      const url = req.url;
      if (req.method === "PUT" && url.startsWith(`${R2}uploads/`)) {
        stored[url] = await req.text();
        return new Response(null, { status: 200 });
      }
      if (req.method === "POST" && url.startsWith("https://sb.example/rest/v1/uploads")) {
        return new Response(null, { status: 201 });
      }
      if (req.method === "PUT" && url === `${R2}snapshots/corpus.json`) {
        snapshotBody = await req.text();
        return new Response(null, { status: 200 });
      }
      if (req.method === "GET" && url === `${R2}snapshots/corpus.json`) {
        return snapshotBody ? new Response(snapshotBody) : new Response("missing", { status: 404 });
      }
      if (req.method === "GET" && url.startsWith("https://sb.example/rest/v1/uploads")) {
        return Response.json([
          { id: "u-1", object_key: "uploads/2026-10-05/u-1.json", received_at: "2026-10-05T07:00:00+00:00" },
        ]);
      }
      if (req.method === "GET" && url.startsWith(`${R2}uploads/`)) {
        const body = Object.values(stored)[0];
        return body ? new Response(body) : new Response("missing", { status: 404 });
      }
      return new Response("no route", { status: 404 });
    }) as typeof fetch;

    const writer = createUploadStore({ cloud, localDir: "unused", fetch: fn, now, cacheMs: 0 });
    const POST = await postWith(writer);
    expect((await POST(jsonRequest(mixedPayload))).status).toBe(200);
    expect(Object.values(stored).map((body) => JSON.parse(body))).toEqual([
      { addonVersion: "0.1.0", records: [goodLoot] },
    ]);

    expect(await writer.writeSnapshot()).toEqual({ uploads: 1, added: 1 });
    expect(JSON.parse(snapshotBody).records).toEqual([goodLoot]);

    const reader = createUploadStore({ cloud, localDir: "unused", fetch: fn, now, cacheMs: 0 });
    const corpus = await reader.loadCorpus();
    expect(corpus).toEqual({ uploads: 1, records: [goodLoot] });
    expect(lootWindowsFromRecords(corpus.records)).toHaveLength(1);
  });
});