import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { API_SCHEMAS, bulkIndex, corpusPublicResponse, dropsResponse, edgesResponse, itemsResponse, parseRecords, type BulkDataset } from "@everloot/protocol";
import { z } from "zod";

const store = vi.hoisted(() => ({ loadCorpus: vi.fn(), loadMarket: vi.fn(), loadCompletion: vi.fn() }));
vi.mock("@/lib/upload-store", () => ({ uploadStore: store }));

import { exportBulk } from "./bulk-export";

const AS_OF = "2026-10-18T10:00:00.000Z";
const records: Record<string, unknown>[] = [];
for (const [i, installId] of ["a", "b", "c"].entries()) {
  const base = { installId, capturedAt: "2026-10-09T00:00:00Z", sourceEvidence: "loot-api" };
  records.push({ ...base, eventId: `name-${i}`, kind: "item_seen", itemId: 1234, name: "Peacebloom", quality: "common" });
  records.push({ ...base, eventId: `loot-${i}`, kind: "loot", sourceNpcId: 456, items: [{ itemId: 1234, count: 1 }] });
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "everloot-bulk-"));
  store.loadCorpus.mockReset().mockResolvedValue({ uploads: 3, records, dataAsOf: AS_OF, unreachable: false });
  store.loadMarket.mockReset().mockResolvedValue({ state: null, dataAsOf: null });
  store.loadCompletion.mockReset().mockResolvedValue(null);
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); vi.unstubAllEnvs(); });

function lines(name: string): Record<string, unknown>[] {
  return readFileSync(join(dir, name), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
}

test("every file's rows are rows of the API response it names, and the index validates and matches the bytes", async () => {
  const index = bulkIndex.parse(await exportBulk(dir, new Date("2026-10-18T12:00:00Z")));
  expect(JSON.parse(readFileSync(join(dir, "index.json"), "utf8"))).toEqual(index);
  expect(index.dataAsOf).toBe(AS_OF);
  expect(index.files.map((f) => f.name)).toEqual(["corpus.ndjson", "drops.ndjson", "drops-measured-zeros.ndjson", "edges.ndjson", "items.ndjson"]);
  for (const f of index.files) {
    const body = readFileSync(join(dir, f.name));
    expect(body.length).toBe(f.bytes);
    expect(createHash("sha256").update(body).digest("hex")).toBe(f.sha256);
    const rows = lines(f.name);
    expect(rows.length).toBe(f.rows);
    // The row schema is the named response's array field, so the file can never hold a shape the API would not.
    expect(Object.keys(API_SCHEMAS)).toContain(f.rowsOf);
    const response = API_SCHEMAS[f.rowsOf as keyof typeof API_SCHEMAS] as z.ZodObject<Record<string, z.ZodType>>;
    const field = response.shape[f.field];
    expect(field).toBeDefined();
    for (const row of rows.slice(0, 50)) expect(() => (field as z.ZodArray<z.ZodType>).element.parse(row)).not.toThrow();
  }
});

test("without a key observed files leave without install ids and follow the three-install rule; game-file files carry the notice", async () => {
  const index = await exportBulk(dir);
  const corpus = lines("corpus.ndjson");
  expect(corpus.length).toBe(records.length);
  expect(corpus.every((r) => !("installId" in r))).toBe(true);
  expect(z.array(corpusPublicResponse.shape.records.element).parse(corpus).length).toBe(records.length);
  const drops = z.array(dropsResponse.shape.rates.element).parse(lines("drops.ndjson"));
  expect(drops[0]).toMatchObject({ itemId: 1234, public: true });
  const byName = Object.fromEntries(index.files.map((f) => [f.name, f]));
  expect(byName["corpus.ndjson"]).toMatchObject({ data: "observed", gameData: null });
  expect(byName["corpus.ndjson"].attribution?.licence).toBe("CC BY-SA 4.0");
  expect(byName["items.ndjson"]).toMatchObject({ data: "game-files", attribution: null });
  expect(byName["items.ndjson"].gameData?.build).toBe(index.build);
  expect(byName["edges.ndjson"].data).toBe("mixed");
  expect(z.array(edgesResponse.shape.edges.element).parse(lines("edges.ndjson").slice(0, 20)).length).toBeGreaterThan(0);
  expect(z.array(itemsResponse.shape.items.element).parse(lines("items.ndjson").slice(0, 20)).length).toBeGreaterThan(0);
});

test("unreachable storage leaves the observed files out and says so; the game-file files still come", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [], dataAsOf: null, unreachable: true });
  const index = await exportBulk(dir);
  expect(index.dataAsOf).toBeNull();
  const datasets = index.files.map((f) => f.dataset) as BulkDataset[];
  expect(datasets).not.toContain("corpus");
  expect(datasets).not.toContain("drops");
  expect(datasets).toEqual(["edges", "items"]);
  expect(index.files.find((f) => f.name === "edges.ndjson")).toMatchObject({ data: "game-files", attribution: null });
});

test("with a key the corpus file carries one pseudonym per install, never the install id, and its rows parse", async () => {
  vi.stubEnv("EVERLOOT_CHARACTER_KEY", "k".repeat(32));
  await exportBulk(dir);
  const corpus = lines("corpus.ndjson");
  const ids = corpus.map((r) => r.installId as string);
  for (const id of ids) expect(id).toMatch(/^pub-[0-9a-f]{32}$/);
  expect(new Set(ids).size).toBe(3);
  expect(ids[0]).toBe(ids[1]);
  const parsed = parseRecords(corpus);
  expect(parsed.receipt.rejected).toEqual([]);
  expect(parsed.records).toHaveLength(records.length);
});
