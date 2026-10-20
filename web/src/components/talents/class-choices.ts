import type { ClassChoice } from "./ClassPicker";
import { classAndProfessionIcons, loadSiteAssets } from "@/lib/game-assets";
import { TALENT_CLASSES } from "@/lib/talents/catalogs";

const titleCase = (slug: string) => slug[0].toUpperCase() + slug.slice(1);

/**
 * The nine classes for the talent pickers, each with the game's class icon when the asset folder is
 * set (server side; without it the pickers show names only). `trees` adds each class's tree names.
 */
export async function classChoices(trees?: Map<string, string[]>): Promise<ClassChoice[]> {
  const icons = new Map(classAndProfessionIcons(await loadSiteAssets()).classes.map((c) => [c.key, c.icon]));
  return TALENT_CLASSES.map((slug) => ({ slug, name: titleCase(slug), icon: icons.get(slug) ?? null, trees: trees?.get(slug) }));
}
