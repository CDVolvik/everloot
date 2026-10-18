import { afterEach, beforeEach, expect, test, vi } from "vitest";

const store = vi.hoisted(() => ({ loadCorpus: vi.fn(), api: vi.fn() }));
vi.mock("@/lib/upload-store", () => ({ uploadStore: { loadCorpus: store.loadCorpus } }));
vi.mock("@/lib/intake-quota", () => ({ intakeQuota: { api: store.api } }));

import { GET } from "./route";
import { GET as layerGET } from "./client-layer/route";
import { CLIENT_LAYER } from "@/lib/edges";
import { edgesResponse } from "@everloot/protocol";

const req = (query = "") => new Request(`https://everloot.app/api/edges${query}`);
const vendor = (i: string) => ({ kind: "vendor", installId: `install-${i}`, capturedAt: "2026-10-09T00:00:00.000Z", vendorNpcId: 1250, items: [{ itemId: 159, priceCopper: 25 }] });

beforeEach(() => {
  store.api.mockReset().mockResolvedValue({ allowed: true, retryAfter: 0 });
  store.loadCorpus.mockResolvedValue({ uploads: 3, records: ["a", "b", "c"].map(vendor), dataAsOf: "2026-10-10T00:00:00.000Z" });
});
afterEach(() => vi.unstubAllEnvs());

test("filters by entity and relation; observed edges come with installs and times", async () => {
  const body = await (await GET(req("?from_kind=item&from_id=159&evidence=observed"))).json();
  expect(body.edges).toEqual([{
    fromKind: "item", fromId: 159, rel: "sold_by", toKind: "npc", toId: 1250, evidence: "observed",
    build: null, installs: 3, firstSeen: "2026-10-09T00:00:00.000Z", lastSeen: "2026-10-09T00:00:00.000Z",
  }]);
  expect(body.dataAsOf).toBe("2026-10-10T00:00:00.000Z");
  expect(body.attribution).toMatchObject({ licence: "CC BY-SA 4.0" });
  // No game-file row in this answer, so no game-file notice.
  expect(body.gameData).toBeNull();
});

test("game-file edges carry the label, the build and Blizzard's notice, not our licence", async () => {
  const first = CLIENT_LAYER.edges[0];
  const body = await (await GET(req(`?from_kind=${first[0]}&from_id=${first[1]}&rel=${first[2]}`))).json();
  expect(body.edges[0]).toMatchObject({ evidence: "client", build: CLIENT_LAYER.build.version, installs: null });
  expect(body.gameData).toMatchObject({ label: "Found in game files, unconfirmed", build: CLIENT_LAYER.build.version });
  expect(body.gameData.credit).toContain("Blizzard");
  expect(body.gameData.credit).toContain("WoWDBDefs");
});

test("bad parameters are a 400, not an empty list", async () => {
  for (const q of ["?from_kind=dragon", "?from_id=abc", "?rel=eaten_by", "?evidence=rumour", "?to_id=-1"]) {
    expect((await GET(req(q))).status, q).toBe(400);
  }
});

test("with no filter the whole table pages like the corpus feed, and the guard caps anonymous pages", async () => {
  vi.stubEnv("EVERLOOT_DATA_GUARD", "1");
  const body = await (await GET(req())).json();
  expect(body.total).toBe(CLIENT_LAYER.edges.length + 1);
  expect(body.edges).toHaveLength(500);
  expect(body.next).toContain("offset=500");
});

test("unreadable storage still answers the game-file edges and says the observed ones are unrecorded", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [], unreachable: true });
  const body = await (await GET(req("?evidence=observed"))).json();
  expect(body.unreachable).toBe(true);
  expect(body.edges).toEqual([]);
});

test("the client layer downloads whole, with the build in a header", async () => {
  const res = await layerGET();
  const body = await res.json();
  expect(body.schema).toBe("everloot.client-layer/2");
  expect(body.edges).toHaveLength(CLIENT_LAYER.edges.length);
  expect(res.headers.get("x-everloot-game-build")).toBe(CLIENT_LAYER.build.version);
  expect(res.headers.get("x-everloot-licence")).toBeNull();
});

test("the body is the protocol's edgesResponse", async () => {
  const body = await (await GET(req())).json();
  expect(() => edgesResponse.parse(body)).not.toThrow();
});
