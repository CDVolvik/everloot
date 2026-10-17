import type { Metadata } from "next";
import Link from "next/link";
import Bracket from "@/components/Bracket";
import JsonLd from "@/components/JsonLd";
import { CLASS_TEXT } from "@/components/talents/TalentTreeView";
import { getTool } from "@/data/tools";
import { webApplicationJsonLd } from "@/lib/jsonld";
import { pageMetadata } from "@/lib/seo";
import { TALENT_CLASSES, loadCatalog } from "@/lib/talents/catalogs";
import { hubAnswers } from "@/lib/talents/facts";

const tool = getTool("talents")!;
const TITLE = "WoW Forever Talent Calculator";
const description = "Plan WoW: Forever talents for all nine classes with the game's own point rules, two talent sets, undo and a share link. Trees are unconfirmed.";

export const metadata: Metadata = {
  ...pageMetadata({ title: TITLE, description, path: "/tools/talents" }),
  keywords: tool.keywords,
};

const title = (slug: string) => slug[0].toUpperCase() + slug.slice(1);

export default async function TalentsIndexPage() {
  const answers = hubAnswers(await Promise.all(TALENT_CLASSES.map(loadCatalog)));
  return (
    <article className="space-y-8 max-w-4xl">
      <JsonLd data={webApplicationJsonLd({ name: TITLE, path: "/tools/talents", description })} />
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted"><Bracket>{tool.title}</Bracket></p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">{TITLE}</h1>
        <p className="text-lg text-fg-2 max-w-2xl">{description}</p>
      </header>

      <nav aria-label="Classes">
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {TALENT_CLASSES.map((slug) => (
            <li key={slug}>
              <Link href={`/tools/talents/${slug}`} className={`tool-card flex min-h-11 items-center rounded-lg border border-line bg-panel px-4 py-3 hover:border-edge ${CLASS_TEXT[slug]}`}>
                <Bracket>{title(slug)}</Bracket>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-labelledby="points" className="max-w-2xl space-y-2">
        <h2 id="points" className="text-xl font-semibold text-fg">{answers.pointsQuestion}</h2>
        <p className="text-fg-2">{answers.pointsAnswer}</p>
      </section>
      <section aria-labelledby="sets" className="max-w-2xl space-y-2">
        <h2 id="sets" className="text-xl font-semibold text-fg">{answers.setsQuestion}</h2>
        <p className="text-fg-2">{answers.setsAnswer}</p>
      </section>

      <p className="text-sm text-fg-2 max-w-2xl">
        Talent trees read from the WoW: Forever game files. Unconfirmed until checked in game. Talent
        names &copy; Blizzard Entertainment.
      </p>
    </article>
  );
}
