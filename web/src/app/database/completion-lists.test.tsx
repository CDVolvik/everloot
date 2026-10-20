import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";

const store = vi.hoisted(() => ({ loadCompletion: vi.fn() }));
vi.mock("@/lib/upload-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/upload-store")>()),
  uploadStore: { loadCompletion: store.loadCompletion },
}));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  permanentRedirect: (to: string) => { throw new Error(`REDIRECT ${to}`); },
}));
vi.mock("@/lib/rollup-compute", () => ({
  loadItemFacts: async () => ({ rates: [], names: [], npcs: [], unreachable: false }),
  loadWorldFacts: async () => ({ npcs: [], quests: [], vendors: [], unreachable: false }),
}));
vi.mock("@/lib/names", () => ({ loadNames: async () => ({ items: new Map(), npcs: new Map(), quests: new Map() }) }));
vi.mock("@/lib/objects", () => ({ loadObjectFacts: async () => ({ rates: [], measuredZeros: [], names: [], unreachable: false }) }));

import AchievementList, { generateMetadata as achievementListMetadata } from "./achievements/page";
import AchievementPage, { generateMetadata as achievementMetadata } from "./achievements/[id]/page";
import FactionList from "./factions/page";
import FactionPage from "./factions/[id]/page";
import sitemap from "../sitemap";
import { siteSearch } from "@/lib/site-search";
import { emptyCompletion, foldCompletion } from "../../../../kb/src/completion-rollup";

const at = "2026-10-19T00:00:00Z";
let seq = 0;
const row = (installId: string, fields: Record<string, unknown>) => ({ installId, eventId: `e:${++seq}`, capturedAt: at, ...fields });
/** The same row from `n` distinct installs, each its own reporter. */
const from = (n: number, fields: Record<string, unknown>) => ["one", "two", "three", "four"].slice(0, n).map((id) => row(`reporter-${id}`, fields));
const ach = (id: number, name: string, category: string, points: number, criteriaCount: number) =>
  ({ kind: "achievement_catalog", achievementId: id, name, categoryId: 2, category, points, criteriaCount, criteria: criteriaCount > 0 ? [{ text: "Secret criterion text", required: 1 }] : [] });
const rep = (id: number, name: string, header?: string) => ({ kind: "reputation_catalog", factionId: id, name, ...(header ? { header } : {}) });

const rollup = (rows: Record<string, unknown>[]) => foldCompletion(emptyCompletion(), [{ records: rows, grants: [] }]);
const serve = (rows: Record<string, unknown>[]) => store.loadCompletion.mockResolvedValue({ state: rollup(rows), dataAsOf: "2026-10-19T06:30:00.000Z" });

const html = async (el: Promise<ReactNode>) => renderToStaticMarkup(await el);
const search = (s: Record<string, string> = {}) => ({ searchParams: Promise.resolve(s) });
const page = (id: string) => ({ params: Promise.resolve({ id }) });
/** The names linked in the table body, in order. */
const linked = (out: string, kind: string) => [...(out.split("<tbody>")[1] ?? "").matchAll(new RegExp(`href="/database/${kind}/([^"]+)"`, "g"))].map((m) => m[1]);

const rows = [
  ...from(3, ach(4, "Ten Quests", "Quests", 5, 10)),
  ...from(3, ach(9, "Explore Elwynn Forest", "Exploration", 10, 4)),
  ...from(3, ach(2, "Level 10", "General", 10, 0)),
  ...from(2, ach(20, "Only Two Saw This", "General", 5, 1)),
  // Three reporters, three different versions: no version has three backers.
  ...["one", "two", "three"].map((id, i) => row(`reporter-${id}`, ach(30, "Disputed", "General", 5 + i, 1))),
  // Two agree, one differs: still short of three.
  ...from(2, ach(31, "Split Vote", "General", 5, 1)),
  row("reporter-three", ach(31, "Split Vote", "General", 15, 1)),
  ...from(3, rep(69, "Darnassus", "Alliance")),
  ...from(3, rep(76, "Orgrimmar", "Horde")),
  ...from(3, rep(529, "Argent Dawn")),
  ...from(2, rep(72, "Stormwind", "Alliance")),
  ...["one", "two", "three"].map((id, i) => row(`reporter-${id}`, rep(81, `Thunder Bluff ${i}`, "Horde"))),
];

beforeEach(() => {
  store.loadCompletion.mockReset();
  serve(rows);
});

test("the achievement list shows what three reporters agree on and hides the rest", async () => {
  const out = await html(AchievementList(search()));
  expect(linked(out, "achievements")).toEqual(["2-level-10", "4-ten-quests", "9-explore-elwynn-forest"]);
  expect(out).toContain(">Exploration<");
  for (const hidden of ["Only Two Saw This", "Disputed", "Split Vote"]) expect(out).not.toContain(hidden);
  // The criteria wording is collected but never shown.
  expect(out).not.toContain("Secret criterion text");
  for (const col of ["Name", "Category", "Points", "Criteria", "ID"]) expect(out).toContain(`>${col}`);
});

test("the faction list shows the standing header, and a faction with no header still lists", async () => {
  const out = await html(FactionList(search()));
  expect(linked(out, "factions")).toEqual(["69-darnassus", "76-orgrimmar", "529-argent-dawn"]);
  for (const hidden of ["Stormwind", "Thunder Bluff"]) expect(out).not.toContain(hidden);
  expect(out).toContain(">Alliance<");
});

test("filters, sort and the name box work from the URL; a bad value is a 404", async () => {
  expect(linked(await html(AchievementList(search({ category: "Quests" }))), "achievements")).toEqual(["4-ten-quests"]);
  expect(linked(await html(AchievementList(search({ q: "elwynn" }))), "achievements")).toEqual(["9-explore-elwynn-forest"]);
  expect(linked(await html(AchievementList(search({ q: "#2" }))), "achievements")).toEqual(["2-level-10"]);
  expect(linked(await html(AchievementList(search({ sort: "-points" }))), "achievements")).toEqual(["2-level-10", "9-explore-elwynn-forest", "4-ten-quests"]);
  expect(linked(await html(FactionList(search({ header: "Horde" }))), "factions")).toEqual(["76-orgrimmar"]);
  expect(await html(AchievementList(search({ category: "Nothing" })))).toContain("No achievements match these filters.");
  await expect(AchievementList(search({ sort: "secret" }))).rejects.toThrow("NEXT_NOT_FOUND");
  await expect(AchievementList(search({ page: "2" }))).rejects.toThrow("NEXT_NOT_FOUND");
});

test("only the plain list is indexed", async () => {
  expect((await achievementListMetadata({ searchParams: Promise.resolve({}) })).robots).toBeUndefined();
  for (const s of [{ q: "ten" }, { category: "Quests" }, { sort: "name" }]) {
    expect((await achievementListMetadata({ searchParams: Promise.resolve(s) })).robots).toMatchObject({ index: false });
  }
});

test("before three players report anything, each list says so and shows no rows", async () => {
  serve(from(2, ach(4, "Ten Quests", "Quests", 5, 10)));
  for (const el of [AchievementList(search()), FactionList(search())]) {
    const out = await html(el);
    expect(out).toContain("data-empty-state");
    expect(out).toContain("once three players report it");
    expect(out).not.toContain("Ten Quests");
  }
});

test("an unreadable rollup says unrecorded, never empty", async () => {
  store.loadCompletion.mockResolvedValue({ state: null, dataAsOf: null, unreachable: true });
  expect(await html(AchievementList(search()))).toContain("unreachable");
  expect(await html(AchievementList(search()))).not.toContain("data-empty-state");
});

test("an achievement page has its facts and is indexed; an unlisted one is a 404", async () => {
  const out = await html(AchievementPage(page("4-ten-quests")));
  expect(out).toContain("Ten Quests");
  expect(out).toContain("Quests");
  expect(out).toContain("5");
  expect(out).not.toContain("Secret criterion text");
  expect((await achievementMetadata(page("4-ten-quests"))).robots).toMatchObject({ index: true });
  expect((await achievementMetadata(page("30-disputed"))).robots).toMatchObject({ index: false });
  await expect(AchievementPage(page("30-disputed"))).rejects.toThrow("NEXT_NOT_FOUND");
  await expect(AchievementPage(page("20"))).rejects.toThrow("NEXT_NOT_FOUND");
  await expect(AchievementPage(page("abc"))).rejects.toThrow("NEXT_NOT_FOUND");
});

test("a bare id or a wrong slug redirects to the canonical address", async () => {
  await expect(AchievementPage(page("4"))).rejects.toThrow("REDIRECT /database/achievements/4-ten-quests");
  await expect(FactionPage(page("69-wrong"))).rejects.toThrow("REDIRECT /database/factions/69-darnassus");
});

test("a faction page shows its header, and one with none says not reported", async () => {
  expect(await html(FactionPage(page("69-darnassus")))).toContain("Alliance");
  expect(await html(FactionPage(page("529-argent-dawn")))).toContain("Not reported");
  await expect(FactionPage(page("72-stormwind"))).rejects.toThrow("NEXT_NOT_FOUND");
});

test("the sitemap lists both lists and only the entries that passed the gate", async () => {
  const paths = (await sitemap()).map((e) => new URL(e.url).pathname);
  expect(paths).toContain("/database/achievements");
  expect(paths).toContain("/database/factions");
  expect(paths).toContain("/database/achievements/4-ten-quests");
  expect(paths).toContain("/database/factions/69-darnassus");
  expect(paths.filter((p) => /^\/database\/(achievements|factions)\//.test(p)).sort()).toEqual(["/database/achievements/2-level-10", "/database/achievements/4-ten-quests", "/database/achievements/9-explore-elwynn-forest", "/database/factions/529-argent-dawn", "/database/factions/69-darnassus", "/database/factions/76-orgrimmar"]);
  store.loadCompletion.mockResolvedValue({ state: null, dataAsOf: null, unreachable: true });
  const down = (await sitemap()).map((e) => new URL(e.url).pathname);
  expect(down).toContain("/database/achievements");
  expect(down.filter((p) => p.startsWith("/database/achievements/"))).toEqual([]);
});

test("site search finds an agreed achievement or faction by name or id, and nothing unlisted", async () => {
  const groups = await siteSearch("elwynn");
  expect(groups.find((g) => g.type === "achievement")!.results[0]).toMatchObject({ label: "Explore Elwynn Forest", href: "/database/achievements/9-explore-elwynn-forest" });
  expect(groups.find((g) => g.type === "achievement")!.heading).toBe("Achievements");
  expect((await siteSearch("darnassus")).find((g) => g.type === "faction")!.results[0].href).toBe("/database/factions/69-darnassus");
  expect((await siteSearch("69")).find((g) => g.type === "faction")!.results[0]).toMatchObject({ href: "/database/factions/69-darnassus", exact: true });
  expect((await siteSearch("disputed")).some((g) => g.type === "achievement")).toBe(false);
  expect((await siteSearch("elwynn", { only: "item" })).some((g) => g.type === "achievement")).toBe(false);
});
