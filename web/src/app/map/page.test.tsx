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

const render = async (continent?: string) =>
  renderToStaticMarkup(await MapPage({ searchParams: Promise.resolve(continent ? { continent } : {}) }));

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
