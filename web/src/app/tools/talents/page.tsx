import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import ClassPicker from "@/components/talents/ClassPicker";
import { Disclosure, PageHeader, SectionHeading, SourceLine } from "@/components/ui";
import { getTool } from "@/data/tools";
import { trailFor } from "@/lib/breadcrumbs";
import { webApplicationJsonLd } from "@/lib/jsonld";
import { pageMetadata } from "@/lib/seo";
import { TALENT_CLASSES, loadCatalog } from "@/lib/talents/catalogs";
import { classChoices } from "@/components/talents/class-choices";
import { hubAnswers } from "@/lib/talents/facts";

const tool = getTool("talents")!;
const TITLE = "WoW Forever Talent Calculator";
const description = "Plan WoW: Forever talents for all nine classes with the game's own point rules, two talent sets, undo and a share link. Trees are unconfirmed.";

export const metadata: Metadata = {
  ...pageMetadata({ title: TITLE, description, path: "/tools/talents" }),
  keywords: tool.keywords,
};

export default async function TalentsIndexPage() {
  const catalogs = await Promise.all(TALENT_CLASSES.map(loadCatalog));
  const answers = hubAnswers(catalogs);
  const classes = await classChoices(new Map(catalogs.map((c) => [c.classSlug, c.trees.map((t) => t.name)])));
  return (
    <article>
      <JsonLd data={webApplicationJsonLd({ name: TITLE, path: "/tools/talents", description })} />
      <PageHeader trail={trailFor("/tools/talents")!} title={TITLE} lede={description} />

      <ClassPicker variant="cards" classes={classes} />

      <section aria-labelledby="questions" className="mt-12">
        <SectionHeading id="questions">Questions</SectionHeading>
        <Disclosure summary={answers.pointsQuestion}>
          <p>{answers.pointsAnswer}</p>
        </Disclosure>
        <Disclosure summary={answers.setsQuestion}>
          <p>{answers.setsAnswer}</p>
        </Disclosure>
      </section>

      <SourceLine build={catalogs[0]?.build}>talent names &copy; Blizzard Entertainment</SourceLine>
    </article>
  );
}
