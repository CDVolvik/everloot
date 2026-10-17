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

import AuctionsPage from "./page";

const today = new Date();
const dayAgo = (n: number) => new Date(today.getTime() - n * 86_400_000).toISOString();
const scans = (capturedAt: string, items: number[][]) => ["install-a", "install-b", "install-c"].map((installId, i) => ({
  kind: "auction_snapshot", installId, eventId: `${installId}:${capturedAt}`, capturedAt, realm: "Forever",
  scanId: `${installId}-${capturedAt}`, part: 1, parts: 1, items: items.map(([id, min, market]) => [id, 2, 40 + i, min, market]),
}));
const market = foldMarket(emptyMarket(), [
  ...scans(dayAgo(0), [[2589, 200, 205], [765, 30, 33]]),
  ...scans(dayAgo(3), [[2589, 180, 190]]),
  ...scans(dayAgo(30), [[4306, 900, 950]]),
], today);

const render = async (searchParams: Record<string, string>) =>
  renderToStaticMarkup(await AuctionsPage({ searchParams: Promise.resolve(searchParams) }));

beforeEach(() => {
  store.loadMarket.mockReset().mockResolvedValue({ state: market, dataAsOf: "2026-10-20T06:30:00.000Z" });
  store.loadCorpus.mockReset().mockResolvedValue({ uploads: 0, records: [], dataAsOf: "2026-10-20T06:30:00.000Z" });
});

test("with no realm the page lists the realms that have scans and says how values are made", async () => {
  const html = await render({});
  expect(html).toContain("Forever market");
  expect(html).toContain('href="/tools/auctions?realm=Forever"');
  expect(html).toContain("3 installs");
});

test("a realm lists its public items with market, minimum and historical values", async () => {
  const html = await render({ realm: "forever" });
  expect(html).toContain('href="/database/items/2589"');
  expect(html).toContain('href="/tools/auctions?realm=Forever&amp;item=2589"');
  expect(html).toContain("1s 98c"); // weighted market: (205*15 + 190*12) / 27 = 198
  expect(html).toContain("2s 0c");
  // Only historical days: the market value is unrecorded, never zero.
  expect(html).toMatch(/4306[\s\S]*unrecorded/);
});

test("an item shows its value, a 60-day chart and the day list", async () => {
  const html = await render({ realm: "Forever", item: "2589" });
  expect(html).toContain("Market value: 1s 98c");
  expect(html).toContain("<svg");
  expect(html).toContain("value 1s 90c");
  expect(html).toContain("Browse history");
});

test("a realm with nothing public says so; an unreadable rollup is unavailable, not zero", async () => {
  expect(await render({ realm: "Nightfall" })).toContain("No public market values on Nightfall yet");
  store.loadMarket.mockResolvedValue({ state: null, dataAsOf: null, unreachable: true });
  const html = await render({ realm: "Forever" });
  expect(html).toContain("unavailable");
  expect(html).not.toContain("0c");
});
