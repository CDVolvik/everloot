import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { emptyMarket, foldMarket } from "../../../../kb/src/market";
import { itemIndex, shard0, siteManifest } from "@/lib/game-assets.fixture";
import { forgetPrivateReads } from "@/lib/game-assets";
import { CREDIT } from "@/lib/talents/assets";

const store = vi.hoisted(() => ({ loadCorpus: vi.fn(), loadMarket: vi.fn() }));
vi.mock("@/lib/upload-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/upload-store")>()),
  uploadStore: { loadCorpus: store.loadCorpus, loadMarket: store.loadMarket },
}));
// Like next/link, every other prop (aria-describedby, aria-current) reaches the anchor.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

// The map's pictures are drawn in the browser, so the page hands them to the map as props: this puts them in the markup to read.
vi.mock("@/components/WorldMapView", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/components/WorldMapView")>();
  return { default: (props: Parameters<typeof real.default>[0]) => <><i data-map-art={JSON.stringify(props.art ?? null)} />{real.default(props)}</> };
});

import Home from "@/app/page";
import DropsPage from "@/app/database/drops/page";
import AuctionsPage from "@/app/tools/auctions/page";
import ProfessionsPage from "@/app/tools/professions/page";
import RaidPage from "@/app/tools/raid/page";
import MapPage from "@/app/map/page";
import ItemPage from "@/app/database/items/[id]/page";
import VendorPage from "@/app/database/vendors/[id]/page";
import ChangesPage from "@/app/changes/page";
import WowForeverPage from "@/app/wow-forever/page";

const BASE = "https://assets.example.test/wow_classic_beta-70450-84bea423";
const PRIVATE = "https://r2.example.test/everloot-game-data/wow_classic_beta-70450-84bea423";
/** The server-only variables for the private item bucket. */
function privateBucket() {
  vi.stubEnv("GAME_DATA_S3_ENDPOINT", "https://r2.example.test");
  vi.stubEnv("GAME_DATA_BUCKET", "everloot-game-data");
  vi.stubEnv("GAME_DATA_ACCESS_KEY_ID", "id");
  vi.stubEnv("GAME_DATA_SECRET_ACCESS_KEY", "secret");
}

// Three installs saw item 9 drop from NPC 77, so its row is public; three scanned it on the auction house.
const loot = (install: string) => ({
  kind: "loot", eventId: `${install}:77:1`, installId: install, capturedAt: "2026-10-09T00:00:00.000Z",
  sourceNpcId: 77, sourceEvidence: "loot-api", items: [{ itemId: 9, count: 1 }],
});
const today = new Date();
const market = foldMarket(emptyMarket(), ["install-a", "install-b", "install-c"].map((installId, i) => ({
  kind: "auction_snapshot", installId, eventId: `${installId}:s`, capturedAt: today.toISOString(), realm: "Forever",
  scanId: `${installId}-s`, part: 1, parts: 1, items: [[9, 2, 40 + i, 10, 12]],
})), today);

const pages: [string, () => Promise<ReactNode>][] = [
  ["home", () => Home()],
  ["drops", () => DropsPage()],
  ["auctions", () => AuctionsPage({ searchParams: Promise.resolve({ realm: "Forever" }) })],
  ["professions", () => ProfessionsPage({ searchParams: Promise.resolve({}) })],
  ["raid", () => RaidPage()],
  ["map", () => MapPage({ searchParams: Promise.resolve({}) })],
  ["item", () => ItemPage({ params: Promise.resolve({ id: "9" }) })],
  ["vendor", () => VendorPage({ params: Promise.resolve({ id: "1" }) })],
  ["changes", () => ChangesPage({ searchParams: Promise.resolve({}) })],
  ["wow-forever", () => WowForeverPage()],
];
const render = async (page: () => Promise<ReactNode>) => renderToStaticMarkup(await page());

/** The public asset folder and the private item bucket, as the server reads them. Item files are only in the private one. */
function bucket(manifest: unknown = siteManifest) {
  return vi.fn(async (input: string | Request) => {
    const url = typeof input === "string" ? input : input.url;
    if (url === `${BASE}/manifest.json`) return Response.json(manifest);
    if (url === `${PRIVATE}/items.json`) return Response.json(itemIndex);
    if (url === `${PRIVATE}/items/0.json`) return Response.json(shard0);
    return new Response("not found", { status: 404 });
  });
}

beforeEach(() => {
  forgetPrivateReads();
  store.loadCorpus.mockReset().mockResolvedValue({ uploads: 3, records: ["install-a", "install-b", "install-c"].map(loot), dataAsOf: "2026-10-09T00:00:00.000Z" });
  store.loadMarket.mockReset().mockResolvedValue({ state: market, dataAsOf: "2026-10-09T00:00:00.000Z" });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const ART = /<img|<image|data-game-credit|data-item-tip|data-spell-tip|data-page-banner|data-launch-banner|Blizzard Entertainment, Inc\.|Classes and professions|Game map art/;

test.each(pages)("%s: with the asset URL unset there is no image, no tooltip, no credit and no fetch", async (_name, page) => {
  vi.stubEnv("NEXT_PUBLIC_GAME_ASSETS_URL", "");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const html = await render(page);
  expect(html).not.toMatch(ART);
  expect(fetcher).not.toHaveBeenCalled();
});

test.each(pages)("%s: a manifest that cannot be read leaves the same text-only page", async (_name, page) => {
  vi.stubEnv("NEXT_PUBLIC_GAME_ASSETS_URL", "");
  vi.stubGlobal("fetch", vi.fn());
  const plain = await render(page);
  vi.stubEnv("NEXT_PUBLIC_GAME_ASSETS_URL", BASE);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })));
  expect(await render(page)).toBe(plain);
});

test("drops and auctions: the item's icon beside its link, the tooltip as its description, and the credit", async () => {
  vi.stubEnv("NEXT_PUBLIC_GAME_ASSETS_URL", BASE);
  privateBucket();
  const fetcher = bucket();
  vi.stubGlobal("fetch", fetcher);
  for (const page of [() => DropsPage(), () => AuctionsPage({ searchParams: Promise.resolve({ realm: "Forever" }) })]) {
    const html = await render(page);
    expect(html).toContain(`src="${BASE}/icons/132889.webp"`);
    expect(html).toMatch(/<img[^>]*alt=""[^>]*aria-hidden="true"/);
    expect(html).toContain('href="/database/items/9"');
    expect(html).toMatch(/aria-describedby="[^"]+"/);
    expect(html).toContain("Linen Cloth, Common");
    expect(html).toContain(CREDIT);
    expect(html).toContain("1.60.1.70450");
  }
  // Item data is read from the private bucket, never from the public asset folder.
  const urls = fetcher.mock.calls.map(([input]) => (typeof input === "string" ? input : input.url));
  expect(urls.some((u) => u.startsWith(`${BASE}/items`))).toBe(false);
  expect(urls).toContain(`${PRIVATE}/items/0.json`);
});

test("without the private bucket's variables, item links stay plain: no item icon, no tooltip, no credit for items", async () => {
  vi.stubEnv("NEXT_PUBLIC_GAME_ASSETS_URL", BASE);
  vi.stubGlobal("fetch", bucket());
  const html = await render(() => DropsPage());
  expect(html).not.toMatch(/data-item-tip|<img|data-game-credit/);
  expect(html).toContain("Item 9");
});

test("item page: the tooltip card for an item players reported; an id nobody reported reads nothing at all", async () => {
  vi.stubEnv("NEXT_PUBLIC_GAME_ASSETS_URL", BASE);
  privateBucket();
  const fetcher = bucket();
  vi.stubGlobal("fetch", fetcher);
  const seen = await render(() => ItemPage({ params: Promise.resolve({ id: "9" }) }));
  expect(seen).toContain("data-item-card");
  expect(seen).toContain("Linen Cloth");
  expect(seen).toContain(CREDIT);
  // Item 25 is in the same shard, but no install reported it: a typed id must not reveal it.
  fetcher.mockClear();
  forgetPrivateReads();
  const typed = await render(() => ItemPage({ params: Promise.resolve({ id: "25" }) }));
  expect(typed).not.toMatch(/data-item-card|Worn Shortsword|<img|data-game-credit/);
  expect(fetcher).not.toHaveBeenCalled();
});

test("home: class icons link to the talent calculator and profession icons to their hub, names kept", async () => {
  vi.stubEnv("NEXT_PUBLIC_GAME_ASSETS_URL", BASE);
  vi.stubGlobal("fetch", bucket());
  const html = await render(() => Home());
  expect(html).toContain("Classes and professions");
  expect(html).toMatch(/href="\/tools\/talents\/warrior"[^>]*><img[^>]*icons\/6001\.webp[^>]*\/?>Warrior/);
  expect(html).toMatch(/href="\/tools\/professions\?profession=Alchemy"[^>]*><img[^>]*icons\/7001\.webp[^>]*\/?>Alchemy/);
  expect(html).not.toContain("Riding");
  expect(html).toContain(CREDIT);
});

test("raid builder: buff icons beside the effect names, and the credit", async () => {
  vi.stubEnv("NEXT_PUBLIC_GAME_ASSETS_URL", BASE);
  vi.stubGlobal("fetch", bucket({ ...siteManifest, spellTips: {}, loadingScreens: {} }));
  const html = await render(() => RaidPage());
  expect(html).toMatch(/<img[^>]*icons\/8001\.webp[^>]*\/?>Battle Shout/);
  expect(html).toContain(CREDIT);
});

test("raid builder: a raid's loading screen above the title, and a buff's tooltip on hover and focus", async () => {
  vi.stubEnv("NEXT_PUBLIC_GAME_ASSETS_URL", BASE);
  vi.stubGlobal("fetch", bucket());
  const html = await render(() => RaidPage());
  expect(html).toMatch(/<div aria-hidden="true" data-page-banner[^>]*><img[^>]*src="[^"]*loading\/9409\.webp"[^>]*alt=""[^>]*aria-hidden="true"/);
  expect(html.indexOf("data-page-banner")).toBeLessThan(html.indexOf("<h1"));
  // The name stays text, focusable, described by the tooltip text.
  expect(html).toMatch(/data-spell-tip[^>]*><img[^>]*icons\/8001\.webp[^>]*\/?><span tabindex="0"[^>]*aria-describedby="[^"]+"[^>]*>Battle Shout<\/span>/);
  expect(html).toContain("Battle Shout. Raises attack power by 20 for 2 min. found in game files, unconfirmed · build 1.60.1.70450.");
  expect(html).toContain("Icons, tooltip text and loading screen art from game build 1.60.1.70450");
});

test("home: the launch banner shows the game's own logo, the name and the disclaimer as text, and the credit", async () => {
  vi.stubEnv("NEXT_PUBLIC_GAME_ASSETS_URL", BASE);
  vi.stubGlobal("fetch", bucket());
  const html = await render(() => Home());
  const banner = html.slice(html.indexOf("data-launch-banner"), html.indexOf("Every drop."));
  expect(banner).toMatch(/<img[^>]*src="[^"]*logo\/logo-wow-forever-2x\.webp"[^>]*alt=""[^>]*aria-hidden="true"/);
  expect(banner).toMatch(/<img[^>]*src="[^"]*loading\/9000\.webp"[^>]*alt=""[^>]*aria-hidden="true"/);
  expect(banner).toContain(">World of Warcraft: Forever</p>");
  expect(banner).toContain("Not affiliated with or endorsed by Blizzard Entertainment.");
  // The countdown sits on the banner, and only there.
  expect(banner).toMatch(/href="\/wow-forever"[^>]*>WoW: Forever launches <time/);
  expect(html.match(/WoW: Forever launches/g)).toHaveLength(1);
  expect(banner).toContain("Logo and loading screen art from game build 1.60.1.70450");
  expect(html.indexOf("data-launch-banner")).toBeLessThan(html.indexOf("<h1"));
});

test("home: without the game's logo in the upload there is no launch banner, and nothing stands in for it", async () => {
  vi.stubEnv("NEXT_PUBLIC_GAME_ASSETS_URL", BASE);
  vi.stubGlobal("fetch", bucket({ ...siteManifest, logo: null }));
  const html = await render(() => Home());
  expect(html).not.toMatch(/data-launch-banner|logo-wow|World of Warcraft: Forever<\/p>/);
  expect(html).not.toContain("loading/9000");
  // The countdown stays in the hero.
  expect(html).toContain("WoW: Forever launches");
});

test("wow-forever: race and faction emblems beside the names in the race and class table, and the credit", async () => {
  vi.stubEnv("NEXT_PUBLIC_GAME_ASSETS_URL", BASE);
  vi.stubGlobal("fetch", bucket());
  const html = await render(() => WowForeverPage());
  expect(html).toMatch(/<caption[^>]*><img[^>]*emblems\/HordeEmblem\.webp"[^>]*alt=""[^>]*aria-hidden="true"[^>]*\/?>Horde<\/caption>/);
  expect(html).toMatch(/<th scope="row"[^>]*><img[^>]*emblems\/raceicon128-human-female\.webp"[^>]*\/?>Human<\/th>/);
  expect(html).toMatch(/<th scope="row"[^>]*><img[^>]*emblems\/raceicon128-nightelf-male\.webp"[^>]*\/?>Night Elf<\/th>/);
  // A race the upload has no icon for keeps its plain name.
  expect(html).toMatch(/<th scope="row"[^>]*>Orc<\/th>/);
  expect(html).toContain("Race and faction emblems from game build 1.60.1.70450");
});

test("map: each dungeon's loading screen beside its entrance in the list", async () => {
  vi.stubEnv("NEXT_PUBLIC_GAME_ASSETS_URL", BASE);
  vi.stubGlobal("fetch", bucket());
  const html = await render(() => MapPage({ searchParams: Promise.resolve({ continent: "0" }) }));
  expect(html).toMatch(/<li class="flex items-center gap-3"><img src="[^"]*loading\/9036-small\.webp" alt="" aria-hidden="true"[^>]*><span class="min-w-0"><span class="text-fg">Deadmines<\/span>/);
  expect(html).toContain("Map pictures and loading screen art from game build");
});

test("patch notes: a loading screen above the title, and a spell a post names gets its icon, tooltip and link", async () => {
  vi.stubEnv("NEXT_PUBLIC_GAME_ASSETS_URL", BASE);
  vi.stubGlobal("fetch", bucket());
  const html = await render(() => ChangesPage({ searchParams: Promise.resolve({}) }));
  expect(html).toMatch(/data-page-banner[^>]*><img[^>]*loading\/9001\.webp/);
  expect(html.indexOf("data-page-banner")).toBeLessThan(html.indexOf("<h1"));
  expect(html).toContain(CREDIT);
});

test("professions: a picker of profession icons with their names", async () => {
  vi.stubEnv("NEXT_PUBLIC_GAME_ASSETS_URL", BASE);
  vi.stubGlobal("fetch", bucket());
  const html = await render(() => ProfessionsPage({ searchParams: Promise.resolve({ profession: "alchemy" }) }));
  expect(html).toMatch(/<nav aria-label="Professions"/);
  expect(html).toMatch(/href="\/tools\/professions\?profession=Alchemy&amp;from=1&amp;to=75" aria-current="page"[^>]*><img[^>]*icons\/7001\.webp[^>]*\/?>Alchemy/);
  expect(html).toContain(CREDIT);
});

test("map: the continent picture and zone pictures; held-back zones only with spoilers", async () => {
  vi.stubEnv("NEXT_PUBLIC_GAME_ASSETS_URL", BASE);
  vi.stubGlobal("fetch", bucket());
  const art = (html: string): { continent: { url: string } | null; zones: { url: string; smallUrl: string | null }[] } | null =>
    JSON.parse((html.match(/data-map-art="([^"]*)"/)![1]!).replaceAll("&quot;", '"'));
  const off = await render(() => MapPage({ searchParams: Promise.resolve({ continent: "0" }) }));
  // The continent's own picture always; never a held-back zone's.
  expect(art(off)!.continent!.url).toBe(`${BASE}/maps/13.webp`);
  expect(art(off)!.zones.find((z) => z.url === `${BASE}/maps/1429.webp`)?.smallUrl).toBe(`${BASE}/maps/1429-small.webp`);
  expect(off).not.toContain("maps/2548");
  expect(off).toContain("Game map art");
  expect(off).not.toContain("No game art.");
  expect(off).toContain(CREDIT);
  // With spoilers on, the held-back zone's picture too.
  const on = await render(() => MapPage({ searchParams: Promise.resolve({ continent: "0", spoilers: "1" }) }));
  expect(art(on)!.zones.some((z) => z.url === `${BASE}/maps/2548.webp`)).toBe(true);
  // The page's description no longer says "No game art" once the pictures are on.
  const { generateMetadata } = await import("@/app/map/page");
  expect((await generateMetadata()).description).toContain("The map pictures are the game's own.");
  // Kalimdor has no map pictures in this upload: none drawn, and no credit for them.
  const kalimdor = await render(() => MapPage({ searchParams: Promise.resolve({ continent: "1" }) }));
  expect(art(kalimdor)).toBeNull();
  expect(kalimdor).not.toMatch(/Map pictures/);
});

