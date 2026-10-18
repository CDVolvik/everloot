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

import Home from "@/app/page";
import DropsPage from "@/app/database/drops/page";
import AuctionsPage from "@/app/tools/auctions/page";
import ProfessionsPage from "@/app/tools/professions/page";
import RaidPage from "@/app/tools/raid/page";
import MapPage from "@/app/map/page";
import ItemPage from "@/app/database/items/[id]/page";
import VendorPage from "@/app/database/vendors/[id]/page";

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

const ART = /<img|<image|data-game-credit|data-item-tip|Blizzard Entertainment, Inc\.|Classes and professions|Game map art/;

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
  expect(html).toContain("Item #9");
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
  vi.stubGlobal("fetch", bucket());
  const html = await render(() => RaidPage());
  expect(html).toMatch(/<img[^>]*icons\/8001\.webp[^>]*\/?>Battle Shout/);
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

test("map: zone pictures under the outlines; held-back zones and the continent picture only with spoilers", async () => {
  vi.stubEnv("NEXT_PUBLIC_GAME_ASSETS_URL", BASE);
  vi.stubGlobal("fetch", bucket());
  const off = await render(() => MapPage({ searchParams: Promise.resolve({ continent: "0" }) }));
  // Zoomed out, the zones in view from their small copies; never a held-back zone or the continent picture.
  expect(off).toContain(`href="${BASE}/maps/1429-small.webp"`);
  expect(off).not.toContain("maps/1429.webp");
  expect(off).not.toContain("maps/2548");
  expect(off).not.toContain("maps/13");
  expect(off).toContain("Game map art");
  expect(off).toContain("Zones");
  expect(off).not.toContain("No game art.");
  expect(off).toContain(CREDIT);
  // With spoilers on, the continent's own picture; zone pictures then wait until the reader zooms in.
  const on = await render(() => MapPage({ searchParams: Promise.resolve({ continent: "0", spoilers: "1" }) }));
  expect(on).toContain(`href="${BASE}/maps/13.webp"`);
  expect(on).not.toContain("maps/1429");
  // The page's description no longer says "No game art" once the pictures are on.
  const { generateMetadata } = await import("@/app/map/page");
  expect((await generateMetadata()).description).toContain("The map pictures are the game's own.");
  // Kalimdor has no pictures in this upload: no art, no credit.
  const kalimdor = await render(() => MapPage({ searchParams: Promise.resolve({ continent: "1" }) }));
  expect(kalimdor).not.toMatch(/<image|data-game-credit/);
});
