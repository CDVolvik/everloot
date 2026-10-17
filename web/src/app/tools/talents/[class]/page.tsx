import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Bracket from "@/components/Bracket";
import JsonLd from "@/components/JsonLd";
import TalentCalculator from "@/components/talents/TalentCalculator";
import { CLASS_TEXT } from "@/components/talents/TalentTreeView";
import { webApplicationJsonLd } from "@/lib/jsonld";
import { pageMetadata } from "@/lib/seo";
import { TALENT_CLASSES, isTalentClass, loadCatalog } from "@/lib/talents/catalogs";
import { classAnswers, classDescription, classFacts } from "@/lib/talents/facts";

// Static: the tree is the same for everyone. A share link keeps its build in the #fragment, which
// the browser reads after the page loads, so this page is built once and cached.
export const dynamicParams = false;

export function generateStaticParams() {
  return TALENT_CLASSES.map((slug) => ({ class: slug }));
}

type Params = { params: Promise<{ class: string }> };

const pageTitle = (className: string) => `WoW Forever ${className} Talent Calculator`;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { class: slug } = await params;
  if (!isTalentClass(slug)) return {};
  const catalog = await loadCatalog(slug);
  const path = `/tools/talents/${slug}`;
  return pageMetadata({
    title: pageTitle(catalog.className),
    description: classDescription(classFacts(catalog)),
    path,
    image: `${path}/opengraph-image`,
  });
}

export default async function TalentClassPage({ params }: Params) {
  const { class: slug } = await params;
  if (!isTalentClass(slug)) notFound();
  const catalog = await loadCatalog(slug);
  const facts = classFacts(catalog);
  const answers = classAnswers(facts);
  const description = classDescription(facts);

  return (
    <article className="space-y-8">
      <JsonLd data={webApplicationJsonLd({ name: pageTitle(catalog.className), path: `/tools/talents/${slug}`, description, hubPath: "/tools/talents" })} />
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">
          <Link href="/tools/talents" className="hover:text-fg"><Bracket>Talents</Bracket></Link>
        </p>
        <h1 className={`text-3xl sm:text-4xl font-bold tracking-tight ${CLASS_TEXT[slug]}`}>{pageTitle(catalog.className)}</h1>
        <p className="text-fg-2 max-w-2xl">{description}</p>
        <ul className="flex flex-wrap gap-2 font-mono text-xs text-muted">
          <li className="rounded-full border border-dashed border-edge px-3 py-1">{catalog.label} · build {catalog.build}</li>
          <li className="rounded-full border border-dashed border-edge px-3 py-1">{catalog.rules.gateScope === "unconfirmed" ? "gate scope unconfirmed" : `row gates count points in the ${catalog.rules.gateScope}`} · second set at level {catalog.rules.dualSpecLevel} from beta notes</li>
        </ul>
      </header>

      <TalentCalculator catalog={catalog} />

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
