import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";

// The page reads the stored corpus through the same aggregates as the other upload pages, so these tests
// feed raw census rows in and check what reaches the HTML.
const store = vi.hoisted(() => ({ loadCorpus: vi.fn() }));
vi.mock("@/lib/upload-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/upload-store")>()),
  uploadStore: { loadCorpus: store.loadCorpus },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, className, ...rest }: { href: string; children: ReactNode; className?: string; "aria-current"?: "page" }) => (
    <a href={href} className={className} aria-current={rest["aria-current"]}>{children}</a>
  ),
}));

import CensusPage, { metadata } from "./page";
import { STORAGE_UNREACHABLE } from "@/lib/upload-store";
import { CLASSES, LAUNCH_AT, RACES } from "@/data/wow-forever";
import { CENSUS_CLASSES, CENSUS_LAUNCH, CENSUS_RACES } from "../../../../kb/src/census";

let n = 0;
/** `count` characters of one race and class, reported by three installs in turn. */
const crowd = (count: number, prefix: string, over: Record<string, unknown> = {}) =>
  Array.from({ length: count }, (_, i) => ({
    kind: "census_seen", installId: `install-${"abc"[i % 3]}`, eventId: `install-x:census:${++n}`,
    capturedAt: "2026-11-15T10:00:00.000Z", characterKey: `${prefix}${i.toString(16).padStart(4, "0")}`, serverId: 4,
    race: "Gnome", class: "PRIEST", level: 20, faction: "Alliance", via: "target", ...over,
  }));
const RECORDS = [
  ...crowd(42, "a1", { race: "Human", class: "HUNTER" }),
  ...crowd(28, "a2", { race: "Human", class: "WARRIOR", level: 60 }),
  ...crowd(16, "a3"),
  ...crowd(22, "a4", { race: "Orc", class: "HUNTER", faction: "Horde" }),
  ...crowd(4, "a5", { race: "Gnome", class: "MAGE" }),
  ...crowd(30, "a6", { kind: "census_self", realm: "Forever", via: undefined, race: "Troll", class: "PRIEST", faction: "Horde", capturedAt: "2026-11-06T10:00:00.000Z" }),
];
// Each corpus gets its own data time: the aggregates are cached per corpus version.
let version = 0;
const corpus = (records: unknown[]) => ({
  uploads: records.length, records, dataAsOf: new Date(Date.UTC(2026, 10, 16, 12, version++)).toISOString(),
});
const html = async (window?: string) => renderToStaticMarkup(await CensusPage({ searchParams: Promise.resolve(window ? { window } : {}) }));
const text = (page: string) => page.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ");

beforeEach(() => store.loadCorpus.mockReset());

test("at launch, with nothing reported, the page is collecting: no table, no number, how to take part", async () => {
  store.loadCorpus.mockResolvedValue(corpus([]));
  const page = await html();
  expect(page).not.toContain("<table");
  expect(text(page)).toContain("Still collecting");
  expect(text(page)).toContain("at least 10 characters reported by at least 3 installs");
  expect(page).toContain("/everloot census on");
  expect(page).toContain('href="/methodology#population"');
  expect(page).toContain('href="/upload"');
});

test("the top sentence says how many characters, from how many installs, in which window, and links how we count", async () => {
  store.loadCorpus.mockResolvedValue(corpus(RECORDS));
  const page = text(await html());
  expect(page).toContain("About 110 characters were active in the last 7 days (2026-11-10 to 2026-11-16, UTC), counted from 3 installs");
  expect(page).toContain("How we count");
});

test("factions, classes, races and level bands show rounded counts; a small cell reads fewer than 10", async () => {
  store.loadCorpus.mockResolvedValue(corpus(RECORDS));
  const page = await html();
  const words = text(page);
  expect(words).toMatch(/Hunter 65 /);
  expect(words).toMatch(/Mage fewer than 10/);
  expect(words).toMatch(/Alliance 90 /);
  expect(words).toMatch(/At 60 30 /);
  expect(page).toContain("Factions");
  expect(page).toContain("Level bands");
});

test("the race and class grid is Blizzard's table per faction, with counts in the playable cells", async () => {
  store.loadCorpus.mockResolvedValue(corpus(RECORDS));
  const page = await html();
  const grids = page.match(/<table[^>]*>\s*<caption[^>]*>[^<]*(Horde|Alliance) races and classes[\s\S]*?<\/table>/g)!;
  expect(grids).toHaveLength(2);
  const alliance = grids.find((g) => g.includes("Alliance races"))!;
  expect(text(alliance)).toMatch(/Gnome .*15/);
  expect(alliance).toContain("Not playable");
  expect(alliance).toContain("fewer than 10");
});

test("since launch is a second window, linked from the first and marked as the current one", async () => {
  store.loadCorpus.mockResolvedValue(corpus(RECORDS));
  const week = await html();
  expect(week).toMatch(/<a href="\/census" [^>]*aria-current="page"/);
  const launch = await html("launch");
  expect(launch).toMatch(/<a href="\/census\?window=launch" [^>]*aria-current="page"/);
  expect(text(launch)).toContain("About 140 characters were seen since launch (2026-11-04 to 2026-11-16, UTC)");
});

test("the 7-day trend lists each day, and the bias line says how many were seen and how many are uploaders' own", async () => {
  store.loadCorpus.mockResolvedValue(corpus(RECORDS));
  const words = text(await html("launch"));
  expect(words).toContain("2026-11-15 110");
  expect(words).toMatch(/2026-11-10 fewer than 10/);
  expect(words).toContain("79% players seen by uploaders, 21% uploaders' own characters");
});

test("no character key, install id or event id reaches the page", async () => {
  store.loadCorpus.mockResolvedValue(corpus(RECORDS));
  const page = (await html()) + (await html("launch"));
  expect(page).not.toContain("install-");
  expect(page).not.toMatch(/a[1-6]00[0-9a-f]{2}/);
  expect(page).not.toContain("census:");
});

test("unreadable storage says so, never a collecting page or a zero", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [], unreachable: true });
  const page = await html();
  expect(page).toContain(STORAGE_UNREACHABLE);
  expect(page).not.toContain("Still collecting");
  expect(page).not.toContain("<table");
});

test("the page has its own title, description and canonical", () => {
  expect(metadata.title).toBe("WoW Forever Census: Races, Classes and Levels");
  expect(metadata.description).toContain("10 characters");
  expect(metadata.alternates?.canonical).toBe("/census");
});

test("the rollup's race and class table and launch time are the ones /wow-forever shows", () => {
  expect(CENSUS_LAUNCH).toBe(new Date(LAUNCH_AT).toISOString());
  expect(CENSUS_CLASSES.map((c) => c.name)).toEqual([...CLASSES]);
  const fromRollup = CENSUS_RACES.map((r) => [r.faction, r.name, r.classes.map((c) => CENSUS_CLASSES.find((x) => x.token === c)!.name)]);
  const fromPage = Object.entries(RACES.factions).flatMap(([faction, rows]) => Object.entries(rows).map(([race, classes]) => [faction, race, [...classes]]));
  expect(fromRollup).toEqual(fromPage);
});
