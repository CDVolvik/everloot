import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CURRENT_BUILD, TABLES } from "@/data/game-data/raid";
import {
  assetUrl, buildFolder, classAndProfessionIcons, continentArt, FETCH_TIMEOUT_MS, forgetPrivateReads, iconUrl, itemIconUrl, itemShard, itemTip,
  loadItemTips, loadSiteAssets, parseSiteManifest, privateStoreFromEnv, raidArt,
} from "./game-assets";
import { itemTipText, qualityColor } from "./item-names";
import { cameraBox, zoneArtShown, ZONE_ART_ZOOM, type Box, type Camera } from "./map-view";
import { itemIndex, memoryStore, shard0, siteManifest } from "./game-assets.fixture";

const BASE = "https://assets.example.test/wow_classic_beta-70450-84bea423";
const FOLDER = "wow_classic_beta-70450-84bea423";
const privateFiles = { [`${FOLDER}/items.json`]: itemIndex, [`${FOLDER}/items/0.json`]: shard0 };

beforeEach(() => forgetPrivateReads());
afterEach(() => vi.unstubAllEnvs());

test("URL builders put every file under the build's folder", () => {
  expect(assetUrl(BASE, "maps/13.webp")).toBe(`${BASE}/maps/13.webp`);
  expect(iconUrl(BASE, "6001.webp")).toBe(`${BASE}/icons/6001.webp`);
  expect(itemIconUrl(BASE, 132889)).toBe(`${BASE}/icons/132889.webp`);
  expect(itemShard(511, 512)).toBe(0);
  expect(itemShard(512, 512)).toBe(1);
  expect(buildFolder(BASE)).toBe(FOLDER);
  expect(buildFolder("https://assets.example.test")).toBeNull();
});

test("a full manifest becomes ready URLs: classes, professions with icons, buff spells and maps with their small copies", () => {
  const a = parseSiteManifest(siteManifest, BASE)!;
  expect(a.version).toBe("1.60.1.70450");
  expect(a.classes.get("warrior")).toEqual({ name: "Warrior", icon: `${BASE}/icons/6001.webp`, trees: [
    { name: "Fury", icon: `${BASE}/icons/6003.webp` }, { name: "Arms", icon: `${BASE}/icons/6002.webp` }, { name: "Protection", icon: null },
  ] });
  // A profession without an icon is left out rather than drawn empty.
  expect([...a.professions.keys()]).toEqual(["alchemy", "riding"]);
  expect(a.spellIcons.get(6673)).toBe(`${BASE}/icons/8001.webp`);
  expect(a.maps.find((m) => m.uiMapId === 1429)).toMatchObject({ url: `${BASE}/maps/1429.webp`, smallUrl: `${BASE}/maps/1429-small.webp`, kind: "zone", heldBack: false });
});

test("a manifest from before the site-wide art (talent art only, with its icon list) still reads, with nothing to show", () => {
  const later = ["classes", "professions", "spellIcons", "maps"];
  const talentsOnly = { ...Object.fromEntries(Object.entries(siteManifest).filter(([k]) => !later.includes(k))), icons: {} };
  const a = parseSiteManifest(talentsOnly, BASE)!;
  expect(a.classes.size + a.professions.size + a.spellIcons.size + a.maps.length).toBe(0);
  expect(classAndProfessionIcons(a)).toEqual({ classes: [], professions: [] });
});

test.each([
  ["another schema", { ...siteManifest, schema: "everloot.game-assets/2" }],
  ["a map path that climbs out of the folder", { ...siteManifest, maps: { "13": { ...siteManifest.maps["13"], file: "../x.webp" } } }],
  ["an icon that is a URL", { ...siteManifest, spellIcons: { "1": "https://evil.test/x.webp" } }],
  ["not an object", "<html>"],
])("%s is refused", (_name, bad) => {
  expect(parseSiteManifest(bad, BASE)).toBeNull();
});

test("unset: nothing is fetched and every reader gives nothing to draw", async () => {
  vi.stubEnv("NEXT_PUBLIC_GAME_ASSETS_URL", "");
  const fetcher = vi.fn();
  const store = memoryStore(privateFiles);
  expect(await loadSiteAssets(undefined, fetcher)).toBeNull();
  expect((await loadItemTips(null, [9, 25], store)).size).toBe(0);
  expect(fetcher).not.toHaveBeenCalled();
  expect(store.reads).toEqual([]);
  expect(raidArt(null, TABLES[CURRENT_BUILD])).toBeNull();
  expect(continentArt(null, 0, true, false)).toBeNull();
  expect(classAndProfessionIcons(null)).toEqual({ classes: [], professions: [] });
});

test("a failing, non-OK, garbled or slow manifest is null and never throws", async () => {
  expect(await loadSiteAssets(BASE, vi.fn().mockRejectedValue(new Error("network")))).toBeNull();
  expect(await loadSiteAssets(BASE, vi.fn().mockResolvedValue(new Response("nope", { status: 404 })))).toBeNull();
  expect(await loadSiteAssets(BASE, vi.fn().mockResolvedValue(new Response("<html>")))).toBeNull();
  const fetcher = vi.fn().mockResolvedValue(Response.json(siteManifest));
  expect((await loadSiteAssets(BASE, fetcher))?.version).toBe("1.60.1.70450");
  expect(fetcher.mock.calls[0][0]).toBe(`${BASE}/manifest.json`);
  // Every read carries a timeout, so a bucket that never answers cannot hold the page.
  const signal = (fetcher.mock.calls[0][1] as RequestInit).signal!;
  expect(signal).toBeInstanceOf(AbortSignal);
  vi.useFakeTimers();
  try {
    const hang = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason))));
    const pending = loadSiteAssets(BASE, hang as unknown as typeof fetch);
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS + 1);
    expect(await pending).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("item tooltips come from the private bucket only, read only the shards the page needs, for the same build", async () => {
  const a = parseSiteManifest(siteManifest, BASE)!;
  const store = memoryStore(privateFiles);
  const tips = await loadItemTips(a, [9, 25, 9, 4000, -1], store);
  // 4000 is in shard 7, which the private folder does not have: no read for it.
  expect(store.reads).toEqual([`${FOLDER}/items.json`, `${FOLDER}/items/0.json`]);
  expect(tips.get(9)).toMatchObject({ name: "Linen Cloth", quality: "Common", icon: `${BASE}/icons/132889.webp`, label: "found in game files, unconfirmed · build 1.60.1.70450" });
  expect(tips.get(25)?.icon).toBeNull();
  expect(tips.has(4000)).toBe(false);
  // No private bucket, an index for another build, a broken shard or no ids: plain links, nothing read past that.
  expect((await loadItemTips(a, [9], null)).size).toBe(0);
  expect((await loadItemTips(a, [9], memoryStore({ ...privateFiles, [`${FOLDER}/items.json`]: { ...itemIndex, build: { version: "9.9.9.1" } } }))).size).toBe(0);
  expect((await loadItemTips(a, [9], memoryStore({ ...privateFiles, [`${FOLDER}/items/0.json`]: { "9": { n: 1 } } }))).size).toBe(0);
  const idle = memoryStore(privateFiles);
  expect((await loadItemTips(a, [], idle)).size).toBe(0);
  expect(idle.reads).toEqual([]);
});

test("the private bucket needs all four server-only variables, signs its reads, and keeps what it read", async () => {
  expect(privateStoreFromEnv({})).toBeNull();
  expect(privateStoreFromEnv({ GAME_DATA_S3_ENDPOINT: "https://r2.example.test", GAME_DATA_BUCKET: "private" })).toBeNull();
  const env = { GAME_DATA_S3_ENDPOINT: "https://r2.example.test/", GAME_DATA_BUCKET: "everloot-game-data", GAME_DATA_ACCESS_KEY_ID: "id", GAME_DATA_SECRET_ACCESS_KEY: "secret" };
  const fetcher = vi.fn(async (_input: Request) => Response.json(itemIndex));
  const store = privateStoreFromEnv(env, fetcher as unknown as typeof fetch)!;
  expect(await store.read(`${FOLDER}/items.json`)).toEqual(itemIndex);
  expect(await store.read(`${FOLDER}/items.json`)).toEqual(itemIndex);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const request = fetcher.mock.calls[0][0] as unknown as Request;
  expect(request.url).toBe(`https://r2.example.test/everloot-game-data/${FOLDER}/items.json`);
  expect(request.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=id\//);
  const failing = privateStoreFromEnv(env, vi.fn().mockRejectedValue(new Error("down")))!;
  expect(await failing.read(`${FOLDER}/other.json`)).toBeNull();
});

test("an item tooltip reads like the game's and marks the stat amounts the tables do not give", () => {
  const text = itemTipText(shard0["25"]);
  expect(text.lines).toEqual(["Binds when equipped", "Unique", "One-Hand · Sword", "Speed 1.90", "+[?] Stamina", "+[?] Strength", "Requires Level 5", "Item Level 2", '"Old."', "Sell Price: 7c"]);
  expect(text.partial).toBe(true);
  expect(itemTipText(shard0["9"]).partial).toBe(false);
  expect(qualityColor(3)).toMatch(/^#/);
  expect(itemTip(shard0["9"], { base: BASE, version: "v", label: "l" }).color).toBe(qualityColor(1));
});

test("the raid builder's icons match the buff table: trees by name, not position, and families by their spells", () => {
  const art = raidArt(parseSiteManifest(siteManifest, BASE), TABLES[CURRENT_BUILD])!;
  expect(art.classes).toEqual({ warrior: `${BASE}/icons/6001.webp` });
  // The table lists Arms, Fury, Protection; the manifest had Fury first.
  expect(art.trees.warrior).toEqual([`${BASE}/icons/6002.webp`, `${BASE}/icons/6003.webp`, null]);
  expect(art.families["battle-shout"]).toBe(`${BASE}/icons/8001.webp`);
  expect(art.families["demoralizing-shout"]).toBeUndefined();
});

test("class and profession icons come in the game's order, only the professions the site names", () => {
  const icons = classAndProfessionIcons(parseSiteManifest(siteManifest, BASE));
  expect(icons.classes.map((c) => c.key)).toEqual(["warrior"]);
  expect(icons.professions.map((p) => p.key)).toEqual(["Alchemy"]);
});

test("map pictures land on the stitched map; held-back zones and the continent picture wait for spoilers", () => {
  const a = parseSiteManifest(siteManifest, BASE)!;
  const off = continentArt(a, 0, false, true)!;
  expect(off.continent).toBeNull();
  expect(off.zones.map((z) => z.uiMapId).sort()).toEqual([1426, 1429]);
  // World y runs west and x north; the stitched map is x east, y south.
  expect(off.zones.find((z) => z.uiMapId === 1429)).toMatchObject({ x: -1000, y: -500, width: 1000, height: 1000, smallUrl: `${BASE}/maps/1429-small.webp` });
  const on = continentArt(a, 0, true, true)!;
  expect(on.continent?.uiMapId).toBe(13);
  expect(on.zones.map((z) => z.uiMapId).sort()).toEqual([1426, 1429, 2548]);
  expect(continentArt(a, 1, true, false)).toBeNull();
});

test("the upload's own held-back marks also hide the continent picture, even when the map file names none", () => {
  const a = parseSiteManifest(siteManifest, BASE)!;
  // 2548 is marked held back in the upload; the map file is told there is nothing held back here.
  expect(continentArt(a, 0, false, false)!.continent).toBeNull();
  const released = parseSiteManifest({ ...siteManifest, maps: Object.fromEntries(Object.entries(siteManifest.maps).filter(([id]) => id !== "2548")) }, BASE)!;
  expect(continentArt(released, 0, false, false)!.continent?.uiMapId).toBe(13);
});

const frame: Box = { x: -4000, y: -4000, width: 8000, height: 8000 };
const at = (zoom: number, cx: number, cy: number): [Camera, Box] => [{ zoom, cx, cy }, cameraBox(frame, { zoom, cx, cy })];

test("with a continent picture, a zone's own picture shows only when zoomed in over it", () => {
  const released = parseSiteManifest({ ...siteManifest, maps: Object.fromEntries(Object.entries(siteManifest.maps).filter(([id]) => id !== "2548")) }, BASE)!;
  const art = continentArt(released, 0, false, false)!;
  expect(zoneArtShown(art, ...at(1, -500, 0))).toEqual([]);
  expect(zoneArtShown(art, ...at(ZONE_ART_ZOOM, -500, 0)).map((z) => [z.uiMapId, z.url])).toEqual([[1429, `${BASE}/maps/1429.webp`]]);
  expect(zoneArtShown(art, ...at(ZONE_ART_ZOOM, 2000, -2000))).toEqual([]);
});

test("without one, only the zones in view are drawn, from their small copies until zoomed in", () => {
  const art = continentArt(parseSiteManifest(siteManifest, BASE)!, 0, false, true)!;
  // Zoomed out, both zones are in view: small copies.
  expect(zoneArtShown(art, ...at(1, 0, 0)).map((z) => z.url)).toEqual([`${BASE}/maps/1429-small.webp`, `${BASE}/maps/1426-small.webp`]);
  // Zoomed in over Elwynn: only Elwynn, at full size; Dun Morogh is out of view and not drawn.
  expect(zoneArtShown(art, ...at(ZONE_ART_ZOOM * 2, -500, 0)).map((z) => z.url)).toEqual([`${BASE}/maps/1429.webp`]);
  // An upload without small copies falls back to the full picture.
  const noSmall = { ...art, zones: art.zones.map((z) => ({ ...z, smallUrl: null })) };
  expect(zoneArtShown(noSmall, ...at(1, 0, 0)).map((z) => z.url)).toEqual([`${BASE}/maps/1429.webp`, `${BASE}/maps/1426.webp`]);
});
