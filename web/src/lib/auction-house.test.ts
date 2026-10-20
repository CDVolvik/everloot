import { expect, test } from "vitest";
import { emptyMarket, foldMarket } from "../../../kb/src/market";
import {
  agreementSoFar, biggestMoves, itemAcrossRealms, itemIdParam, itemLabel, percent, realmBoards, realmSlug, recentlyUpdated,
  sitemapPaths, slugParam, timeAgo,
} from "./auction-house";

const now = new Date("2026-10-20T12:00:00.000Z");
const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000).toISOString();
/** One full scan per install; `items` are [itemId, unit market value] with 40 units each. */
const scans = (realm: string, daysAgo: number, items: [number, number][], installs = ["install-a", "install-b", "install-c"]) =>
  installs.map((installId) => ({
    kind: "auction_snapshot", installId, capturedAt: at(daysAgo), realm,
    items: items.map(([id, value]) => [id, 2, 40, value, value]),
  }));

const state = foldMarket(emptyMarket(), [
  ...scans("Forever", 0, [[2589, 205], [765, 33], [2592, 100]]),
  ...scans("Forever", 1, [[765, 30]]),
  ...scans("Forever", 7, [[2592, 80]]),
  ...scans("Forever", 30, [[4306, 950]]),
  ...scans("Mal'Ganis", 0, [[2589, 300]]),
  // Two reporters only: nothing public on Nightfall.
  ...scans("Nightfall", 0, [[2589, 999]], ["install-x", "install-y"]),
], now);

test("a realm's slug is lower case with apostrophes dropped, and only a slug-shaped segment is read", () => {
  expect(realmSlug("Mal'Ganis")).toBe("malganis");
  expect(realmSlug(" Argent  Dawn ")).toBe("argent-dawn");
  expect(realmSlug("Item")).toBe("item-realm");
  expect(slugParam("Argent-Dawn")).toBe("argent-dawn");
  expect(slugParam("a/b")).toBeNull();
  expect(slugParam("%E0%A4%A")).toBeNull();
  expect(itemIdParam("2589")).toBe(2589);
  expect(itemIdParam("0")).toBeNull();
  expect(itemIdParam("25x")).toBeNull();
});

test("only realms with a public value get a board; Nightfall's two reporters show on the meter, not as a realm", () => {
  const boards = realmBoards(state, now);
  expect(boards.map((b) => b.realm.slug)).toEqual(["forever", "malganis"]);
  const forever = boards[0]!;
  expect(forever.rows.map((r) => r.value.itemId).sort((a, b) => a - b)).toEqual([765, 2589, 2592, 4306]);
  expect(forever.reporters).toBe(3);
  expect(forever.updatedAt).toBe(Date.parse(at(0)));
  expect(agreementSoFar(state, "nightfall")).toBe(2);
  expect(agreementSoFar(state, "nightfall", 765)).toBe(0);
  // A public realm still reads at most 2: the meter is for what is below the gate.
  expect(agreementSoFar(state, "forever")).toBe(2);
});

test("moves compare the newest solid day with the day before, or a week before", () => {
  const rows = realmBoards(state, now)[0]!.rows;
  const day = biggestMoves(rows, 1, now, 10);
  expect(day.map((m) => [m.row.value.itemId, percent(m.change)])).toEqual([[765, "+10%"]]);
  const week = biggestMoves(rows, 7, now, 10);
  expect(week.map((m) => [m.row.value.itemId, percent(m.change)])).toEqual([[2592, "+25%"]]);
  // An item last scanned 30 days ago has no recent scan time.
  expect(recentlyUpdated(rows, 10).map((r) => r.value.itemId)).not.toContain(4306);
});

test("the sitemap lists realms, items on a realm and items across realms, only with a market value", () => {
  const paths = sitemapPaths(realmBoards(state, now));
  expect(paths).toContain("/tools/auctions/forever");
  expect(paths).toContain("/tools/auctions/forever/2589");
  expect(paths).toContain("/tools/auctions/malganis/2589");
  expect(paths).toContain("/tools/auctions/item/2589");
  // Only a day 30 days back: no market value, so not indexed.
  expect(paths.filter((p) => p.endsWith("/4306"))).toEqual([]);
  expect(paths.some((p) => p.includes("nightfall"))).toBe(false);
  expect(new Set(paths).size).toBe(paths.length);
});

test("an item across realms, and its label until names are shown", () => {
  expect(itemAcrossRealms(realmBoards(state, now), 2589).map((r) => r.realm.name)).toEqual(["Forever", "Mal'Ganis"]);
  expect(itemLabel(2589)).toBe("Item 2589");
  expect(itemLabel(2589, new Map([[2589, "Linen Cloth"]]))).toBe("Linen Cloth");
});

test("ages read in minutes, hours and days", () => {
  const t = now.getTime();
  expect(timeAgo(t - 20_000, t)).toBe("just now");
  expect(timeAgo(t - 12 * 60_000, t)).toBe("12 min ago");
  expect(timeAgo(t - 3 * 3_600_000, t)).toBe("3 h ago");
  expect(timeAgo(t - 3 * 86_400_000, t)).toBe("3 days ago");
  expect(percent(-0.08)).toBe("−8%");
});
