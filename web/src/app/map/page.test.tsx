import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";

const store = vi.hoisted(() => ({ loadCorpus: vi.fn() }));
const world = vi.hoisted(() => ({ empty: false }));
vi.mock("@/lib/upload-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/upload-store")>()),
  uploadStore: { loadCorpus: store.loadCorpus },
}));
vi.mock("@/lib/world-map", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/world-map")>();
  return {
    ...real,
    continentMap: (...args: Parameters<typeof real.continentMap>) =>
      world.empty ? { ...real.continentMap(...args), viewBox: null, zones: [], entrances: [] } : real.continentMap(...args),
  };
});
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

import MapPage from "./page";
import { WORLD_MAP } from "@/lib/world-map";

const renderWith = async (query: Record<string, string>) => renderToStaticMarkup(await MapPage({ searchParams: Promise.resolve(query) }));
const render = async (continent?: string) => renderWith(continent ? { continent } : {});

const elwynn = WORLD_MAP.zones.find((z) => z.uiMapId === 1429)!.bounds;
const report = (installId: string, right: number) => ({
  kind: "map_bounds", installId, capturedAt: "2026-10-17T00:00:00Z", mapId: 1429, continentId: 0,
  left: elwynn.left, top: elwynn.top, right, bottom: elwynn.bottom,
});

beforeEach(() => {
  store.loadCorpus.mockReset();
  world.empty = false;
});

test("with no reports the whole map still shows, from the game files", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [], dataAsOf: "2026-10-17T00:00:00.000Z" });
  const html = await render();
  expect(html).toContain("Stormwind Stockade");
  expect(html).toContain("Elwynn Forest");
  expect(html).toContain("zone outlines");
  expect(html).not.toContain("In-game cross-check");
  expect(html).not.toContain("Storage unreachable");
  expect(html).toContain("Dungeon (circle)");
  expect(html).toContain("Raid (square)");
});

test("unreadable storage says so, keeps the map, and shows no data age", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [], unreachable: true });
  const html = await render("1");
  expect(html).toContain("Storage unreachable");
  expect(html).toContain("Kalimdor");
  expect(html).toContain("Ragefire Chasm");
  expect(html).toContain("Durotar");
  expect(html).not.toContain("Data as of");
});

test("an unknown continent falls back to Eastern Kingdoms", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [] });
  expect(await render("7")).toContain("Eastern Kingdoms");
});

test("a continent with nothing placed says so and draws no map or legend", async () => {
  world.empty = true;
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [] });
  const html = await render();
  expect(html).toContain("Nothing is placed on this continent yet.");
  expect(html).not.toContain('role="img"');
  expect(html).not.toContain("Dungeon (circle)");
});

test("the credit line is ours: game files, the build, Blizzard's data, no third-party project", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [] });
  const html = await render();
  expect(html).toMatch(/Map data read from the WoW: Forever game files, build 1\.60\.1\.\d+/);
  expect(html).toContain("not under our licence");
  expect(html).not.toMatch(/OpenMap|warcraft\.wiki|creativecommons|Boats and zeppelins/);
});

test("agreeing installs that differ from the files are named; matching ones are counted", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 3, records: ["a", "b", "c"].map((i) => report(i, elwynn.right + 300)) });
  const differs = await render();
  expect(differs).toContain("In-game cross-check");
  expect(differs).toContain("treat their outlines as unconfirmed: Elwynn Forest");
  store.loadCorpus.mockResolvedValue({ uploads: 3, records: ["a", "b", "c"].map((i) => report(i, elwynn.right)) });
  const matches = await render();
  expect(matches).toContain("1 zone match within a yard");
  expect(matches).not.toContain("treat their outlines");
});

const sightings = (npcId: number, mapId: number, x: number, y: number, name: string) =>
  ["a", "b", "c"].map((installId) => ({
    kind: "npc_sighting", installId, npcId, name, mapId, x, y, level: 5, reaction: "friendly", positionKind: "npc", capturedAt: "2026-10-17T00:00:00Z",
  }));

test("spoilers are off by default: held-back zones are named nowhere in the page", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [] });
  for (const continent of ["0", "1"]) {
    const html = await render(continent);
    expect(html).toContain("Spoilers: off");
    expect(html).toContain("Show them");
    expect(html).not.toMatch(/Mount Hyjal|Riverglades|Shen&#x27;dralas|Shen'dralas/);
  }
});

test("with spoilers on, held-back zones show with the unconfirmed label, and the switch turns them off", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [] });
  const html = await renderWith({ continent: "1", spoilers: "1" });
  expect(html).toContain("Spoilers: on");
  expect(html).toContain("Mount Hyjal");
  expect(html).toContain("found in game files, unconfirmed");
  expect(html).toContain('href="/map?continent=1"');
  expect(html).toContain("Hide them");
});

test("player-observed points show only with 3 agreeing installs, and a pin in a held-back zone needs spoilers", async () => {
  store.loadCorpus.mockResolvedValue({
    uploads: 3,
    records: [...sightings(7, 1429, 40, 60, "Guard Marlow"), ...sightings(8, 2482, 50, 50, "Hyjal Warden"),
      ...["a", "b"].map((i) => ({ ...sightings(9, 1429, 10, 10, "Two Installs")[0], installId: i }))],
  });
  const plain = await render();
  expect(plain).not.toContain("Hyjal Warden");
  const kalimdor = await renderWith({ continent: "1" });
  expect(kalimdor).not.toContain("Hyjal Warden");
  expect(plain).toContain("Guard Marlow");
  expect(plain).toContain('href="/database/npcs/7"');
  expect(plain).not.toContain("Two Installs");
  expect(await renderWith({ continent: "1", spoilers: "1" })).toContain("Hyjal Warden");
});

test("a deep link opens the continent of its zone with a marker on the spot", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [] });
  const html = await renderWith({ zone: "1411", x: "50", y: "50" });
  expect(html).toContain("Kalimdor");
  expect(html).toContain("Durotar 50, 50");
});

test("a deep link into a held-back zone says so without drawing it, until spoilers are on", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [] });
  const off = await renderWith({ zone: "2482", x: "50", y: "50" });
  expect(off).toContain("is held back as possibly unreleased");
  expect(off).not.toContain("Mount Hyjal 50, 50");
  const on = await renderWith({ zone: "2482", x: "50", y: "50", spoilers: "1" });
  expect(on).toContain("Mount Hyjal 50, 50");
  expect(on).toContain("zone=2482");
});

test("a broken deep link opens the plain map", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [] });
  const html = await renderWith({ zone: "1411", x: "500", y: "50" });
  expect(html).toContain("Eastern Kingdoms");
  expect(html).not.toContain("Durotar 500");
});