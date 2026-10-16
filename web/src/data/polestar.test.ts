import { expect, test } from "vitest";
import { PACK_IDEAS, POLESTAR_PACKS } from "./polestar";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// The pack.json rules in Polestar's docs/PACK_FORMAT.md, so a listing never shows a manifest Polestar would reject.
test.each(POLESTAR_PACKS.map((pack) => [pack.id, pack] as const))("pack %s follows the pack.json rules", (_, pack) => {
  expect(pack.id).toMatch(/^[a-z0-9][a-z0-9-]{1,31}$/);
  expect(pack.title.length).toBeGreaterThan(0);
  expect(pack.title.length).toBeLessThanOrEqual(64);
  expect(pack.author.length).toBeGreaterThan(0);
  expect(pack.author.length).toBeLessThanOrEqual(64);
  expect(pack.version).toMatch(/^[A-Za-z0-9][A-Za-z0-9.+-]{0,31}$/);
  expect(pack.license.length).toBeGreaterThan(0);
  expect(pack.license.length).toBeLessThanOrEqual(64);
  if (pack.website) expect(pack.website).toMatch(/^https?:\/\/\S{1,190}$/);
  if (pack.source) expect(pack.source.length).toBeLessThanOrEqual(200);
  expect(pack.listed).toMatch(ISO_DATE);
  expect(pack.checked).toMatch(ISO_DATE);
  expect(pack.coverage.length).toBeGreaterThan(0);
  expect(pack.downloads.length).toBeGreaterThan(0);
  for (const download of pack.downloads) expect(download.url).toMatch(/^https:\/\//);
});

test("pack ids are unique and Polestar's own pack comes first", () => {
  const ids = POLESTAR_PACKS.map((pack) => pack.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids[0]).toBe("guides");
});

test("every pack idea says why it is open and cites where that comes from", () => {
  expect(PACK_IDEAS.length).toBeGreaterThan(0);
  for (const idea of PACK_IDEAS) {
    expect(idea.why.length).toBeGreaterThan(0);
    expect(idea.source.url).toMatch(/^https:\/\//);
  }
});
