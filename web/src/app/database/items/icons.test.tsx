import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ assets: null as unknown, names: [] as unknown[], tipCalls: [] as number[][], matched: null as unknown }));
vi.mock("@/lib/game-assets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/game-assets")>()),
  loadSiteAssets: async () => state.assets,
  loadItemNames: async () => state.matched,
  loadItemTips: async (_assets: unknown, ids: readonly number[]) => {
    state.tipCalls.push([...ids]);
    return new Map(ids.map((id) => [id, { name: `Game name ${id}`, color: "#fff", quality: "Common", icon: `https://assets.example.test/b/icons/i${id}.webp`, lines: [], partial: false, label: "found in game files, unconfirmed · build 1.60.1.70450" }]));
  },
}));
vi.mock("@/lib/rollup-compute", () => ({
  loadItemFacts: async () => ({ rates: [], names: state.names, npcs: [], unreachable: false }),
  loadWorldFacts: async () => ({ npcs: [], quests: [], vendors: [], unreachable: false }),
  loadObservedEdges: async () => ({ edges: [], unreachable: false, dataAsOf: null }),
}));
vi.mock("@/lib/upload-store", () => ({ STORAGE_UNREACHABLE: "Storage unavailable" }));
vi.mock("next/link", () => ({ default: ({ href, children, style }: { href: string; children: ReactNode; style?: object }) => <a href={href} style={style}>{children}</a> }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, useRouter: () => ({ push: () => {} }) }));

import ItemPage, { generateMetadata } from "./[id]/page";
import SubclassPage, { generateMetadata as subclassMetadata } from "./[id]/[subclass]/page";
import { CREDIT } from "@/lib/talents/assets";
import { CLIENT_EDGES } from "@/lib/edges";
import { CLIENT_TAXONOMY, ITEMS_PER_PAGE, NAME_SOURCE } from "@/lib/items";
import sitemap from "@/app/sitemap";

const BASE = "https://assets.example.test/b";
const made = CLIENT_EDGES.find((e) => e.rel === "created_by")!;
const assets = {
  base: BASE, version: "1.60.1.70450", label: "found in game files, unconfirmed",
  classes: new Map(), professions: new Map(), maps: [], familyIcons: new Map(),
  spellIcons: new Map([[made.toId, `${BASE}/icons/spell.webp`]]),
};
const html = async (el: Promise<ReactNode>) => renderToStaticMarkup(await el);
const props = (id: string) => ({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });
const agreed = (itemId: number) => ["a", "b", "c"].map((installId) => ({ installId, itemId, name: `Agreed ${itemId}` }));

beforeEach(() => { state.assets = null; state.names = []; state.tipCalls = []; state.matched = null; });

test("an unreported item: the creating spell's icon, but no game file tooltip; the credit is the site footer's", async () => {
  state.assets = assets;
  const page = await html(ItemPage(props(String(made.fromId))));
  expect(page).toContain(`${BASE}/icons/spell.webp`);
  expect(page).not.toContain(CREDIT);
  expect(page).not.toContain(`i${made.fromId}.webp`);
  expect(state.tipCalls).toEqual([]);
});

test("without the manifest there is no icon and no credit", async () => {
  const page = await html(ItemPage(props(String(made.fromId))));
  expect(page).not.toContain("<img");
  expect(page).not.toContain(CREDIT);
});

test("a category list asks for game file names and icons only for items players reported", async () => {
  state.assets = assets;
  const cloth = CLIENT_TAXONOMY.items.filter((r) => r[1] === 4 && r[2] === 1).slice(0, 3).map((r) => r[0]);
  state.names = agreed(cloth[1]);
  const page = await html(SubclassPage({ params: Promise.resolve({ id: "armor", subclass: "cloth" }), searchParams: Promise.resolve({}) }));
  expect(state.tipCalls).toEqual([[cloth[1]]]);
  expect(page).toContain(`i${cloth[1]}.webp`);
  expect(page).not.toContain(`i${cloth[0]}.webp`);
  // The players' agreed name wins over the game file name.
  expect(page).toContain(`Agreed ${cloth[1]}`);
  expect(page).toContain(CREDIT);
});

/** Names the game files and the Warcraft Wiki agree on, as loadItemNames gives them, for the given ids. */
const matchedNames = (ids: number[]) => ({
  version: "1.60.1.70450",
  wiki: { name: "Warcraft Wiki (Internet Archive dump, 2023-11-13)", url: "https://warcraft.wiki.gg" },
  names: new Map(ids.map((id) => [id, { name: `Wiki name ${id}`, color: "#a335ee", wikiPage: `https://warcraft.wiki.gg/wiki/Wiki_${id}` }])),
});
const clothIds = () => CLIENT_TAXONOMY.items.filter((r) => r[1] === 4 && r[2] === 1).slice(0, ITEMS_PER_PAGE).map((r) => r[0]);
const cloth = () => SubclassPage({ params: Promise.resolve({ id: "armor", subclass: "cloth" }), searchParams: Promise.resolve({}) });

test("a category row shows a name the game files and the wiki agree on, in its quality colour, with its source and wiki link", async () => {
  state.assets = assets;
  const ids = clothIds();
  state.matched = matchedNames([ids[0]]);
  state.names = agreed(ids[1]);
  const page = await html(cloth());
  expect(page).toContain(`Wiki name ${ids[0]}`);
  expect(page).toContain("color:#a335ee");
  expect(page).toContain(`href="https://warcraft.wiki.gg/wiki/Wiki_${ids[0]}"`);
  expect(page).toContain(NAME_SOURCE.wiki);
  // Players' names keep first place and say so; every other row stays "Item N" with no label.
  expect(page).toContain(`Agreed ${ids[1]}`);
  expect(page).toContain(NAME_SOURCE.players);
  expect(page).toContain(`>Item ${ids[2]}<`);
  // Icons are asked for the reported item and the matched one only.
  expect(state.tipCalls).toEqual([[ids[1], ids[0]]]);
  // The wiki is credited under its licence.
  expect(page).toContain("Warcraft Wiki contributors");
  expect(page).toContain("https://creativecommons.org/licenses/by-sa/4.0/");
});

test("without the names file a category shows Item N and no wiki credit", async () => {
  const page = await html(cloth());
  expect(page).not.toContain(NAME_SOURCE.wiki);
  expect(page).not.toContain("Warcraft Wiki contributors");
});

test("wiki-matched names count toward the half a category needs to be indexed and listed in the sitemap", async () => {
  const ids = clothIds();
  const half = Math.ceil(ids.length / 2);
  state.matched = matchedNames(ids.slice(0, half - 1));
  expect((await subclassMetadata({ params: Promise.resolve({ id: "armor", subclass: "cloth" }), searchParams: Promise.resolve({}) })).robots).toMatchObject({ index: false });
  expect((await sitemap()).map((e) => new URL(e.url).pathname)).not.toContain("/database/items/armor/cloth");
  // One player-agreed name makes up the half with the matched ones.
  state.names = agreed(ids[half - 1]);
  expect((await subclassMetadata({ params: Promise.resolve({ id: "armor", subclass: "cloth" }), searchParams: Promise.resolve({}) })).robots).toMatchObject({ index: true });
  expect((await sitemap()).map((e) => new URL(e.url).pathname)).toContain("/database/items/armor/cloth");
});

test("an item page with a matched name shows it with its icon, marked unconfirmed, and is indexed; no tooltip text; credits are the footer's", async () => {
  state.assets = assets;
  const id = clothIds()[0];
  state.matched = matchedNames([id]);
  const page = await html(ItemPage(props(String(id))));
  expect(page).toContain(`Wiki name ${id}</h1>`);
  expect(page).toMatch(new RegExp(`data-unconfirmed[^>]*>(?:<[^>]+>)*?<img[^>]*i${id}\\.webp`));
  // No source line on the page: the Warcraft Wiki and Blizzard credits are in the site footer and /methodology#credits.
  expect(page).not.toContain(NAME_SOURCE.wiki);
  expect(page).not.toContain(CREDIT);
  expect(page).not.toContain("Game name");
  const meta = await generateMetadata(props(String(id)));
  expect(meta.title).toContain(`Wiki name ${id}`);
  expect(meta.description).toContain("Warcraft Wiki");
  expect(meta.robots).toMatchObject({ index: true });
  // An item with no name from any source stays "Item N" and out of search.
  const other = clothIds()[1];
  expect(await html(ItemPage(props(String(other))))).toContain(`Item ${other}</h1>`);
  expect((await generateMetadata(props(String(other)))).robots).toMatchObject({ index: false });
});
