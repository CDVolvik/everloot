import { afterEach, expect, test, vi } from "vitest";
import { CURRENT_BUILD, TABLES } from "@/data/game-data/raid";
import {
  assetUrl, classAndProfessionIcons, continentArt, iconUrl, itemIconUrl, itemShard, itemTip, loadItemTips, loadSiteAssets,
  parseSiteManifest, raidArt,
} from "./game-assets";
import { itemTipText, qualityColor } from "./item-names";
import { zoneArtShown, ZONE_ART_ZOOM } from "./map-view";
import { shard0, siteManifest } from "./game-assets.fixture";

const BASE = "https://assets.example.test/wow_classic_beta-70450-84bea423";

afterEach(() => vi.unstubAllEnvs());

test("URL builders put every file under the build's folder", () => {
  expect(assetUrl(BASE, "maps/13.webp")).toBe(`${BASE}/maps/13.webp`);
  expect(iconUrl(BASE, "6001.webp")).toBe(`${BASE}/icons/6001.webp`);
  expect(itemIconUrl(BASE, 132889)).toBe(`${BASE}/icons/132889.webp`);
  expect(itemShard(511, 512)).toBe(0);
  expect(itemShard(512, 512)).toBe(1);
});

test("a full manifest becomes ready URLs: classes, professions with icons, buff spells, maps and item shards", () => {
  const a = parseSiteManifest(siteManifest, BASE)!;
  expect(a.version).toBe("1.60.1.70450");
  expect(a.classes.get("warrior")).toEqual({ name: "Warrior", icon: `${BASE}/icons/6001.webp`, trees: [
    { name: "Fury", icon: `${BASE}/icons/6003.webp` }, { name: "Arms", icon: `${BASE}/icons/6002.webp` }, { name: "Protection", icon: null },
  ] });
  // A profession without an icon is left out rather than drawn empty.
  expect([...a.professions.keys()]).toEqual(["alchemy", "riding"]);
  expect(a.spellIcons.get(6673)).toBe(`${BASE}/icons/8001.webp`);
  expect(a.maps.find((m) => m.uiMapId === 1429)).toMatchObject({ url: `${BASE}/maps/1429.webp`, kind: "zone", heldBack: false });
  expect(a.items).toEqual({ shardSize: 512, shards: new Map([[0, `${BASE}/items/0.json`]]) });
});

test("a manifest from before the site-wide art (talent art only) still reads, with nothing to show", () => {
  const later = ["classes", "professions", "spellIcons", "maps", "items"];
  const talentsOnly = Object.fromEntries(Object.entries(siteManifest).filter(([k]) => !later.includes(k)));
  const a = parseSiteManifest(talentsOnly, BASE)!;
  expect(a.classes.size + a.professions.size + a.spellIcons.size + a.maps.length).toBe(0);
  expect(a.items).toBeNull();
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
  expect(await loadSiteAssets(undefined, fetcher)).toBeNull();
  expect((await loadItemTips(null, [9, 25], fetcher)).size).toBe(0);
  expect(fetcher).not.toHaveBeenCalled();
  expect(raidArt(null, TABLES[CURRENT_BUILD])).toBeNull();
  expect(continentArt(null, 0, true, false)).toBeNull();
  expect(classAndProfessionIcons(null)).toEqual({ classes: [], professions: [] });
});

test("a failing, non-OK or garbled manifest is null and never throws", async () => {
  expect(await loadSiteAssets(BASE, vi.fn().mockRejectedValue(new Error("network")))).toBeNull();
  expect(await loadSiteAssets(BASE, vi.fn().mockResolvedValue(new Response("nope", { status: 404 })))).toBeNull();
  expect(await loadSiteAssets(BASE, vi.fn().mockResolvedValue(new Response("<html>")))).toBeNull();
  const fetcher = vi.fn().mockResolvedValue(Response.json(siteManifest));
  expect((await loadSiteAssets(BASE, fetcher))?.version).toBe("1.60.1.70450");
  expect(fetcher.mock.calls[0][0]).toBe(`${BASE}/manifest.json`);
});

test("item tooltips read only the shards the page needs; a broken shard leaves plain links", async () => {
  const a = parseSiteManifest(siteManifest, BASE)!;
  const fetcher = vi.fn().mockResolvedValue(Response.json(shard0));
  const tips = await loadItemTips(a, [9, 25, 9, 4000, -1], fetcher);
  // 4000 is in shard 7, which the upload does not have: no request for it.
  expect(fetcher.mock.calls.map((c) => c[0])).toEqual([`${BASE}/items/0.json`]);
  expect(tips.get(9)).toMatchObject({ name: "Linen Cloth", quality: "Common", icon: `${BASE}/icons/132889.webp`, label: "found in game files, unconfirmed · build 1.60.1.70450" });
  expect(tips.get(25)?.icon).toBeNull();
  expect(tips.has(4000)).toBe(false);
  expect((await loadItemTips(a, [9], vi.fn().mockRejectedValue(new Error("down")))).size).toBe(0);
  expect((await loadItemTips(a, [9], vi.fn().mockResolvedValue(Response.json({ "9": { n: 1 } })))).size).toBe(0);
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
  expect(off.zones.map((z) => z.uiMapId)).toEqual([1429]);
  // World y runs west and x north; the stitched map is x east, y south.
  expect(off.zones[0]).toMatchObject({ x: -1000, y: -500, width: 1000, height: 1000 });
  const on = continentArt(a, 0, true, true)!;
  expect(on.continent?.uiMapId).toBe(13);
  expect(on.zones.map((z) => z.uiMapId).sort()).toEqual([1429, 2548]);
  expect(continentArt(a, 0, false, false)!.continent?.uiMapId).toBe(13);
  expect(continentArt(a, 1, true, false)).toBeNull();
});

test("with a continent picture, a zone's own picture shows only when zoomed in over it", () => {
  const a = parseSiteManifest(siteManifest, BASE)!;
  const art = continentArt(a, 0, false, false)!;
  expect(zoneArtShown(art, { zoom: 1, cx: -500, cy: 0 })).toEqual([]);
  expect(zoneArtShown(art, { zoom: ZONE_ART_ZOOM, cx: -500, cy: 0 }).map((z) => z.uiMapId)).toEqual([1429]);
  expect(zoneArtShown(art, { zoom: ZONE_ART_ZOOM, cx: 3000, cy: 3000 })).toEqual([]);
  // Without one, every zone picture shows, largest first so the smaller ones sit on top.
  expect(zoneArtShown({ continent: null, zones: art.zones }, { zoom: 1, cx: 0, cy: 0 }).map((z) => z.uiMapId)).toEqual([1429]);
});
