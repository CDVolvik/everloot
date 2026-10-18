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
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, useRouter: () => ({ push: () => {} }) }));

import ItemPage, { generateMetadata } from "./[id]/page";
import SubclassPage, { generateMetadata as subclassMetadata } from "./[id]/[subclass]/page";
import ItemsPage from "./page";
import { CLIENT_LAYER, CLIENT_TAXONOMY } from "@/lib/items";

const props = (id: string, search: Record<string, string> = {}) => ({ params: Promise.resolve({ id }), searchParams: Promise.resolve(search) });
const sub = (id: string, subclass: string, search: Record<string, string> = {}) => ({ params: Promise.resolve({ id, subclass }), searchParams: Promise.resolve(search) });
const html = async (el: Promise<ReactNode> | ReactNode) => renderToStaticMarkup(await el);

test("the index lists classes and subclasses with counts and the build", async () => {
  const page = await html(ItemsPage());
  expect(page).toContain('href="/database/items/weapon"');
  expect(page).toContain('href="/database/items/weapon/one-handed-swords"');
  expect(page).toContain(CLIENT_LAYER.build.version);
  expect(page).toContain("Blizzard");
});

test("a word in the item slot is a class page; a subclass page filters by slot and quality and pages", async () => {
  const cls = await html(ItemPage(props("armor")));
  expect(cls).toContain("<h1");
  expect(cls).toContain("Armor");
  expect(cls).toContain('href="/database/items/armor/cloth"');
  const cloth = await html(SubclassPage(sub("armor", "cloth", { slot: "chest" })));
  expect(cloth).toContain("found in game files, unconfirmed");
  expect(cloth).toContain(">Chest<");
  expect(cloth).not.toContain(">Head<\/td>");
  expect(cloth).toContain("Page 1 of");
});

test("unknown categories and filters are a 404, not an empty page", async () => {
  await expect(html(ItemPage(props("dragons")))).rejects.toThrow("NEXT_NOT_FOUND");
  await expect(html(SubclassPage(sub("armor", "lances")))).rejects.toThrow("NEXT_NOT_FOUND");
  await expect(html(SubclassPage(sub("armor", "cloth", { quality: "shiny" })))).rejects.toThrow("NEXT_NOT_FOUND");
  await expect(html(SubclassPage(sub("armor", "cloth", { page: "9999" })))).rejects.toThrow("NEXT_NOT_FOUND");
});

test("only the plain category page is indexed", async () => {
  expect((await subclassMetadata(sub("weapon", "one-handed-swords"))).robots).toMatchObject({ index: true });
  expect((await subclassMetadata(sub("weapon", "one-handed-swords", { quality: "epic" }))).robots).toMatchObject({ index: false });
  expect((await generateMetadata(props("weapon"))).robots).toMatchObject({ index: true });
});

test("an item page shows its category path, slot and quality with the label and build", async () => {
  const row = CLIENT_TAXONOMY.items.find((r) => r[1] === 4 && r[2] === 1 && r[4] === 4)!;
  const page = await html(ItemPage(props(String(row[0]))));
  expect(page).toContain('href="/database/items/armor"');
  expect(page).toContain('href="/database/items/armor/cloth"');
  expect(page).toContain("Epic");
  expect(page).toContain(`found in game files, unconfirmed, build ${CLIENT_LAYER.build.version}`);
});
