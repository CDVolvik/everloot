import { existsSync } from "node:fs";
import { join } from "node:path";
import picomatch from "next/dist/compiled/picomatch";
import { expect, test } from "vitest";
import nextConfig from "../../next.config.js";
import { loadWiki, wikiDir, wikiTitle } from "./wiki";

test("titles end with the type word and stay under 60 characters", () => {
  expect(wikiTitle({ title: "Deadmines", type: "dungeon" })).toBe("Deadmines · WoW Forever dungeon");
  expect(wikiTitle({ title: "Molten Core", type: "raid" })).toBe("Molten Core · WoW Forever raid");
  const long = "New race and class combinations in the Forever launch";
  expect(wikiTitle({ title: long, type: "change" })).toBe(long);
  expect(wikiTitle({ title: "New race and class combinations at launch", type: "change" })).toBe("New race and class combinations at launch · WoW Forever");
  for (const t of ["Deadmines", "Ahn'Qiraj Temple", "New race and class combinations"]) expect(wikiTitle({ title: t, type: "item-set" }).length).toBeLessThanOrEqual(60);
});

test("the site reads every committed page from kb/wiki, which the /wiki functions ship with", () => {
  expect(wikiDir()).toBe(join(process.cwd(), "..", "kb", "wiki"));
  const wiki = loadWiki();
  expect(wiki.pages.has("deadmines")).toBe(true);
  expect(wiki.pages.has("westfall")).toBe(true);
  expect(wiki.categories.get("eastern-kingdoms")).toBe("Eastern Kingdoms");

  // The same matcher Next's build uses on each route key; both routes get the folder.
  const includes = nextConfig.outputFileTracingIncludes!;
  const keyFor = (route: string) => Object.keys(includes).find((key) => picomatch(key, { dot: true, contains: true })(route));
  for (const route of ["/wiki/page", "/wiki/[slug]/page"]) expect(includes[keyFor(route)!]).toEqual(["../kb/wiki/*.md", "../kb/wiki/categories.yaml"]);
  expect(existsSync(join(process.cwd(), "..", "kb", "wiki", "categories.yaml"))).toBe(true);
});
