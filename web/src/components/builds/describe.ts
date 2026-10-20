import type { SavedBuild } from "@/lib/saved-builds";
import { isTalentClass, loadCatalog } from "@/lib/talents/catalogs";
import { importCode } from "@/lib/talents/import";
import { buildTitle, summarizeBuild } from "@/lib/talents/summary";

/** What a list says about a build beyond its name: how players say it ("Fire Mage 17/34/0"), and whether
 *  it was made on an older game build than the calculator's tree. */
export interface BuildFacts { title: string; older: boolean }

export const className = (slug: string) => slug.charAt(0).toUpperCase() + slug.slice(1);

/** One catalog per class, loaded once; a code that no longer loads keeps the class name as its title. */
export async function describeBuilds(builds: SavedBuild[]): Promise<Map<string, BuildFacts>> {
  const classes = [...new Set(builds.map((b) => b.classSlug))].filter(isTalentClass);
  const catalogs = new Map(await Promise.all(classes.map(async (slug) => [slug, await loadCatalog(slug)] as const)));
  const facts = new Map<string, BuildFacts>();
  for (const build of builds) {
    const catalog = isTalentClass(build.classSlug) ? catalogs.get(build.classSlug) : undefined;
    if (!catalog) { facts.set(build.id, { title: className(build.classSlug), older: false }); continue; }
    const loaded = importCode(catalog, build.code);
    facts.set(build.id, {
      title: loaded.ok ? buildTitle(catalog, summarizeBuild(catalog, loaded.ranks)) : catalog.className,
      older: build.gameBuild !== catalog.build,
    });
  }
  return facts;
}
