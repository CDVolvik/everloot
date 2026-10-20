import { agreedItemNames } from "../../../kb/src/item-page";
import { loadItemNames, type ItemNames } from "@/lib/game-assets";
import { CLIENT_LAYER } from "@/lib/items";
import { loadItemFacts } from "@/lib/rollup-compute";

// The item names the item pages may show, read once per request for the category list, its metadata and the
// sitemap. Server only, and pages only: the API, MCP server and bulk download never import this
// (talents/assets.test.ts checks that).

export interface ShownNames {
  facts: Awaited<ReturnType<typeof loadItemFacts>>;
  /** Names 3 installs agree on; empty when upload storage cannot be reached. */
  agreed: Map<number, string>;
  /** Names the game files and the Warcraft Wiki agree on, for this build; null without the private file. */
  matched: ItemNames | null;
  /** Whether an item has a name from either: the share a category needs before it is indexed. */
  named: { has(id: number): boolean };
}

export async function loadShownNames(): Promise<ShownNames> {
  const [facts, matched] = await Promise.all([loadItemFacts(), loadItemNames(CLIENT_LAYER.build.version)]);
  const agreed = facts.unreachable ? new Map<number, string>() : agreedItemNames(facts);
  return { facts, agreed, matched, named: { has: (id) => agreed.has(id) || Boolean(matched?.names.has(id)) } };
}
