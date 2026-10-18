import { afterEach, beforeEach, expect, test, vi } from "vitest";

const store = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/intake-quota", () => ({ intakeQuota: { api: store.api } }));

import { GET } from "./route";
import { GET as categoriesGET } from "./categories/route";
import { CLIENT_LAYER, CLIENT_TAXONOMY } from "@/lib/items";

const req = (query = "") => new Request(`https://everloot.app/api/items${query}`);

beforeEach(() => store.api.mockReset().mockResolvedValue({ allowed: true, retryAfter: 0 }));
afterEach(() => vi.unstubAllEnvs());

test("items in a category, with words for each id, the build and the game-data notice", async () => {
  const body = await (await GET(req("?class=weapon&subclass=one-handed-swords&quality=epic"))).json();
  expect(body.total).toBeGreaterThan(0);
  const first = body.items[0];
  expect(first).toMatchObject({ class: { slug: "weapon" }, subclass: { slug: "one-handed-swords" }, quality: { slug: "epic" } });
  expect(typeof first.itemId).toBe("number");
  expect(body.gameData).toMatchObject({ label: "Found in game files, unconfirmed", build: CLIENT_LAYER.build.version });
  expect(body.gameData.credit).toContain("Blizzard");
  // Game-file data: no CC BY-SA attribution or headers.
  expect(body.attribution).toBeUndefined();
});

test("one item by id", async () => {
  const id = CLIENT_TAXONOMY.items[0][0];
  const body = await (await GET(req(`?item=${id}`))).json();
  expect(body.items).toHaveLength(1);
  expect(body.items[0].itemId).toBe(id);
});

test("unknown slugs and bad numbers are a 400", async () => {
  for (const q of ["?class=dragons", "?class=weapon&subclass=lances", "?slot=tail", "?quality=shiny", "?item=0", "?subclass=cloth"]) {
    expect((await GET(req(q))).status, q).toBe(400);
  }
});

test("with the guard on, anonymous pages are capped like the other bulk endpoints", async () => {
  vi.stubEnv("EVERLOOT_DATA_GUARD", "1");
  const body = await (await GET(req())).json();
  expect(body.total).toBe(CLIENT_TAXONOMY.items.length);
  expect(body.items).toHaveLength(500);
  expect(body.next).toContain("offset=500");
});

test("the category tree carries slugs, counts and the build", async () => {
  const body = await (await categoriesGET()).json();
  expect(body.classes.find((c: { slug: string }) => c.slug === "armor").subclasses.map((s: { slug: string }) => s.slug)).toContain("cloth");
  expect(body.slots.map((s: { slug: string }) => s.slug)).toContain("chest");
  expect(body.qualities[4]).toEqual({ id: 4, name: "Epic", slug: "epic" });
  expect(body.gameData.build).toBe(CLIENT_LAYER.build.version);
});
