import { expect, test, vi } from "vitest";

// Players agree on no name yet; the pages show the game files and Warcraft Wiki matches.
const mocks = vi.hoisted(() => ({
  agreed: { items: new Map<number, string>(), npcs: new Map([[448, "Hogger"]]), quests: new Map<number, string>() },
  matched: new Map([[19019, { name: "Thunderfury, Blessed Blade of the Windseeker", color: "#ff8000", wikiPage: "x" }], [647, { name: "Destiny", color: "#a335ee", wikiPage: "y" }]]),
  quests: new Map([[176, { name: "Wanted: Hogger", wikiPage: "z" }]]),
}));
vi.mock("@/lib/names", () => ({ loadNames: async () => mocks.agreed }));
vi.mock("@/lib/shown-item-names", () => ({ loadShownNames: async () => ({ matched: { names: mocks.matched } }) }));
vi.mock("@/lib/game-assets", () => ({ loadQuestNames: async () => ({ names: mocks.quests }) }));
vi.mock("@/lib/objects", () => ({ loadObjectFacts: async () => ({ rates: [], measuredZeros: [], names: [], unreachable: false }) }));

import { GET } from "./route";
import { GET as apiGET } from "../../api/suggest/route";

const get = async (query: string) => (await (await GET(new Request(`https://everloot.app/search/suggest${query}`))).json()).results as { href: string; label: string }[];

test("the type-ahead finds items and quests by the names their pages show", async () => {
  expect((await get("?q=thunderfury")).map((r) => r.href)).toEqual(["/database/items/19019"]);
  expect((await get("?q=hogger")).map((r) => r.href)).toEqual(["/database/npcs/448", "/database/quests/176"]);
  expect((await get("?q=wanted&in=quest"))[0]).toMatchObject({ label: "Wanted: Hogger", href: "/database/quests/176" });
  // An id is still named the way its page names it.
  expect((await get("?q=19019"))[0]).toMatchObject({ label: "Thunderfury, Blessed Blade of the Windseeker" });
});

test("it is the site's route: never indexed, and /api/suggest keeps to the names players agree on", async () => {
  const res = await GET(new Request("https://everloot.app/search/suggest?q=thunderfury"));
  expect(res.headers.get("x-robots-tag")).toBe("noindex");
  const api = await (await apiGET(new Request("https://everloot.app/api/suggest?q=thunderfury"))).json();
  expect(api.results).toEqual([]);
});

test("a wrong scope or an overlong query is a 400 that is not cached", async () => {
  for (const q of ["?q=a&in=zone", `?q=${"x".repeat(300)}`]) {
    const res = await GET(new Request(`https://everloot.app/search/suggest${q}`));
    expect(res.status, q).toBe(400);
    expect(res.headers.get("cache-control")).toBe("no-store");
  }
});
