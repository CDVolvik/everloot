import type { ClassChoice } from "./ClassPicker";
import { classAndProfessionIcons, type SiteAssets } from "@/lib/game-assets";
import { TALENT_CLASSES } from "@/lib/talents/catalogs";

const titleCase = (slug: string) => slug[0].toUpperCase() + slug.slice(1);

/**
 * The nine classes for the talent pickers, each with the game's class icon when the page has the
 * asset folder (without it the pickers show names only). `trees` adds each class's tree names.
 */
export function classChoices(assets: SiteAssets | null, trees?: Map<string, string[]>): ClassChoice[] {
  const icons = new Map(classAndProfessionIcons(assets).classes.map((c) => [c.key, c.icon]));
  return TALENT_CLASSES.map((slug) => ({ slug, name: titleCase(slug), icon: icons.get(slug) ?? null, trees: trees?.get(slug) }));
}
