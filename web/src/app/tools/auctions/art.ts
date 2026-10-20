import { loadItemTips, loadSiteAssets, type ItemTip, type SiteAssets } from "@/lib/game-assets";
import { shownItemName } from "@/lib/items";
import { loadShownNames } from "@/lib/shown-item-names";

export type { ItemTip };

/**
 * Icons, quality and tooltips for the items an Auction House page shows. Callers pass only items with a
 * public value (3 reporters scanned them), so nothing found only in the game files is drawn. Nothing is
 * read when there are no items.
 */
export async function itemArt(ids: readonly number[]): Promise<{ assets: SiteAssets | null; tips: Map<number, ItemTip> }> {
  if (!ids.length) return { assets: null, tips: new Map() };
  const assets = await loadSiteAssets();
  return { assets, tips: await loadItemTips(assets, ids) };
}

/**
 * The names the item pages show, for items with a public value: players' agreed name, then the game files and
 * wiki match, then the tooltip's name (a public auction value is a player report, as the tooltip rule counts
 * them). Items with none are left out and read "Item N".
 */
export async function auctionNames(ids: readonly number[], tips: Map<number, ItemTip>): Promise<Map<number, string>> {
  if (!ids.length) return new Map();
  const { agreed, matched } = await loadShownNames();
  const out = new Map<number, string>();
  for (const id of new Set(ids)) {
    const shown = shownItemName(id, agreed, matched?.names, tips.get(id));
    if (shown) out.set(id, shown.name);
  }
  return out;
}
