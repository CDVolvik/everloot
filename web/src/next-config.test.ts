import picomatch from "next/dist/compiled/picomatch";
import { expect, test } from "vitest";
import nextConfig from "../next.config.js";

test("the internal browse route redirects to its public address, and the rewrite serves that address", async () => {
  expect(await nextConfig.redirects!()).toEqual([{ source: "/lore/browse/:type(npcs|items|quests|zones|spells)", destination: "/lore/:type", permanent: true }]);
  expect(await nextConfig.rewrites!()).toEqual([{ source: "/lore/:type(npcs|items|quests|zones|spells)", destination: "/lore/browse/:type" }]);
});

test("the tools' HTTP route is traced with the release files, as the MCP mounts are", () => {
  const includes = nextConfig.outputFileTracingIncludes!;
  // The same matcher Next's build uses on each route key.
  const keyFor = (route: string) => Object.keys(includes).find((key) => picomatch(key, { dot: true, contains: true })(route));
  expect(keyFor("/api/tools/[tool]/route")).toBe("/api/tools");
  expect(includes[keyFor("/api/tools/[tool]/route")!]).toEqual(includes["/mcp/public"]);
  expect(keyFor("/api/items/route")).toBeUndefined();
});

test("the build cache checks the protocol package's files, and trusts every other package's version", () => {
  const config = nextConfig.webpack!({ resolve: {}, snapshot: { immutablePaths: [] } } as never, { isServer: true } as never) as { snapshot: { managedPaths: RegExp[]; immutablePaths: unknown[] } };
  const managed = (file: string) => config.snapshot.managedPaths.some((re) => re.test(file));
  expect(managed("/vercel/path0/web/node_modules/zod/index.js")).toBe(true);
  expect(managed("/vercel/path0/web/node_modules/@everloot/protocol/dist/index.js")).toBe(false);
  expect(managed("C:\\work\\web\\node_modules\\@everloot\\protocol\\dist\\index.js")).toBe(false);
  expect(config.snapshot.immutablePaths).toEqual([]);
});
