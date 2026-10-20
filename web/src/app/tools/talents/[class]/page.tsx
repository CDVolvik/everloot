import type { Metadata } from "next";
import AdSlot from "@/components/AdSlot";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import ClassPicker from "@/components/talents/ClassPicker";
import TalentCalculator from "@/components/talents/TalentCalculator";
import { CLASS_TEXT } from "@/components/talents/TalentTreeView";
import { Disclosure, PageHeader, SectionHeading, SourceLine } from "@/components/ui";
import { trailFor } from "@/lib/breadcrumbs";
import { webApplicationJsonLd } from "@/lib/jsonld";
import { pageMetadata } from "@/lib/seo";
import { TALENT_CLASSES, isTalentClass, loadCatalog } from "@/lib/talents/catalogs";
import { classChoices } from "@/components/talents/class-choices";
import { HOW_IT_WORKS_ID, classAnswers, classDescription, classFacts } from "@/lib/talents/facts";

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
  const classes = await classChoices();
  const path = `/tools/talents/${slug}`;

  return (
    <article>
      <JsonLd data={webApplicationJsonLd({ name: pageTitle(catalog.className), path, description, hubPath: "/tools/talents" })} />
      <PageHeader trail={trailFor(path)!} title={<span className={CLASS_TEXT[slug]}>{pageTitle(catalog.className)}</span>} lede={description} />

      <div className="space-y-4">
        <ClassPicker variant="strip" classes={classes} current={slug} />
        <TalentCalculator catalog={catalog} classIcon={classes.find((c) => c.slug === slug)?.icon ?? null} />
      </div>
      <AdSlot slot="belowTool" />

      <section aria-labelledby="questions" className="mt-12">
        <SectionHeading id="questions">Questions</SectionHeading>
        <Disclosure id={HOW_IT_WORKS_ID} summary="How does the calculator work?">
          <p>
            Click or tap a talent, or press Enter on it, to add a point. Right click, Delete, or the
            &ldquo;Take points back&rdquo; switch takes one back. With the game&apos;s tooltips on the page, a long
            press shows a talent&apos;s tooltip and Escape closes it; without them, a long press takes a point back.
            Arrow keys move between talents, and Ctrl+Z and Ctrl+Y undo and redo.
          </p>
          <p>
            The small number at the left of each row is how many points must be spent in that tree, on the rows
            above, before the row opens. Each set has its own points; Reset next to a tree clears only that tree.
            A share link holds the whole set and the game build it was made on.
          </p>
          <p>
            The second set opening at level {catalog.rules.dualSpecLevel} comes from the beta notes, not the game files.
            {catalog.rules.gateScope === "unconfirmed" && " Where a row gate counts its points is unconfirmed for some talents; the calculator reads those as points in the same tree."}
          </p>
        </Disclosure>
        <Disclosure summary={answers.pointsQuestion}>
          <p>{answers.pointsAnswer}</p>
        </Disclosure>
        <Disclosure summary={answers.layoutQuestion}>
          <ul className="list-disc pl-6">
            {facts.trees.map((t) => (
              <li key={t.name}><span className="text-fg">{t.name}</span>: {t.talents} talents, {t.ranks} ranks</li>
            ))}
          </ul>
          {answers.layoutAnswer && <p>{answers.layoutAnswer}</p>}
        </Disclosure>
      </section>

      <SourceLine build={catalog.build}>talent names &copy; Blizzard Entertainment</SourceLine>
    </article>
  );
}
