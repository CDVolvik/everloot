import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";

const store = vi.hoisted(() => ({ loadCorpus: vi.fn() }));
vi.mock("@/lib/upload-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/upload-store")>()),
  uploadStore: { loadCorpus: store.loadCorpus },
}));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  permanentRedirect: (to: string) => { throw new Error(`REDIRECT ${to}`); },
}));

import CoveragePage from "./page";
import ZoneCoveragePage from "./[zone]/page";
import { COVERAGE_BUILD, loadCoverageExpected } from "@/lib/coverage-compute";
import { writeCoverage } from "@/lib/coverage-store";

const sighting = (i: number, npcId: number, name: string, mapId: number) => ({
  kind: "npc_sighting", installId: `install-${i}`, eventId: `e:${i}:${npcId}`, capturedAt: "2026-10-01T00:00:00.000Z",
  npcId, name, mapId, x: 40, y: 50, positionKind: "interaction", role: "vendor",
});
const corpus = (records: unknown[]) => ({ uploads: 5, records, dataAsOf: "2026-10-20T00:00:00.000Z" });
const html = async (el: Promise<ReactNode>) => renderToStaticMarkup(await el);
const search = (q: Record<string, string>) => ({ searchParams: Promise.resolve(q) });
const westfall = [0, 1, 2].map((i) => sighting(i, 100, "Guard Orin", 1436));
const durotar = [3].map((i) => sighting(i, 200, "Unagreed Name", 1411));

beforeEach(() => store.loadCorpus.mockReset());

test("the index is a search box, then one row per zone with settled / confirmed shares, lowest first", async () => {
  store.loadCorpus.mockResolvedValue(corpus([...westfall, ...durotar]));
  const page = await html(CoveragePage(search({})));
  expect(page).toContain('data-container="data"');
  expect(page.indexOf('type="search"') === -1 ? page.indexOf('name="q"') : page.indexOf('type="search"')).toBeLessThan(page.indexOf("<table"));
  for (const h of ["Quests", "NPCs", "Pins", "Vendors", "Drops", "Rares", "Entrances", "Bosses", "Treasures"]) expect(page).toContain(`>${h}<`);
  expect(page).toContain('href="/database/coverage/1436-westfall"');
  // Without the expected file a share has no denominator: [?], never 0%.
  expect(page).toContain("[?] / [?]");
  expect(page).toContain("No expected counts yet");
  expect(page).toContain("Data as of 2026-10-20 00:00 UTC, from 4 installs");
  // No unagreed value, no breadcrumbs, no licence line.
  expect(page).not.toContain("Unagreed Name");
  expect(page).not.toContain('aria-label="Breadcrumb"');
  expect(page).not.toContain("CC BY-SA");
});

test("sorting by a column keeps the lowest first and the header links flip it", async () => {
  store.loadCorpus.mockResolvedValue(corpus(westfall));
  const page = await html(CoveragePage(search({ sort: "-entrances" })));
  expect(page).toContain('aria-sort="descending"');
  await expect(CoveragePage(search({ sort: "bogus" }))).rejects.toThrow("NEXT_NOT_FOUND");
});

test("the search finds the zone an NPC id is counted in", async () => {
  store.loadCorpus.mockResolvedValue(corpus([...westfall, ...durotar]));
  const page = await html(CoveragePage(search({ q: "100" })));
  expect(page).toContain("NPC 100: counted in");
  expect(page).toContain('href="/database/coverage/1436-westfall"');
  expect(page).not.toContain('href="/database/coverage/1411-durotar"');
  expect(await html(CoveragePage(search({ q: "durot" })))).toContain('href="/database/coverage/1411-durotar"');
});

test("a zone page lists its fields and the facts one or two installs short, linked, by id only", async () => {
  store.loadCorpus.mockResolvedValue(corpus([...westfall, ...durotar]));
  const page = await html(ZoneCoveragePage({ params: Promise.resolve({ zone: "1411-durotar" }) }));
  expect(page).toContain("Durotar coverage");
  expect(page).toContain(">By field<");
  expect(page).toContain('href="/database/npcs/200"');
  expect(page).toContain("1 of 3");
  expect(page).toContain("2 more");
  expect(page).not.toContain("Unagreed Name");
  await expect(ZoneCoveragePage({ params: Promise.resolve({ zone: "1411" }) })).rejects.toThrow("REDIRECT /database/coverage/1411-durotar");
  await expect(ZoneCoveragePage({ params: Promise.resolve({ zone: "99999-nowhere" }) })).rejects.toThrow("NEXT_NOT_FOUND");
});

test("unreachable storage says so, never a table of zeros", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [], unreachable: true });
  const page = await html(CoveragePage(search({})));
  expect(page).toContain("Storage unreachable");
  expect(page).not.toContain("<table");
});

test("the expected file is the maintainer report's counts, read from the private bucket's build folder, and refused if it holds more", async () => {
  const file = { version: 1, zones: [{ zone: "1436", types: { npc: 4 }, fields: { npc: { name: 2, level: 2 } } }] };
  const base = "https://assets.example/wow_classic_beta-70450-84bea423";
  const read = vi.fn(async () => file);
  expect(await loadCoverageExpected(base, { read })).toMatchObject({ zones: [{ zone: "1436", types: { npc: 4 } }] });
  expect(read).toHaveBeenCalledWith("wow_classic_beta-70450-84bea423/coverage-expected.json");
  expect(await loadCoverageExpected(base, { read: async () => ({ ...file, rows: [{ name: "Hogger" }] }) })).toBeNull();
  expect(await loadCoverageExpected(null, { read })).toBeNull();
});
test("the cron writer skips a run that added nothing and writes coverage/<build>.json otherwise", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
  const cloud = { r2AccountId: "acct", r2AccessKeyId: "k", r2SecretAccessKey: "s", r2Bucket: "b", supabaseUrl: "https://x", supabaseServiceKey: "y" };
  expect(await writeCoverage({ added: 0, dataAsOf: null }, { cloud, fetch: fetcher })).toEqual({ written: false });
  expect(fetcher).not.toHaveBeenCalled();
  expect(store.loadCorpus).not.toHaveBeenCalled();
  store.loadCorpus.mockResolvedValue(corpus(westfall));
  const result = await writeCoverage({ added: 2, dataAsOf: "2026-10-19T00:00:00.000Z" }, { cloud, fetch: fetcher });
  expect(result).toMatchObject({ written: true, key: `coverage/${COVERAGE_BUILD}.json` });
  const sent = fetcher.mock.calls[0]![0] as Request;
  expect(sent.method).toBe("PUT");
  expect(sent.url).toBe(`https://acct.r2.cloudflarestorage.com/b/coverage/${COVERAGE_BUILD}.json`);
  const body = JSON.parse(await sent.text());
  expect(body).toMatchObject({ schema: "everloot.coverage/1", build: COVERAGE_BUILD, dataAsOf: "2026-10-19T00:00:00.000Z" });
  expect(JSON.stringify(body)).not.toContain("Guard Orin");
  expect(await writeCoverage({ added: 0, rebuild: true, dataAsOf: null }, { cloud, fetch: fetcher })).toMatchObject({ written: true });
});
