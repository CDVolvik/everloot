import AdSlot from "@/components/AdSlot";
import JsonLd from "@/components/JsonLd";
import { webApplicationJsonLd } from "@/lib/jsonld";
import { loadSiteAssets } from "@/lib/game-assets";
import { loadCatalog, type TalentClassSlug } from "@/lib/talents/catalogs";
import { classAnswers, classDescription, classFacts } from "@/lib/talents/facts";
import TalentCalculator from "./TalentCalculator";
import { CLASS_TEXT } from "./TalentTreeView";

// One class's calculator page body: the header, the calculator and the facts below it. The class page
// renders it as is; a build link (/b/<code>) renders it with the build to open.

export const pageTitle = (className: string) => `WoW Forever ${className} Talent Calculator`;

export default async function TalentClassView({ slug, initialCodes }: { slug: TalentClassSlug; initialCodes?: (string | null)[] }) {
  const catalog = await loadCatalog(slug);
  const facts = classFacts(catalog);
  const answers = classAnswers(facts);
  const description = classDescription(facts);
  // Tree icons from the site's asset folder, matched by tree name; none when the folder is not set.
  const art = (await loadSiteAssets())?.classes.get(slug);
  const treeIcons = catalog.trees.map((t, i) => art?.trees.find((a) => a.name === t.name)?.icon ?? art?.trees[i]?.icon ?? null);

  return (
    <article className="space-y-6">
      <JsonLd data={webApplicationJsonLd({ name: pageTitle(catalog.className), path: `/tools/talents/${slug}`, description, hubPath: "/tools/talents" })} />
      {/* The breadcrumb above already links the talent hub, so the header starts at the title. */}
      <header className="space-y-2">
        <h1 className={`text-3xl sm:text-4xl font-bold tracking-tight ${CLASS_TEXT[slug]}`}>{pageTitle(catalog.className)}</h1>
        <p className="text-fg-2 max-w-2xl">{description}</p>
        {/* Also said under the trees; on a phone the trees come first. */}
        <ul className="hidden sm:flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted">
          <li>{catalog.label} · build {catalog.build}</li>
          <li>{catalog.rules.gateScope === "unconfirmed" ? "gate scope unconfirmed" : `row gates count points in the ${catalog.rules.gateScope}`} · second set at level {catalog.rules.dualSpecLevel} from beta notes</li>
        </ul>
      </header>

      <TalentCalculator catalog={catalog} treeIcons={treeIcons} initialCodes={initialCodes} />
      <AdSlot slot="belowTool" />

      <section aria-labelledby="class-facts" className="max-w-2xl space-y-6 border-t border-line pt-6 text-fg-2">
        <div className="space-y-2">
          <h2 id="class-facts" className="text-xl font-semibold text-fg">{answers.pointsQuestion}</h2>
          <p>{answers.pointsAnswer}</p>
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-fg">{answers.layoutQuestion}</h2>
          <ul className="list-disc pl-6">
            {facts.trees.map((t) => (
              <li key={t.name}><span className="text-fg">{t.name}</span>: {t.talents} talents, {t.ranks} ranks</li>
            ))}
          </ul>
          {answers.layoutAnswer && <p>{answers.layoutAnswer}</p>}
          {catalog.rules.gateScope === "unconfirmed" && (
            <p className="text-sm text-muted">Where a gate counts its points is unconfirmed for some talents. The calculator reads those as points in the same tree.</p>
          )}
        </div>
      </section>

      <p className="border-t border-line pt-6 text-sm text-fg-2 max-w-2xl">
        Talent trees read from the WoW: Forever game files, build {catalog.build}. Unconfirmed until
        checked in game. Talent names &copy; Blizzard Entertainment.
      </p>
    </article>
  );
}
