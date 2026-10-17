import { beforeEach, expect, test, vi } from "vitest";

const store = vi.hoisted(() => ({ loadCorpus: vi.fn() }));
vi.mock("@/lib/upload-store", () => ({ uploadStore: { loadCorpus: store.loadCorpus } }));

import { GET } from "./route";

const base = { installId: "install-1", capturedAt: "2026-10-09T00:00:00.000Z" };
const gold = { ...base, eventId: "e:1", kind: "gold_snapshot", character: "Thrall", realm: "Forever", currentCopper: 1, peakCopper: 1 };
const scan = { ...base, eventId: "e:2", kind: "auction_scan", realm: "Forever", itemId: 1, copper: 5 };
const req = (query = "") => new Request(`https://everloot.app/api/corpus/public${query}`);
/** What leaves the site: the same record without the install id. */
const published = ({ installId: _, ...rest }: Record<string, unknown>) => rest;

beforeEach(() => store.loadCorpus.mockReset().mockResolvedValue({ uploads: 1, records: [gold, scan] }));

test("without kinds the whole public corpus is returned", async () => {
  const body = await (await GET(req())).json();
  expect(body.records).toEqual([published(gold), published(scan)]);
});

test("no record leaves the site with its install id, so one player's observations cannot be linked", async () => {
  for (const query of ["", "?kinds=auction_scan"]) {
    const body = await (await GET(req(query))).json();
    expect(body.records.length).toBeGreaterThan(0);
    for (const record of body.records) expect(record).not.toHaveProperty("installId");
  }
});

test("kinds narrows the body to the record kinds a tool reads", async () => {
  const body = await (await GET(req("?kinds=auction_scan"))).json();
  expect(body).toMatchObject({ ok: true, uploads: 1, kinds: ["auction_scan"] });
  expect(body.records).toEqual([published(scan)]);
});

test("an unknown kind is a 400, never a silently empty answer", async () => {
  const response = await GET(req("?kinds=auction_scan,flying_mounts"));
  expect(response.status).toBe(400);
  expect(store.loadCorpus).not.toHaveBeenCalled();
});

test("installed addon lists never leave row by row; only the leaderboard's counts are published", async () => {
  const addon = { ...base, eventId: "e:3", kind: "addon_seen", name: "Questie", title: "Questie", loaded: true };
  store.loadCorpus.mockResolvedValue({ uploads: 1, records: [gold, addon, scan] });
  const body = await (await GET(req())).json();
  expect(body.records).toEqual([published(gold), published(scan)]);
  const asked = await GET(req("?kinds=addon_seen"));
  expect(asked.status).toBe(400);
});

test("talent builds are held back from the public corpus", async () => {
  const build = { ...base, eventId: "e:4", kind: "talent_snapshot", class: "MAGE", level: 30, group: 1, active: true, configId: 7, treeId: 786, exportStatus: "unavailable", points: 1, nodes: [{ nodeId: 1, ranks: 1 }] };
  store.loadCorpus.mockResolvedValue({ uploads: 1, records: [gold, build] });
  const body = await (await GET(req())).json();
  expect(body.records).toEqual([published(gold)]);
  expect((await GET(req("?kinds=talent_snapshot"))).status).toBe(400);
});
