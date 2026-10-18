import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ assets: null as unknown, names: [] as unknown[], tipCalls: [] as number[][] }));
vi.mock("@/lib/game-assets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/game-assets")>()),
  loadSiteAssets: async () => state.assets,
  loadItemTips: async (_assets: unknown, ids: readonly number[]) => {
    state.tipCalls.push([...ids]);
    return new Map(ids.map((id) => [id, { name: `Game name ${id}`, color: "#fff", quality: "Common", icon: `https://assets.example.test/b/icons/i${id}.webp`, lines: [], partial: false, label: "found in game files, unconfirmed · build 1.60.1.70450" }]));
  },
}));
vi.mock("@/lib/rollup-compute", () => ({
  loadItemFacts: async () => ({ rates: [], names: state.names, npcs: [], unreachable: false }),
  loadObservedEdges: async () => ({ edges: [], unreachable: false, dataAsOf: null }),
}));
vi.mock("@/lib/upload-store", () => ({ STORAGE_UNREACHABLE: "Storage unavailable" }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, useRouter: () => ({ push: () => {} }) }));

import ItemPage from "./[id]/page";
import SubclassPage from "./[id]/[subclass]/page";
import { CREDIT } from "@/lib/talents/assets";
import { CLIENT_EDGES } from "@/lib/edges";
import { CLIENT_TAXONOMY } from "@/lib/items";

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

beforeEach(() => { state.assets = null; state.names = []; state.tipCalls = []; });

test("an unreported item: the creating spell's icon and the credit, but no game file tooltip", async () => {
  state.assets = assets;
  const page = await html(ItemPage(props(String(made.fromId))));
  expect(page).toContain(`${BASE}/icons/spell.webp`);
  expect(page).toContain(CREDIT);
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
