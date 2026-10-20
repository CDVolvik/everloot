import { expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ names: { items: new Map([[2, "Thrall's Blade"]]), npcs: new Map([[77, "Thrall"]]), quests: new Map<number, string>() } }));
vi.mock("@/lib/names", () => ({ loadNames: async () => mocks.names }));
vi.mock("@/lib/objects", () => ({ loadObjectFacts: async () => ({ rates: [], measuredZeros: [], names: [], unreachable: false }) }));

import { GET } from "./route";

const get = (query: string) => GET(new Request(`https://everloot.app/api/suggest${query}`));

test("answers up to 8 pages for what is typed, cached at the edge for a minute", async () => {
  const res = await get("?q=thrall");
  expect(res.headers.get("cache-control")).toContain("s-maxage=60");
  const body = await res.json();
  expect(body.results.map((r: { href: string }) => r.href)).toEqual(["/database/npcs/77", "/database/items/2"]);
  expect((await (await get("?q=thrall&in=item")).json()).results).toHaveLength(1);
  expect((await (await get("?q=")).json()).results).toEqual([]);
});

test("a wrong scope or an overlong query is a 400 that is not cached", async () => {
  for (const q of ["?q=a&in=zone", `?q=${"x".repeat(300)}`]) {
    const res = await get(q);
    expect(res.status, q).toBe(400);
    expect(res.headers.get("cache-control")).toBe("no-store");
  }
});
