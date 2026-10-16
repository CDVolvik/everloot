import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { buildLoreRelease } from "@/test/lore-release";
import { firstSentence, isIndexable, loreSlug, parseLoreSlug, renderBody, slugify } from "./lore";

describe("slugify", () => {
  test("lowercases and joins letter and digit runs with hyphens", () => {
    expect(slugify("Zeth'Kur")).toBe("zeth-kur");
    expect(slugify("Stones, Moss, and Tears")).toBe("stones-moss-and-tears");
    expect(slugify("Dongle/Core API")).toBe("dongle-core-api");
  });
  test("strips accents and drops anything that is not ASCII", () => {
    expect(slugify("Jaina Proudmoore – Élan")).toBe("jaina-proudmoore-elan");
    expect(slugify("Зул'Гуруб")).toBe("");
    expect(slugify("!!!")).toBe("");
  });
  test("caps the slug at 80 characters", () => {
    expect(slugify("a".repeat(200)).length).toBe(80);
  });
});

describe("loreSlug and parseLoreSlug", () => {
  test("round-trips a wiki page", () => {
    const slug = loreSlug({ extId: "291323", name: "Frostwhisper" });
    expect(slug).toBe("291323-frostwhisper");
    expect(parseLoreSlug(slug)).toEqual({ extId: "291323", nameSlug: "frostwhisper" });
  });
  test("keeps the id when the name slugifies to nothing", () => {
    const slug = loreSlug({ extId: "77", name: "Зул'Гуруб" });
    expect(slug).toBe("77-");
    expect(parseLoreSlug(slug)).toEqual({ extId: "77", nameSlug: "" });
    expect(parseLoreSlug("77")).toEqual({ extId: "77", nameSlug: "" });
  });
  test("a curated kebab id is the whole slug", () => {
    expect(loreSlug({ extId: "forever-launch-date", name: "WoW Forever launch date" })).toBe("forever-launch-date");
    expect(parseLoreSlug("forever-launch-date")).toEqual({ extId: "forever-launch-date", nameSlug: "" });
  });
  test("rejects empty, leading zeros, uppercase and spaces", () => {
    expect(parseLoreSlug("")).toBeNull();
    expect(parseLoreSlug("01-thrall")).toBeNull();
    expect(parseLoreSlug("291323-Frost whisper")).toBeNull();
    expect(parseLoreSlug("291323-frost/whisper")).toBeNull();
  });
});

describe("isIndexable", () => {
  test("needs 300 characters and no redirect", () => {
    expect(isIndexable("x".repeat(299))).toBe(false);
    expect(isIndexable("x".repeat(300))).toBe(true);
    expect(isIndexable(`#REDIRECT [[Thrall]] ${"x".repeat(300)}`)).toBe(false);
    expect(isIndexable(`A road that redirected travellers. ${"x".repeat(300)}`)).toBe(true);
  });
});

describe("renderBody", () => {
  test("splits paragraphs on blank lines and groups bullet lines", () => {
    expect(renderBody("Intro.\n\n * a\n * b\n\nEnd.")).toEqual([
      { type: "p", text: "Intro." },
      { type: "ul", items: ["a", "b"] },
      { type: "p", text: "End." },
    ]);
  });
  test("a body of only bullets is one list, and CRLF endings are fine", () => {
    expect(renderBody("* one\r\n* two\r\n")).toEqual([{ type: "ul", items: ["one", "two"] }]);
  });
  test("never emits empty blocks", () => {
    expect(renderBody("\n\n  \n\nOnly.\n\n\n")).toEqual([{ type: "p", text: "Only." }]);
  });
});

describe("firstSentence", () => {
  test("stops at the first sentence end", () => {
    expect(firstSentence("One. Two.")).toBe("One.");
    expect(firstSentence("One.\nTwo.")).toBe("One.");
  });
  test("a bullet-first body reads as a list of its items, never a leading asterisk", () => {
    expect(firstSentence(" * Ras Frostwhisper - a boss lich\n * Frostwhisper Gorge - a subzone\n\nMore.")).toBe("Ras Frostwhisper - a boss lich; Frostwhisper Gorge - a subzone");
    expect(firstSentence("* only one")).toBe("only one");
  });
  test("cuts a long sentence on a word boundary with an ellipsis", () => {
    const out = firstSentence(`${"word ".repeat(100)}end`);
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/ …$/);
  });
});

describe("with a release", () => {
  let release = "";

  beforeAll(async () => { release = await buildLoreRelease(); });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function lore(path = release) {
    vi.stubEnv("KB_SNAPSHOT_PATH", path);
    return import("./lore");
  }

  test("loreByExtId returns the row with its categories, or null", async () => {
    const { loreByExtId } = await lore();
    const page = loreByExtId("1");
    expect(page).toMatchObject({ extId: "1", name: "Thrall", categories: ["Orcs", "Warchiefs"], revisionTimestamp: "2023-01-14T21:40:10Z", licence: "CC-BY-SA-4.0", retrievedAt: "2023-11-13", gameVersion: "lore", sourceId: "warcraft-wiki-2023" });
    expect(loreByExtId("forever-launch-date")).toMatchObject({ gameVersion: "forever", sourceId: "curated", categories: [], revisionTimestamp: null });
    expect(loreByExtId("999")).toBeNull();
  });

  test("searchLore pages 20 at a time and knows when a next page exists", async () => {
    const { searchLore } = await lore();
    const first = searchLore("grommash", 1);
    expect(first).not.toBe("unavailable");
    if (first === "unavailable") return;
    expect(first.hits).toHaveLength(20);
    expect(first.hasNext).toBe(true);
    expect(first.hits[0].extId).toMatch(/^1\d\d$/);
    const second = searchLore("grommash", 2);
    expect(second).toMatchObject({ hasNext: false });
    expect(second !== "unavailable" && second.hits).toHaveLength(2);
    const third = searchLore("grommash", 3);
    expect(third).toEqual({ hits: [], hasNext: false });
  });

  test("searchLore survives stopwords, FTS syntax, bad pages and long queries", async () => {
    const { searchLore } = await lore();
    expect(() => searchLore("the", 1)).not.toThrow();
    expect(() => searchLore('thrall OR * "', 1)).not.toThrow();
    expect(searchLore("grommash", 0)).toMatchObject({ hasNext: true });
    expect(searchLore("grommash", Number.NaN)).toMatchObject({ hasNext: true });
    expect(() => searchLore("grommash ".repeat(100), 1)).not.toThrow();
  });

  test("searchLore caps the page number and never reaches huge LIMITs", async () => {
    const { searchLore, MAX_PAGE } = await lore();
    expect(MAX_PAGE).toBe(50);
    expect(searchLore("grommash", 1e300)).toEqual({ hits: [], hasNext: false });
    expect(searchLore("grommash", 51)).toEqual({ hits: [], hasNext: false });
  });

  test("searchLore returns lore pages only, never curated items", async () => {
    const { searchLore } = await lore();
    const result = searchLore("grommash", 2);
    expect(result !== "unavailable" && result.hits.map((h) => h.kind)).not.toContain("item");
    expect(result !== "unavailable" && result.hits).toHaveLength(2);
  });

  test("indexable count and chunks follow the 300-character, no-redirect rule", async () => {
    const { indexableCount, indexableChunk } = await lore();
    expect(indexableCount()).toBe(28);
    const all = indexableChunk(0);
    expect(all !== "unavailable" && all.map((r) => r.extId).slice(0, 6)).toEqual(["1", "4", "5", "6", "7", "8"]);
    expect(indexableChunk(5)).toEqual([]);
    expect(indexableChunk(1, 2)).toMatchObject([{ extId: "5" }, { extId: "6" }]);
  });

  test("indexableCount runs its scan once per opened release", async () => {
    const { indexableCount } = await lore();
    const { getRelease } = await import("./release");
    const spy = vi.spyOn(getRelease()!.db, "prepare");
    expect(indexableCount()).toBe(28);
    expect(indexableCount()).toBe(28);
    expect(spy.mock.calls.filter(([sql]) => /count\(\*\)/.test(String(sql)))).toHaveLength(1);
  });

  test("releaseCreatedAt comes from the manifest", async () => {
    const { releaseCreatedAt } = await lore();
    expect(releaseCreatedAt()).toBe("2026-10-15T00:00:00.000Z");
  });

  test("every lookup reports unavailable when the release cannot be opened", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { loreByExtId, searchLore, indexableCount, indexableChunk, releaseCreatedAt } = await lore(join(tmpdir(), "missing.sqlite"));
    expect(loreByExtId("1")).toBe("unavailable");
    expect(searchLore("thrall", 1)).toBe("unavailable");
    expect(indexableCount()).toBe("unavailable");
    expect(indexableChunk(0)).toBe("unavailable");
    expect(releaseCreatedAt()).toBe("unavailable");
  });
});

describe("types, facets and browsing", () => {
  let release = "";
  beforeAll(async () => { release = await buildLoreRelease(); });
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
  async function lore(path = release) { vi.stubEnv("KB_SNAPSHOT_PATH", path); return import("./lore"); }

  test("parseLetter accepts a-z and # only", async () => {
    const { parseLetter } = await lore();
    expect(parseLetter(undefined)).toBe("a");
    expect(parseLetter("A")).toBe("a");
    expect(parseLetter("z")).toBe("z");
    expect(parseLetter("#")).toBe("#");
    expect(parseLetter("other")).toBe("#");
    for (const bad of ["é", "ab", "1", ""]) expect(parseLetter(bad)).toBeNull();
  });

  test("browse lists a type by letter, ordered by name, 50 per page", async () => {
    const { browse, BROWSE_PAGE_SIZE } = await lore();
    expect(BROWSE_PAGE_SIZE).toBe(50);
    const zones = browse("zone", "z", {}, 1);
    expect(zones).not.toBe("unavailable");
    if (zones === "unavailable") return;
    expect(zones.rows).toHaveLength(22);
    expect(zones.rows[0].name).toBe("Zone 1");
    expect(zones.rows[1].name).toBe("Zone 10");
    expect(zones.hasNext).toBe(false);
    expect(browse("zone", "r", {}, 1)).toMatchObject({ rows: [{ extId: "6", name: "Redirected Road" }] });
  });

  test("browse filters by one facet value, bound exactly", async () => {
    const { browse } = await lore();
    const legion = browse("zone", "z", { expansion: "Legion" }, 1);
    expect(legion !== "unavailable" && legion.rows).toHaveLength(11);
    expect(browse("npc", "z", { zone: "Zul'Gurub" }, 1)).toMatchObject({ rows: [{ extId: "7" }] });
    expect(browse("quest", "#", {}, 1)).toMatchObject({ rows: [{ extId: "8", name: "100% Done" }] });
    expect(browse("npc", "t", { race: "Tauren" }, 1)).toEqual({ rows: [], hasNext: false });
    expect(browse("npc", "t", { race: "Orc" }, 1)).toMatchObject({ rows: [{ extId: "1" }] });
    expect(browse("zone", "z", {}, 2)).toEqual({ rows: [], hasNext: false });
  });

  test("facetValues lists the values present for a type, memoized per release", async () => {
    const { facetValues } = await lore();
    const { getRelease } = await import("./release");
    const spy = vi.spyOn(getRelease()!.db, "prepare");
    const zone = facetValues("zone");
    expect(zone !== "unavailable" && zone.expansion).toEqual(["Battle for Azeroth", "Legion"]);
    expect(zone !== "unavailable" && zone.race).toEqual([]);
    const npc = facetValues("npc");
    expect(npc !== "unavailable" && npc.zone).toEqual(["Zul'Gurub"]);
    const before = spy.mock.calls.length;
    facetValues("zone");
    expect(spy.mock.calls.length).toBe(before);
  });

  test("facetValues and coverage read the manifest summaries without scanning", async () => {
    const { facetValues, coverage } = await lore();
    const { getRelease } = await import("./release");
    const spy = vi.spyOn(getRelease()!.db, "prepare");
    const npc = facetValues("npc");
    expect(npc !== "unavailable" && npc.race).toEqual(["Orc"]);
    expect(npc !== "unavailable" && npc.zone).toEqual(["Zul'Gurub"]);
    const c = coverage();
    expect(c !== "unavailable" && c.facets.expansion).toEqual([{ value: "Battle for Azeroth", n: 11 }, { value: "Legion", n: 11 }]);
    expect(spy.mock.calls.some(([sql]) => String(sql).includes("json_each"))).toBe(false);
  });

  test("a typed release whose manifest has no facet totals is refused", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = await buildLoreRelease({ facets: false });
    const { browse, facetValues, coverage } = await lore(broken);
    expect(browse("zone", "z", {}, 1)).toBe("unavailable");
    expect(facetValues("zone")).toBe("unavailable");
    expect(coverage()).toBe("unavailable");
  });

  test("hasTypes and typeCounts read the manifest", async () => {
    const { hasTypes, typeCounts } = await lore();
    expect(hasTypes()).toBe(true);
    expect(typeCounts()).toEqual({ npc: 3, quest: 2, zone: 23, other: 4 });
  });

  test("searchLore can be limited to one type", async () => {
    const { searchLore } = await lore();
    const zones = searchLore("grommash", 1, "zone");
    expect(zones !== "unavailable" && zones.hits.every((h) => /^1\d\d$/.test(h.extId))).toBe(true);
    expect(searchLore("thrall", 1, "quest")).toEqual({ hits: [], hasNext: false });
    const thrall = searchLore("thrall", 1, "npc");
    expect(thrall !== "unavailable" && thrall.hits.map((h) => h.extId)).toContain("1");
  });

  test("coverage summarises the release", async () => {
    const { coverage } = await lore();
    const c = coverage();
    expect(c).not.toBe("unavailable");
    if (c === "unavailable") return;
    expect(c.types?.zone).toBe(23);
    expect(c.damaged).toBe(1);
    expect(c.indexable).toBe(28);
    expect(c.createdAt).toBe("2026-10-15T00:00:00.000Z");
    expect(c.facets.expansion).toEqual([{ value: "Battle for Azeroth", n: 11 }, { value: "Legion", n: 11 }]);
    expect(c.facets.race).toEqual([{ value: "Orc", n: 1 }]);
  });

  test("loreByExtId exposes type, facets and infobox", async () => {
    const { loreByExtId } = await lore();
    expect(loreByExtId("1")).toMatchObject({ type: "npc", facets: { race: ["Orc"], class: ["Shaman"] }, infobox: { template: "npcbox", fields: { title: "Warchief" } } });
    expect(loreByExtId("2")).toMatchObject({ type: null, facets: null, infobox: null });
  });

  test("a release without type data reports no types", async () => {
    const untyped = await buildLoreRelease({ typed: false });
    const { hasTypes, typeCounts, browse, coverage } = await lore(untyped);
    expect(hasTypes()).toBe(false);
    expect(typeCounts()).toBeNull();
    expect(browse("zone", "z", {}, 1)).toEqual({ rows: [], hasNext: false });
    const c = coverage();
    expect(c !== "unavailable" && c.types).toBeNull();
    expect(c !== "unavailable" && c.facets.expansion).toEqual([]);
  });

  test("everything is unavailable without a release", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { browse, facetValues, hasTypes, typeCounts, coverage } = await lore(join(tmpdir(), "missing.sqlite"));
    expect(browse("zone", "a", {}, 1)).toBe("unavailable");
    expect(facetValues("zone")).toBe("unavailable");
    expect(hasTypes()).toBe("unavailable");
    expect(typeCounts()).toBe("unavailable");
    expect(coverage()).toBe("unavailable");
  });
});
