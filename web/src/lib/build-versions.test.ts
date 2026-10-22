import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { describe, expect, test } from "vitest";
import nextConfig from "../../next.config.js";
import { PREFIXES, SERVED, WITHOUT_SNAPSHOT, hasSnapshot, versionHref } from "./build-versions";
import { CURRENT_VERSION, GAME_VERSIONS } from "./game-version";

const byId = (id: string) => GAME_VERSIONS.find((v) => v.id === id)!;

/**
 * Where Next's router sends a path that is not a file: each rewrite in order, checked against the path the earlier
 * ones left, with its parameters filled in.
 */
async function served(path: string): Promise<string> {
  const rewrites = (await nextConfig.rewrites!()) as { source: string; destination: string }[];
  for (const r of rewrites) {
    const params = getPathMatch(r.source)(path) as Record<string, string | string[]> | false;
    if (params !== false) path = r.destination.replace(/:(\w+)\+?/g, (_, name: string) => [params[name]].flat().join("/"));
  }
  return path;
}

describe("game version routing", () => {
  test("the served version is the one the header names, and the only one with the snapshot", () => {
    expect(SERVED.id).toBe(CURRENT_VERSION.id);
    expect(GAME_VERSIONS.filter(hasSnapshot).map((v) => v.id)).toEqual([SERVED.id]);
  });

  test("Live has no prefix: its pages are the unprefixed ones, so the live URLs never change", () => {
    expect(PREFIXES).toEqual({ ptr: "/ptr", beta: "/beta" });
    for (const id of Object.keys(PREFIXES)) expect(GAME_VERSIONS.map((v) => v.id)).toContain(id);
    expect(versionHref(byId("live"), "/database/items/2589")).toBe("/database/items/2589");
  });

  test("the served version keeps the unprefixed URL; another version's address carries its prefix", () => {
    expect(versionHref(SERVED, "/database/items/2589")).toBe("/database/items/2589");
    expect(versionHref(SERVED)).toBe("/");
    expect(versionHref(byId("ptr"))).toBe("/ptr");
    expect(versionHref(byId("ptr"), "/database/items/2589")).toBe("/ptr/database/items/2589");
  });

  test("a version without the snapshot answers with its notice, never another version's pages", async () => {
    expect(WITHOUT_SNAPSHOT.map((v) => v.id)).toEqual(["ptr"]);
    expect(await served("/ptr")).toBe("/game-version/ptr");
    expect(await served("/ptr/database/items/2589")).toBe("/game-version/ptr");
  });

  test("the served version's prefix shows the same pages", async () => {
    expect(await served("/beta")).toBe("/");
    expect(await served("/beta/database/items/2589")).toBe("/database/items/2589");
    expect(await served("/beta/lore/npcs")).toBe("/lore/browse/npcs");
    // Unprefixed addresses are untouched, including ones that only start with a prefix's letters.
    expect(await served("/database/items/2589")).toBe("/database/items/2589");
    expect(await served("/betamax")).toBe("/betamax");
  });

  test("the notice's internal address redirects to its prefix", async () => {
    const redirect = (await nextConfig.redirects!()).find((r) => r.source.startsWith("/game-version/"))!;
    expect(redirect).toEqual({ source: "/game-version/:id(ptr|beta)", destination: "/:id", permanent: true });
    expect(getPathMatch(redirect.source)("/game-version/ptr")).toEqual({ id: "ptr" });
    expect(getPathMatch(redirect.source)("/game-version/live")).toBe(false);
  });
});
