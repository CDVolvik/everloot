import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

const facts = vi.hoisted(() => ({ rates: [] as unknown[], names: [] as unknown[], npcs: [] as unknown[], unreachable: false }));
vi.mock("@/lib/rollup-compute", () => ({
  loadItemFacts: async () => facts,
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
import { CLIENT_LAYER, CLIENT_TAXONOMY, ITEMS_PER_PAGE } from "@/lib/items";

const props = (id: string, search: Record<string, string> = {}) => ({ params: Promise.resolve({ id }), searchParams: Promise.resolve(search) });
const sub = (id: string, subclass: string, search: Record<string, string> = {}) => ({ params: Promise.resolve({ id, subclass }), searchParams: Promise.resolve(search) });
const html = async (el: Promise<ReactNode> | ReactNode) => renderToStaticMarkup(await el);

test("the index lists classes and subclasses with counts and the build, classes in the plural", async () => {
  const page = await html(ItemsPage());
  expect(page).toContain('href="/database/items/weapons"');
  expect(page).toContain('href="/database/items/weapons/one-handed-swords"');
  expect(page).toContain(">Weapons<");
  expect(page).toContain(CLIENT_LAYER.build.version);
  expect(page).toContain("Blizzard");
});

test("a word in the item slot is a class page; a subclass page filters by slot and quality and pages", async () => {
  const cls = await html(ItemPage(props("armor")));
  expect(cls).toContain("<h1");
  expect(cls).toContain("Armor");
  expect(cls).toContain('href="/database/items/armor/cloth"');
  const cloth = await html(SubclassPage(sub("armor", "cloth", { slot: "chest" })));
  expect(cloth.match(/found in game files, unconfirmed/g)).toHaveLength(1);
  expect(cloth).toContain(">Chest<");
  expect(cloth).not.toContain(">Head<\/td>");
  expect(cloth).toContain("Page 1 of");
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
  const ids = CLIENT_TAXONOMY.items.filter((r) => r[1] === swords.classId && r[2] === swords.id).slice(0, ITEMS_PER_PAGE).map((r) => r[0]);
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

test("an item page shows its category path, slot and quality, with one note giving the label and build", async () => {
  const row = CLIENT_TAXONOMY.items.find((r) => r[1] === 4 && r[2] === 1 && r[4] === 4)!;
  const page = await html(ItemPage(props(String(row[0]))));
  expect(page).toContain('href="/database/items/armor"');
  expect(page).toContain('href="/database/items/armor/cloth"');
  expect(page).toContain("Epic");
  expect(page).toContain(`read from build ${CLIENT_LAYER.build.version}`);
  expect(page).not.toContain("unconfirmed, build");
});
