import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

const facts = vi.hoisted(() => ({ rates: [] as unknown[], names: [] as unknown[], npcs: [] as unknown[], unreachable: false }));
vi.mock("@/lib/rollup-compute", () => ({
  loadItemFacts: async () => facts,
  loadWorldFacts: async () => ({ npcs: [], quests: [], vendors: [], unreachable: false }),
  loadObservedEdges: async () => ({ edges: [], unreachable: false, dataAsOf: null }),
}));
vi.mock("@/lib/upload-store", () => ({ STORAGE_UNREACHABLE: "Storage unavailable" }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  permanentRedirect: (href: string) => { throw new Error(`NEXT_REDIRECT ${href}`); },
  useRouter: () => ({ push: () => {} }),
}));

import ItemPage, { generateMetadata } from "./[id]/page";
import SubclassPage, { generateMetadata as subclassMetadata } from "./[id]/[subclass]/page";
import ItemsPage from "./page";
import { CLIENT_LAYER, CLIENT_TAXONOMY, ITEMS_PER_PAGE, NAMED_SAMPLE } from "@/lib/items";

const props = (id: string, search: Record<string, string> = {}) => ({ params: Promise.resolve({ id }), searchParams: Promise.resolve(search) });
const sub = (id: string, subclass: string, search: Record<string, string> = {}) => ({ params: Promise.resolve({ id, subclass }), searchParams: Promise.resolve(search) });
const html = async (el: Promise<ReactNode> | ReactNode) => renderToStaticMarkup(await el);

const items = (search: Record<string, string> = {}) => ItemsPage({ searchParams: Promise.resolve(search) });

test("/database/items lists every item, 50 a page, with the classes (plural) in its filter bar", async () => {
  const page = await html(items());
  expect(page).toContain('href="/database/items/weapons"');
  expect(page).toContain(">Weapons<");
  expect(page.match(/<tr /g)).toHaveLength(ITEMS_PER_PAGE);
  expect(page).toContain(`>${CLIENT_TAXONOMY.items.length.toLocaleString("en-US")}</span> items`);
  // No provenance line and no visible breadcrumb on a data page; the BreadcrumbList stays for search engines.
  expect(page).not.toContain("data-source-line");
  expect(page).not.toContain('aria-label="Breadcrumb"');
  expect(page).toContain('"@type":"BreadcrumbList"');
});

test("a word in the item slot is a class page; a subclass page filters by slot and quality and pages", async () => {
  const cls = await html(ItemPage(props("armor")));
  expect(cls).toContain("<h1");
  expect(cls).toContain("Armor");
  expect(cls).toContain('href="/database/items/armor/cloth"');
  const cloth = await html(SubclassPage(sub("armor", "cloth", { slot: "chest" })));
  expect(cloth).not.toContain("data-source-line");
  expect(cloth).toContain(">Chest<");
  expect(cloth).not.toContain(">Head<\/td>");
  const chest = CLIENT_TAXONOMY.items.filter((r) => r[1] === 4 && r[2] === 1 && [5, 20].includes(r[3])).length;
  expect(cloth).toContain(`>${chest.toLocaleString("en-US")}</span> items`);
  if (chest > ITEMS_PER_PAGE) expect(cloth).toContain('href="/database/items/armor/cloth?slot=chest&amp;page=2"');
});

test("filters, sort and page live in the URL in one order; several values join with commas; unknown ones are a 404", async () => {
  const many = await html(SubclassPage(sub("armor", "cloth", { quality: "epic,rare", sort: "-id" })));
  // The quality menu offers turning each value off and others on, keeping the sort.
  expect(many).toContain('href="/database/items/armor/cloth?quality=rare&amp;sort=-id"');
  expect(many).toContain('href="/database/items/armor/cloth?quality=uncommon,rare,epic&amp;sort=-id"');
  // The sorted column says so, and its header turns the order around.
  expect(many).toMatch(/aria-sort="descending"[^>]*>[\s\S]*?href="\/database\/items\/armor\/cloth\?quality=rare,epic"/);
  await expect(html(SubclassPage(sub("armor", "cloth", { sort: "price" })))).rejects.toThrow("NEXT_NOT_FOUND");
  await expect(html(SubclassPage(sub("armor", "cloth", { crafted: "yes" })))).rejects.toThrow("NEXT_NOT_FOUND");
  await expect(html(items({ skill: "basket-weaving" }))).rejects.toThrow("NEXT_NOT_FOUND");
});

test("game-file filters: crafted, reagent, set piece and profession narrow the rows; zero rows say so with removable chips", async () => {
  const crafted = await html(items({ crafted: "1", skill: "tailoring" }));
  expect(crafted).toContain("Tailoring");
  expect(crafted).toMatch(/<tr /);
  const none = await html(SubclassPage(sub("armor", "cloth", { set: "1", quality: "poor" })));
  expect(none).toContain("No items match these filters.");
  expect(none).toContain('href="/database/items/armor/cloth?quality=poor"');
  expect(none).toContain('href="/database/items/armor/cloth"');
});

test("filtered, sorted and searched views are noindex with the plain category as canonical", async () => {
  for (const search of [{ quality: "epic" }, { sort: "name" }, { q: "robe" }, { page: "2" }] as Record<string, string>[]) {
    const m = await subclassMetadata(sub("armor", "cloth", search));
    expect(m.robots).toMatchObject({ index: false, follow: true });
    expect(m.alternates?.canonical).toBe("/database/items/armor/cloth");
  }
  const { generateMetadata: allMetadata } = await import("./page");
  expect((await allMetadata({ searchParams: Promise.resolve({}) })).robots).toBeUndefined();
  expect((await allMetadata({ searchParams: Promise.resolve({ seen: "1" }) })).robots).toMatchObject({ index: false });
});

test("the first, singular class URLs move to the plural ones for good, filters kept", async () => {
  await expect(html(ItemPage(props("weapon")))).rejects.toThrow("NEXT_REDIRECT /database/items/weapons");
  await expect(html(SubclassPage(sub("weapon", "one-handed-swords", { quality: "epic" })))).rejects.toThrow("NEXT_REDIRECT /database/items/weapons/one-handed-swords?quality=epic");
  expect((await generateMetadata(props("weapon"))).robots).toMatchObject({ index: false });
  // A class whose plural is its own name (Armor) has no old URL to move.
  await expect(html(ItemPage(props("armors")))).rejects.toThrow("NEXT_NOT_FOUND");
});

test("unknown categories and filters are a 404, not an empty page", async () => {
  await expect(html(ItemPage(props("dragons")))).rejects.toThrow("NEXT_NOT_FOUND");
  await expect(html(SubclassPage(sub("armor", "lances")))).rejects.toThrow("NEXT_NOT_FOUND");
  await expect(html(SubclassPage(sub("armor", "cloth", { quality: "shiny" })))).rejects.toThrow("NEXT_NOT_FOUND");
  await expect(html(SubclassPage(sub("armor", "cloth", { page: "9999" })))).rejects.toThrow("NEXT_NOT_FOUND");
});

test("only the plain category page is indexed, and only once half its rows have an agreed name", async () => {
  // No names yet: every category page is a list of "Item N", so none is indexed.
  expect((await subclassMetadata(sub("weapons", "one-handed-swords"))).robots).toMatchObject({ index: false, follow: true });
  expect((await generateMetadata(props("weapons"))).robots).toMatchObject({ index: false, follow: true });
  const swords = CLIENT_TAXONOMY.subclasses.find((s) => s.slug === "one-handed-swords")!;
  const ids = CLIENT_TAXONOMY.items.filter((r) => r[1] === swords.classId && r[2] === swords.id).slice(0, NAMED_SAMPLE).map((r) => r[0]);
  const name = (n: number) => ids.slice(0, n).flatMap((itemId) => ["a", "b", "c"].map((installId) => ({ installId, itemId, name: `Sword ${itemId}` })));
  try {
    facts.names = name(Math.ceil(ids.length / 2) - 1);
    expect((await subclassMetadata(sub("weapons", "one-handed-swords"))).robots).toMatchObject({ index: false });
    facts.names = name(Math.ceil(ids.length / 2));
    expect((await subclassMetadata(sub("weapons", "one-handed-swords"))).robots).toMatchObject({ index: true });
    // Filtered and later pages repeat the plain one and stay out either way.
    expect((await subclassMetadata(sub("weapons", "one-handed-swords", { quality: "epic" }))).robots).toMatchObject({ index: false });
    // Two installs are not an agreed name.
    facts.names = facts.names.filter((row) => (row as { installId: string }).installId !== "c");
    expect((await subclassMetadata(sub("weapons", "one-handed-swords"))).robots).toMatchObject({ index: false });
  } finally {
    facts.names = [];
  }
});

test("an item page shows its category path, slot and quality; unconfirmed is a quiet marker, with no source line or build", async () => {
  const row = CLIENT_TAXONOMY.items.find((r) => r[1] === 4 && r[2] === 1 && r[4] === 4)!;
  const page = await html(ItemPage(props(String(row[0]))));
  expect(page).toContain('href="/database/items/armor"');
  expect(page).toContain('href="/database/items/armor/cloth"');
  expect(page).toContain("Epic");
  expect(page).not.toContain("data-source-line");
  expect(page).not.toMatch(/game files, unconfirmed/i);
  expect(page).not.toContain(CLIENT_LAYER.build.version);
  expect(page).toMatch(/data-unconfirmed[^>]*title="From the game files, not yet confirmed by players"/);
  // No breadcrumb on screen; the trail stays as JSON-LD.
  expect(page).not.toContain('aria-label="Breadcrumb"');
  expect(page).toContain('"@type":"BreadcrumbList"');
  expect(page).toContain('"item":"https://everloot.app/database/items/armor/cloth"');
  // Every empty relation tab is the shared one-line empty state, never a bare zero.
  expect(page).toContain("data-empty-state");
});
