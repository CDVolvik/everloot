import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { openDb } from "../src/db.js";
import { replaceSourceRows, type EntityInput } from "../src/entities.js";
import {
  SERVER_INSTRUCTIONS,
  SERVER_NAME,
  SERVER_VERSION,
  UPLOADS_UNSET,
  createKnowledgeServer,
  fromUploads,
  handleGetByName,
  handleGetEntity,
  handleSearch,
} from "../src/mcp-server.js";
import { CREDIT_LINE, MCP_CREDIT } from "../src/attribution.js";

const row = (extId: string, name: string, body = "", extra: Partial<EntityInput> = {}): EntityInput => ({
  kind: "lore_page",
  extId,
  name,
  body,
  gameVersion: "lore",
  sourceUrl: `https://example.test/${extId}`,
  retrievedAt: "2023-11-13",
  ...extra,
});

async function seed() {
  const db = openDb(":memory:");
  await replaceSourceRows(db, "curated", ["lore_page", "item"], [
    row("1", "Thunderfury", "Warchief Thrall once held Thunderfury aloft."),
    row("2", "Thunderfury, Blessed Blade", "A sword.", { kind: "item", gameVersion: "retail" }),
  ]);
  return db;
}

test("search handler answers questions and shows provenance", async () => {
  const text = handleSearch(await seed(), { query: "where is Thunderfury", limit: 8 });
  expect(text).toContain("Thunderfury");
  expect(text).toContain("https://example.test/1");
  expect(text).toContain("CC-BY-SA-4.0");
});

test("search handler says so when nothing matches", async () => {
  expect(handleSearch(await seed(), { query: "xyznothinghere", limit: 8 })).toContain("No matches");
});

test("get_entity handler returns the row or names the missing id", async () => {
  const db = await seed();
  const [first] = (await import("../src/search.js")).search(db, "Thunderfury");
  expect(handleGetEntity(db, { id: first.id })).toContain("Thunderfury");
  expect(handleGetEntity(db, { id: -1 })).toContain("-1");
});

test("get_by_name handler matches exactly and suggests search otherwise", async () => {
  const db = await seed();
  expect(handleGetByName(db, { name: "thunderfury" })).toContain("[lore_page/lore] Thunderfury");
  expect(handleGetByName(db, { name: "Thunderfury", kind: "npc" })).toContain("search_knowledge");
});

test("unset uploads are not an empty corpus", () => {
  const prev = process.env.EVERLOOT_UPLOADS;
  try {
    delete process.env.EVERLOOT_UPLOADS;
    expect(fromUploads(() => { throw new Error("renderer ran"); })).toBe(UPLOADS_UNSET);
    process.env.EVERLOOT_UPLOADS = "   ";
    expect(fromUploads(() => { throw new Error("renderer ran"); })).toBe(UPLOADS_UNSET);
  } finally {
    if (prev === undefined) delete process.env.EVERLOOT_UPLOADS;
    else process.env.EVERLOOT_UPLOADS = prev;
  }
});

test("an empty uploads directory is a real empty corpus", () => {
  const prev = process.env.EVERLOOT_UPLOADS;
  const dir = mkdtempSync(join(tmpdir(), "everloot-uploads-"));
  try {
    process.env.EVERLOOT_UPLOADS = dir;
    expect(fromUploads((records) => `records:${records.length}`)).toBe("records:0");
  } finally {
    if (prev === undefined) delete process.env.EVERLOOT_UPLOADS;
    else process.env.EVERLOOT_UPLOADS = prev;
  }
});

test("MCP reads the current sanitized public corpus without caching named grants", async () => {
  vi.stubEnv("EVERLOOT_PUBLIC_CORPUS_URL", "https://everloot.example/api/corpus/public");
  const gold = { kind: "gold_snapshot", installId: "install-one", eventId: "epoch:1",
    capturedAt: "2026-10-07T00:00:00Z", realm: "Moon Guard", character: "Thrall", currentCopper: 10, peakCopper: 10 };
  const send = vi.fn().mockResolvedValueOnce(Response.json({ ok: true, records: [gold] }))
    .mockResolvedValueOnce(Response.json({ ok: true, records: [] }))
    .mockResolvedValueOnce(Response.json({ ok: false }, { status: 503 }));
  vi.stubGlobal("fetch", send);
  try {
    const [answer] = (await fromUploads((records) => JSON.stringify(records))).split("\n");
    expect(JSON.parse(answer!)).toEqual([gold]);
    expect(await fromUploads((records) => `records:${records.length}`)).toBe(`records:0\nData age unrecorded.\n${MCP_CREDIT}`);
    expect(await fromUploads(() => { throw new Error("renderer must not run"); })).toMatch(/unavailable/i);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[0][1].cache).toBe("no-store");
  } finally { vi.unstubAllEnvs(); vi.unstubAllGlobals(); }
});

test("answers from the public corpus say how old its data is", async () => {
  vi.stubEnv("EVERLOOT_PUBLIC_CORPUS_URL", "https://everloot.example/api/corpus/public");
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(Response.json({ ok: true, records: [], dataAsOf: "2026-10-09T10:05:42.000Z" }))
    .mockResolvedValueOnce(Response.json({ ok: true, records: [], dataAsOf: "not a time" })));
  try {
    expect(await fromUploads(() => "Price unrecorded.")).toBe(`Price unrecorded.\nData as of 2026-10-09 10:05 UTC.\n${MCP_CREDIT}`);
    expect(await fromUploads(() => "Price unrecorded.")).toBe(`Price unrecorded.\nData age unrecorded.\n${MCP_CREDIT}`);
  } finally { vi.unstubAllEnvs(); vi.unstubAllGlobals(); }
});

test("the server registers under the Everloot name", async () => {
  const server = createKnowledgeServer(await seed());
  expect(server).toBeTruthy();
  expect(SERVER_NAME).toBe("everloot-knowledge");
  expect(SERVER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
});

test("public corpus reads enforce the actual byte ceiling even with a false content length", async () => {
  vi.stubEnv("EVERLOOT_PUBLIC_CORPUS_URL", "https://everloot.example/api/corpus/public");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true, records: [], padding: "x".repeat(2_000_001) },
    { headers: { "content-length": "1" } })));
  try {
    expect(await fromUploads(() => "renderer must not run")).toMatch(/unavailable/i);
  } finally { vi.unstubAllEnvs(); vi.unstubAllGlobals(); }
});

test("the server tells every client how to credit player data", () => {
  expect(SERVER_INSTRUCTIONS).toContain(CREDIT_LINE);
  expect(SERVER_INSTRUCTIONS).toContain("CC BY-SA 4.0");
  expect(SERVER_INSTRUCTIONS).toContain("stay Blizzard's");
  expect(MCP_CREDIT).toContain(CREDIT_LINE);
});

test("a paged public corpus is read to the end, with EVERLOOT_API_KEY sent as a bearer key", async () => {
  vi.stubEnv("EVERLOOT_PUBLIC_CORPUS_URL", "https://everloot.example/api/corpus/public");
  vi.stubEnv("EVERLOOT_API_KEY", `evl_${"a".repeat(64)}`);
  const gold = (n: number) => ({ kind: "gold_snapshot", installId: "install-one", eventId: `page:${n}`, capturedAt: "2026-10-07T00:00:00Z",
    realm: "Moon Guard", character: "Thrall", currentCopper: n, peakCopper: n });
  const send = vi.fn()
    .mockResolvedValueOnce(Response.json({ ok: true, records: [gold(1)], dataAsOf: "2026-10-09T10:05:00.000Z", next: "https://everloot.example/api/corpus/public?offset=1" }))
    .mockResolvedValueOnce(Response.json({ ok: true, records: [gold(2)], dataAsOf: "2026-10-09T10:15:00.000Z", next: null }));
  vi.stubGlobal("fetch", send);
  try {
    expect(await fromUploads((records) => `records:${records.length}`)).toBe(`records:2\nData as of 2026-10-09 10:05 UTC.\n${MCP_CREDIT}`);
    expect(send.mock.calls.map((call) => call[0])).toEqual(["https://everloot.example/api/corpus/public", "https://everloot.example/api/corpus/public?offset=1"]);
    expect(send.mock.calls[0][1].headers).toEqual({ authorization: `Bearer evl_${"a".repeat(64)}` });
  } finally { vi.unstubAllEnvs(); vi.unstubAllGlobals(); }
});

test("a next link to another site is not followed", async () => {
  vi.stubEnv("EVERLOOT_PUBLIC_CORPUS_URL", "https://everloot.example/api/corpus/public");
  const send = vi.fn().mockResolvedValueOnce(Response.json({ ok: true, records: [], next: "https://elsewhere.example/steal" }));
  vi.stubGlobal("fetch", send);
  try {
    expect(await fromUploads((records) => `records:${records.length}`)).toContain("records:0");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1].headers).toBeUndefined();
  } finally { vi.unstubAllEnvs(); vi.unstubAllGlobals(); }
});
