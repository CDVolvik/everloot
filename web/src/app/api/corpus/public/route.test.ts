import { beforeEach, expect, test, vi } from "vitest";

const store = vi.hoisted(() => ({ loadCorpus: vi.fn() }));
vi.mock("@/lib/upload-store", () => ({ uploadStore: { loadCorpus: store.loadCorpus } }));

import { GET } from "./route";

const base = { installId: "install-1", capturedAt: "2026-10-09T00:00:00.000Z" };
const gold = { ...base, eventId: "e:1", kind: "gold_snapshot", character: "Thrall", realm: "Forever", currentCopper: 1, peakCopper: 1 };
const scan = { ...base, eventId: "e:2", kind: "auction_scan", realm: "Forever", itemId: 1, copper: 5 };
const req = (query = "") => new Request(`https://everloot.app/api/corpus/public${query}`);

beforeEach(() => store.loadCorpus.mockReset().mockResolvedValue({ uploads: 1, records: [gold, scan] }));

test("without kinds the whole public corpus is returned", async () => {
  const body = await (await GET(req())).json();
  expect(body.records).toEqual([gold, scan]);
});

test("kinds narrows the body to the record kinds a tool reads", async () => {
  const body = await (await GET(req("?kinds=auction_scan"))).json();
  expect(body).toMatchObject({ ok: true, uploads: 1, kinds: ["auction_scan"] });
  expect(body.records).toEqual([scan]);
});

test("an unknown kind is a 400, never a silently empty answer", async () => {
  const response = await GET(req("?kinds=auction_scan,flying_mounts"));
  expect(response.status).toBe(400);
  expect(store.loadCorpus).not.toHaveBeenCalled();
});
