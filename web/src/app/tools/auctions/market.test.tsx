import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import { emptyMarket, foldMarket } from "../../../../../kb/src/market";

const store = vi.hoisted(() => ({ loadMarket: vi.fn(), loadCorpus: vi.fn() }));
vi.mock("@/lib/upload-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/upload-store")>()),
  uploadStore: { loadMarket: store.loadMarket, loadCorpus: store.loadCorpus },
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); },
  permanentRedirect: (url: string) => { throw new Error(`PERMANENT ${url}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));

import AuctionHousePage from "./page";
import RealmPage, { generateMetadata as realmMetadata } from "./[realm]/page";
import RealmItemPage, { generateMetadata as itemMetadata } from "./[realm]/[itemId]/page";
import CrossRealmItemPage, { generateMetadata as crossMetadata } from "./item/[itemId]/page";
import { GET as sitemapIndex } from "../../auctions-sitemap.xml/route";
import { GET as sitemapChunk } from "../../auctions-sitemap/[n]/route";

const today = new Date();
const dayAgo = (n: number) => new Date(today.getTime() - n * 86_400_000).toISOString();
const scans = (capturedAt: string, items: number[][], realm = "Forever", installs = ["install-a", "install-b", "install-c"]) => installs.map((installId, i) => ({
  kind: "auction_snapshot", installId, eventId: `${installId}:${capturedAt}`, capturedAt, realm,
  scanId: `${installId}-${capturedAt}`, part: 1, parts: 1, items: items.map(([id, min, market]) => [id, 2, 40 + i, min, market]),
}));
const market = foldMarket(emptyMarket(), [
  ...scans(dayAgo(0), [[2589, 200, 205], [765, 30, 33]]),
  ...scans(dayAgo(1), [[765, 28, 30]]),
  ...scans(dayAgo(3), [[2589, 180, 190]]),
  ...scans(dayAgo(30), [[4306, 900, 950]]),
  ...scans(dayAgo(0), [[2589, 260, 300]], "Mal'Ganis"),
  ...scans(dayAgo(0), [[2589, 900, 999]], "Nightfall", ["install-x", "install-y"]),
], today);

// The rendered text of the markup: tags out, then any stray angle bracket (React escapes real ones as &lt;).
const text = (html: string) => html.replace(/<[^>]*>/g, "").replace(/[<>]/g, "");
const hub = async (searchParams: Record<string, string>) =>
  renderToStaticMarkup(await AuctionHousePage({ searchParams: Promise.resolve(searchParams) }));
const realm = (slug: string) => ({ params: Promise.resolve({ realm: slug }) });
const item = (slug: string, id: string) => ({ params: Promise.resolve({ realm: slug, itemId: id }) });

beforeEach(() => {
  store.loadMarket.mockReset().mockResolvedValue({ state: market, dataAsOf: new Date(today.getTime() - 4 * 60_000).toISOString() });
  store.loadCorpus.mockReset().mockResolvedValue({ uploads: 0, records: [], dataAsOf: "2026-10-20T06:30:00.000Z" });
});

test("the hub lists the realms with public prices, the boards across them and the way to add a realm", async () => {
  const html = await hub({});
  expect(html).toContain("Auction House");
  expect(text(html)).toContain("Prices updated 4 min ago");
  expect(html).toContain('href="/tools/auctions/forever"');
  expect(html).toContain('href="/tools/auctions/malganis"');
  // Two reporters are not enough: Nightfall is not listed.
  expect(html).not.toContain("Nightfall");
  expect(html).toContain('href="/tools/auctions/forever/2589"');
  expect(html).toContain("Item 2589");
  expect(html).toContain("Moves 24h");
  expect(html).toContain("+10%");
  expect(html).toContain('href="/addon"');
  expect(html).toContain('href="/addon#desktop"');
  expect(html).toContain("3 reporters");
});

test("the search form lands on the clean URLs, and so do the old page's links", async () => {
  await expect(hub({ realm: "Forever" })).rejects.toThrow("REDIRECT /tools/auctions/forever");
  await expect(hub({ realm: "Mal'Ganis", q: "2589" })).rejects.toThrow("REDIRECT /tools/auctions/malganis/2589");
  await expect(hub({ realm: "Forever", item: "2589" })).rejects.toThrow("REDIRECT /tools/auctions/forever/2589");
  await expect(hub({ q: "2589" })).rejects.toThrow("REDIRECT /tools/auctions/item/2589");
  // A word is a name search; no names are shown yet, so it says to use the id.
  expect(text(await hub({ q: "linen" }))).toContain("search by item id for now");
});

test("a realm page lists its items with market, minimum and historical values", async () => {
  const html = renderToStaticMarkup(await RealmPage(realm("forever")));
  expect(html).toContain('href="/tools/auctions/forever/2589"');
  expect(html).toContain("1s 98c"); // weighted market: (205*15 + 190*12) / 27 = 198
  expect(html).toContain("2s 0c");
  // Only historical days: the market value is unrecorded, never zero.
  expect(html).toMatch(/Item 4306[\s\S]*unrecorded/);
  expect((await realmMetadata(realm("forever"))).robots).toMatchObject({ index: true });
  await expect(RealmPage(realm("Forever"))).rejects.toThrow("PERMANENT /tools/auctions/forever");
  await expect(RealmPage(realm("a.b"))).rejects.toThrow("NOT_FOUND");
});

test("a realm below the gate shows the meter at its count, says why, and is not indexed", async () => {
  const html = renderToStaticMarkup(await RealmPage(realm("nightfall")));
  expect(html).toContain("No public prices on Nightfall yet");
  expect(html).toContain('data-agreement="2"');
  expect(html).toContain('href="/addon"');
  expect((await realmMetadata(realm("nightfall"))).robots).toMatchObject({ index: false });
});

test("an item page shows its value, a 60-day chart, the other realms and a Dataset", async () => {
  const html = renderToStaticMarkup(await RealmItemPage(item("forever", "2589")));
  expect(text(html)).toContain("Market value1s 98c");
  expect(html).toContain("<svg");
  expect(html).toContain('href="/tools/auctions/malganis/2589"');
  expect(html).toContain('href="/tools/auctions/item/2589"');
  // The day list: three days ago the value was 1s 90c.
  expect(html).toMatch(/<td[^>]*>[^<]*<\/td><td[^>]*>1s 90c<\/td>/);
  expect(html).toContain('"@type":"Dataset"');
  expect(html).not.toMatch(/"@type":"(Product|Offer|AggregateRating|Review)"/);
  const meta = await itemMetadata(item("forever", "2589"));
  expect(meta.title).toBe("WoW Forever Item 2589 Price on Forever");
  expect(meta.alternates?.canonical).toBe("/tools/auctions/forever/2589");
  expect(meta.robots).toMatchObject({ index: true });
});

test("an item with no market value in 14 days, or none at all, is not indexed", async () => {
  expect((await itemMetadata(item("forever", "4306"))).robots).toMatchObject({ index: false });
  const html = renderToStaticMarkup(await RealmItemPage(item("forever", "9999")));
  expect(html).toContain("No public price for Item 9999 on Forever yet");
  expect(html).not.toContain('"@type":"Dataset"');
  expect((await itemMetadata(item("forever", "9999"))).robots).toMatchObject({ index: false });
  await expect(RealmItemPage(item("forever", "02589"))).rejects.toThrow("NOT_FOUND");
});

test("the cross-realm page compares every realm with a price", async () => {
  const props = { params: Promise.resolve({ itemId: "2589" }) };
  const html = text(renderToStaticMarkup(await CrossRealmItemPage(props)));
  expect(html).toContain("Lowest market value1s 98c");
  expect(html).toContain("Highest market value3s 0c");
  expect(html).toContain("Mal&#x27;Ganis");
  expect((await crossMetadata(props)).robots).toMatchObject({ index: true });
  expect((await crossMetadata({ params: Promise.resolve({ itemId: "9999" }) })).robots).toMatchObject({ index: false });
});

test("the Auction House sitemap lists only the indexable pages", async () => {
  expect(await (await sitemapIndex()).text()).toContain("/auctions-sitemap/0.xml");
  const xml = await (await sitemapChunk(new Request("https://everloot.app/auctions-sitemap/0.xml"), { params: Promise.resolve({ n: "0.xml" }) })).text();
  expect(xml).toContain("/tools/auctions/forever/2589</loc>");
  expect(xml).toContain("/tools/auctions/item/2589</loc>");
  expect(xml).not.toContain("4306");
  expect(xml).not.toContain("nightfall");
  store.loadMarket.mockResolvedValue({ state: null, dataAsOf: null, unreachable: true });
  expect((await sitemapIndex()).status).toBe(503);
});

test("an unreadable rollup is unavailable, not zero", async () => {
  store.loadMarket.mockResolvedValue({ state: null, dataAsOf: null, unreachable: true });
  for (const html of [await hub({}), renderToStaticMarkup(await RealmPage(realm("forever"))), renderToStaticMarkup(await RealmItemPage(item("forever", "2589")))]) {
    expect(html).toContain("unavailable");
    expect(html).not.toContain("0c");
  }
});
