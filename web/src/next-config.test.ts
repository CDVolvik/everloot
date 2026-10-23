import picomatch from "next/dist/compiled/picomatch";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { matchHas } from "next/dist/shared/lib/router/utils/prepare-destination";
import { expect, test } from "vitest";
import nextConfig from "../next.config.js";

test("the internal browse route redirects to its public address, and the rewrite serves that address", async () => {
  expect(await nextConfig.redirects!()).toContainEqual({ source: "/lore/browse/:type(npcs|items|quests|zones|spells)", destination: "/lore/:type", permanent: true });
  expect(await nextConfig.rewrites!()).toContainEqual({ source: "/lore/:type(npcs|items|quests|zones|spells)", destination: "/lore/browse/:type" });
});

test("the old gold-per-hour page answers 301 with the addon page's section about it", async () => {
  const redirects = await nextConfig.redirects!();
  expect(redirects).toContainEqual({ source: "/tools/gold-per-hour", destination: "/addon#gold-per-hour", statusCode: 301 });
  expect(redirects).toContainEqual({ source: "/connect", destination: "/docs", permanent: true });
  expect(redirects).toContainEqual({ source: "/lore/forever-launch-date", destination: "/wow-forever", permanent: true });
  expect(redirects).toHaveLength(6);
});

test("www.everloot.app answers 301 with the same path on the apex, and only that host does", async () => {
  const redirects = await nextConfig.redirects!();
  const www = redirects[0]!;
  expect(www).toEqual({ source: "/:path*", has: [{ type: "host", value: "www.everloot.app" }], destination: "https://everloot.app/:path*", statusCode: 301 });
  // The same matchers Next's router runs on each redirect (it passes the query string on by itself).
  const match = getPathMatch(www.source);
  const to = (path: string) => {
    const params = match(path) as { path?: string[] } | false;
    return params === false ? null : www.destination.replace("/:path*", `/${(params.path ?? []).join("/")}`);
  };
  expect(to("/")).toBe("https://everloot.app/");
  expect(to("/database/items/2589")).toBe("https://everloot.app/database/items/2589");
  const host = (h: string) => matchHas({ headers: { host: h }, cookies: {} } as never, {}, www.has);
  expect(host("www.everloot.app")).toBeTruthy();
  for (const other of ["everloot.app", "everloot-git-branch.vercel.app", "localhost:3000"]) expect(host(other), other).toBe(false);
});

test("the tools' HTTP route is traced with the release files, as the MCP mounts are", () => {
  const includes = nextConfig.outputFileTracingIncludes!;
  // The same matcher Next's build uses on each route key.
  const keyFor = (route: string) => Object.keys(includes).find((key) => picomatch(key, { dot: true, contains: true })(route));
  expect(keyFor("/api/tools/[tool]/route")).toBe("/api/tools");
  expect(includes[keyFor("/api/tools/[tool]/route")!]).toEqual(includes["/mcp/public"]);
  expect(keyFor("/api/items/route")).toBeUndefined();
});

test("every route that reads the wiki pages carries them in its bundle", () => {
  const includes = nextConfig.outputFileTracingIncludes!;
  const keyFor = (route: string) => Object.keys(includes).find((key) => picomatch(key, { dot: true, contains: true })(route));
  // The wiki pages are read from kb/wiki at request time, so a route that lists or shows them needs the
  // folder in its own bundle. Without it the route answers 500 in production while the tests pass.
  for (const route of ["/wiki/route", "/wiki/[slug]/route", "/sitemap.xml/route"]) {
    const key = keyFor(route);
    expect(key, route).toBeDefined();
    expect(includes[key!], route).toContain("../kb/wiki/*.md");
    expect(includes[key!], route).toContain("../kb/wiki/categories.yaml");
  }
});

test("the build cache checks the protocol package's files, and trusts every other package's version", () => {
  const config = nextConfig.webpack!({ resolve: {}, snapshot: { immutablePaths: [] } } as never, { isServer: true } as never) as { snapshot: { managedPaths: RegExp[]; immutablePaths: unknown[] } };
  const managed = (file: string) => config.snapshot.managedPaths.some((re) => re.test(file));
  expect(managed("/vercel/path0/web/node_modules/zod/index.js")).toBe(true);
  expect(managed("/vercel/path0/web/node_modules/@everloot/protocol/dist/index.js")).toBe(false);
  expect(managed("C:\\work\\web\\node_modules\\@everloot\\protocol\\dist\\index.js")).toBe(false);
  expect(config.snapshot.immutablePaths).toEqual([]);
});
