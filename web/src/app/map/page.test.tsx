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
  default: ({ href, children, className, "aria-current": current }: { href: string; children: ReactNode; className?: string; "aria-current"?: "page" }) => (
    <a href={href} className={className} aria-current={current}>{children}</a>
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
  expect(html).toContain("Dungeon and raid entrances");
  expect(html).toContain("Flight masters");
  expect(html).toContain("Stormwind, Elwynn");
  expect(html).not.toContain("In-game cross-check");
  expect(html).not.toContain("Storage unreachable");
  // The six categories, each with its count on the continent.
  for (const name of ["Zones", "Entrances", "Flight masters", "Flight paths", "NPCs players saw", "Vendors players saw"]) expect(html).toContain(`>${name}</span>`);
  // A count says what the List tab lists: the flight masters' count is the rows under that heading.
  const count = (name: string) => Number(html.match(new RegExp(`>${name}</span><span data-count[^>]*><span class="sr-only">, </span>(\\d+)<`))?.[1]);
  const section = (id: string) => html.slice(html.indexOf(`id="${id}"`), html.indexOf("</section>", html.indexOf(`id="${id}"`)));
  const rows = (id: string) => section(id).split("<li").length - 1;
  expect(count("Flight masters")).toBeGreaterThan(0);
  expect(count("Flight masters")).toBe(rows("map-list-flights"));
  expect(count("Entrances")).toBe(rows("map-list-entrances"));
  expect(count("Zones")).toBe(rows("map-list-zones"));
});

test("the map fills the screen: one shell with a sidebar, a rail, a phone bar and the List tab, and no ad", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [] });
  const html = await render();
  expect(html).toContain("data-map-shell");
  expect(html).toMatch(/<h1[^>]*>WoW Forever World Map<\/h1>/);
  expect(html).toContain('id="map-panel"');
  expect(html).toContain("data-map-rail");
  expect(html).toContain("data-map-bar");
  // Categories first; the List tab is in the page too, hidden until chosen, so the page reads without JavaScript.
  expect(html).toMatch(/data-map-categories="true"(?! hidden)/);
  expect(html).toMatch(/<div hidden="" data-map-list="true">|<div data-map-list="true" hidden="">/);
  expect(html).toContain("Search the map");
  expect(html).toContain("Show all");
  expect(html).toContain("Hide all");
  expect(html).not.toMatch(/data-ad-slot|adsbygoogle/);
});

test("the continent tabs link both continents, the current one marked, keeping spoilers", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [] });
  const html = await renderWith({ continent: "1", spoilers: "1" });
  expect(html).toMatch(/href="\/map\?continent=1&amp;spoilers=1" class="[^"]*" aria-current="page">Kalimdor</);
  expect(html).toMatch(/href="\/map\?continent=0&amp;spoilers=1" class="[^"]*">Eastern Kingdoms</);
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
  expect(html).toMatch(/<h1[^>]*>WoW Forever World Map<\/h1>/);
  expect(html).not.toContain("Search the map");
  expect(html).not.toContain("data-map-shell");
});

test("the map has no footer, so its sidebar carries the site's one credit line, the data age and the guide", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [], dataAsOf: "2026-10-17T00:00:00.000Z" });
  const html = await render();
  const meta = html.slice(html.indexOf("data-map-meta"));
  expect(meta).toContain("data-site-credit");
  expect(meta).toContain('href="/methodology#credits"');
  expect(meta).toContain("Data as of");
  expect(meta).toContain('href="/docs/guides/find#map"');
  // No credit block of its own, and no third-party project.
  expect(html).not.toMatch(/Map data read from the WoW: Forever game files, build/);
  expect(html).not.toContain("data-game-credit");
  expect(html).not.toMatch(/OpenMap|warcraft\.wiki|creativecommons/);
});

test("a held-back zone or unreachable storage is said over the map, where a phone sees it too", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [], unreachable: true });
  const html = await renderWith({ zone: "2482" });
  const notice = html.slice(html.indexOf("data-map-notice"));
  expect(notice).toContain("is held back as possibly unreleased");
  expect(notice).toContain("Storage unreachable");
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
    expect(html).toContain("Show spoilers");
    expect(html).not.toMatch(/Mount Hyjal|Riverglades|Shen&#x27;dralas|Shen'dralas/);
    expect(html).toContain("Flight masters");
  }
});

test("with spoilers on, held-back zones show with the unconfirmed label, and the switch turns them off", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [] });
  const html = await renderWith({ continent: "1", spoilers: "1" });
    expect(html).toContain("Mount Hyjal");
  expect(html).toContain("found in game files, unconfirmed");
  expect(html).toContain('href="/map?continent=1"');
  expect(html).toContain("Hide spoilers");
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
  // The ring and its label are drawn in the browser; the sidebar names the zone in view.
  expect(html).toMatch(/data-map-zone[^>]*><p[^>]*>Durotar</);
  expect(html).toContain("All of Kalimdor");
});

test("a zone link without a spot opens that zone fitted to the view, on its continent", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [] });
  const html = await renderWith({ zone: "1411" });
  expect(html).toContain("Kalimdor");
  expect(html).toMatch(/data-map-zone[^>]*><p[^>]*>Durotar</);
  // The zone link survives the spoiler switch, and there is no ring (that is for a spot).
  expect(html).toContain("zone=1411");
  expect(html).toContain("Show spoilers");
  const eastern = await renderWith({ zone: "1429" });
  expect(eastern).toMatch(/data-map-zone[^>]*><p[^>]*>Elwynn Forest</);
  expect(eastern).toContain("Eastern Kingdoms");
});

test("a zone link into a held-back zone says so without naming the view, until spoilers are on", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [] });
  const off = await renderWith({ zone: "2482" });
  expect(off).toContain("is held back as possibly unreleased. Turn spoilers on to see this zone.");
  expect(off).not.toMatch(/data-map-zone[^>]*><p[^>]*>Mount Hyjal/);
  const on = await renderWith({ zone: "2482", spoilers: "1" });
  expect(on).toMatch(/data-map-zone[^>]*><p[^>]*>Mount Hyjal/);
});

test("a spot link with a zone id still puts the spot first: the pin link keeps working next to the zone link", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [] });
  const html = await renderWith({ zone: "1429", x: "40", y: "60" });
  expect(html).toContain("zone=1429&amp;x=40&amp;y=60");
});

test("a deep link into a held-back zone says so without drawing it, until spoilers are on", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [] });
  const off = await renderWith({ zone: "2482", x: "50", y: "50" });
  expect(off).toContain("is held back as possibly unreleased");
  expect(off).not.toContain("Mount Hyjal 50, 50");
  const on = await renderWith({ zone: "2482", x: "50", y: "50", spoilers: "1" });
  expect(on).toMatch(/data-map-zone[^>]*><p[^>]*>Mount Hyjal/);
  expect(on).toContain("zone=2482");
});

test("a broken deep link opens the plain map", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [] });
  const html = await renderWith({ zone: "abc", x: "50", y: "50" });
  expect(html).toContain("Eastern Kingdoms");
  expect(html).not.toMatch(/data-map-zone[^>]*><p[^>]*>Durotar/);
});

test("a spot out of range keeps the zone but drops the spot", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [] });
  const html = await renderWith({ zone: "1411", x: "500", y: "50" });
  expect(html).toMatch(/data-map-zone[^>]*><p[^>]*>Durotar/);
  expect(html).not.toContain("x=500");
});