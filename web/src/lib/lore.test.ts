import { describe, expect, test } from "vitest";
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
