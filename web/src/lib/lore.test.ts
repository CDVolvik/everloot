import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { openDb } from "../../../kb/src/db";
import { replaceSourceRows } from "../../../kb/src/entities";
import { snapshot } from "../../../kb/src/snapshot";
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
  test("cuts a long sentence on a word boundary with an ellipsis", () => {
    const out = firstSentence(`${"word ".repeat(100)}end`);
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/ …$/);
  });
});

describe("with a release", () => {
  let release = "";

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "everloot-lore-"));
    const source = openDb(join(dir, "source.sqlite"));
    const wiki = (extId: string, name: string, body: string, data?: Record<string, unknown>) => ({
      kind: "lore_page" as const, extId, name, body, data, gameVersion: "lore" as const,
      sourceUrl: `https://warcraft.wiki.gg/wiki/${name.replace(/ /g, "_")}`, retrievedAt: "2023-11-13",
    });
    const rows = [
      wiki("1", "Thrall", `Thrall is the former Warchief of the Horde. ${"He led his people. ".repeat(20)}`, { categories: ["Orcs", "Warchiefs"], revisionTimestamp: "2023-01-14T21:40:10Z" }),
      wiki("2", "Stub", "Short."),
      wiki("3", "Old Name", "#REDIRECT [[Thrall]]"),
      wiki("4", "Return to Sender", `An animated letter. ${"It flies. ".repeat(40)}`),
      wiki("5", "Return to Sender", `An achievement. ${"Defeat him. ".repeat(40)}`),
      ...Array.from({ length: 22 }, (_, i) => wiki(String(100 + i), `Zone ${i + 1}`, `Zone ${i + 1} is where grommash fought. ${"Battles raged here. ".repeat(20)}`)),
    ];
    await replaceSourceRows(source, "warcraft-wiki-2023", ["lore_page"], rows);
    await replaceSourceRows(source, "curated", ["lore_page"], [{
      kind: "lore_page", extId: "forever-launch-date", name: "WoW Forever launch date",
      body: "World of Warcraft Forever launches globally on November 4, 2026.", gameVersion: "forever",
      sourceUrl: "https://news.blizzard.com/example", retrievedAt: "2026-09-24",
    }]);
    release = join(dir, "release", "release.sqlite");
    snapshot(source, release, new Date("2026-10-15T00:00:00Z"));
    source.close();
  });

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

  test("indexable count and chunks follow the 300-character, no-redirect rule", async () => {
    const { indexableCount, indexableChunk } = await lore();
    expect(indexableCount()).toBe(25);
    const all = indexableChunk(0);
    expect(all !== "unavailable" && all.map((r) => r.extId).slice(0, 3)).toEqual(["1", "4", "5"]);
    expect(indexableChunk(5)).toEqual([]);
    expect(indexableChunk(1, 2)).toMatchObject([{ extId: "5" }, { extId: "100" }]);
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
