import { expect, test } from "vitest";
import { LAUNCH } from "@/data/wow-forever";
import { MAP_DATA_EXTRACTED_AT, TALENT_DATA_EXTRACTED_AT } from "@/lib/build-stamp";
import { loadTimeline } from "@/lib/changes";
import sitemap from "./sitemap";

const entries = sitemap();
const byPath = new Map(entries.map((e) => [new URL(e.url).pathname, e]));

test("/changes is dated by its newest entry", () => {
  const newest = loadTimeline()[0];
  expect(newest).toBeDefined();
  expect(byPath.get("/changes")?.lastModified).toEqual(new Date(newest.at));
});

test("the game-data pages are dated by the build extraction", () => {
  expect(TALENT_DATA_EXTRACTED_AT.getTime()).toBeGreaterThan(0);
  expect(byPath.get("/map")?.lastModified).toEqual(MAP_DATA_EXTRACTED_AT);
  for (const path of ["/tools/talents", "/tools/talents/hunter", "/tools/talents/druid", "/tools/raid"]) {
    expect(byPath.get(path)?.lastModified, path).toEqual(TALENT_DATA_EXTRACTED_AT);
  }
});

test("/wow-forever is listed and dated by the day its source was read", () => {
  expect(byPath.get("/wow-forever")?.lastModified).toEqual(new Date(LAUNCH.checkedOn));
});

test("a page with no known modification time has none, instead of today's date", () => {
  for (const path of ["/about", "/privacy", "/terms", "/security", "/accessibility", "/connect"]) expect(byPath.get(path)?.lastModified, path).toBeUndefined();
});

test("changefreq and priority are gone", () => {
  for (const entry of entries) {
    expect(entry).not.toHaveProperty("changeFrequency");
    expect(entry).not.toHaveProperty("priority");
  }
});
