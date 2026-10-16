import { expect, test } from "vitest";
import nextConfig from "../next.config.js";

test("the internal browse route redirects to its public address, and the rewrite serves that address", async () => {
  expect(await nextConfig.redirects!()).toEqual([{ source: "/lore/browse/:type", destination: "/lore/:type", permanent: true }]);
  expect(await nextConfig.rewrites!()).toEqual([{ source: "/lore/:type(npcs|items|quests|zones|spells)", destination: "/lore/browse/:type" }]);
});
