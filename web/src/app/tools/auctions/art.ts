import { loadItemTips, loadSiteAssets, type ItemTip, type SiteAssets } from "@/lib/game-assets";

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
