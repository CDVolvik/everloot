import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Bracket from "@/components/Bracket";
import TalentCalculator from "@/components/talents/TalentCalculator";
import { CLASS_TEXT } from "@/components/talents/TalentTreeView";
import { TALENT_CLASSES, isTalentClass, loadCatalog } from "@/lib/talents/catalogs";

// Static: the tree is the same for everyone. A share link keeps its build in the #fragment, which
// the browser reads after the page loads, so this page is built once and cached.
export const dynamicParams = false;

export function generateStaticParams() {
  return TALENT_CLASSES.map((slug) => ({ class: slug }));
}

type Params = { params: Promise<{ class: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { class: slug } = await params;
  if (!isTalentClass(slug)) return {};
  const catalog = await loadCatalog(slug);
  const path = `/tools/talents/${slug}`;
  return {
    title: `${catalog.className} talent calculator`,
    description: `Plan ${catalog.className} talents for WoW: Forever with point rules, two talent sets, undo and a share link that names the game build. Trees are unconfirmed beta data.`,
    alternates: { canonical: path },
    openGraph: { title: `${catalog.className} talent calculator`, url: path, type: "website" },
  };
}

export default async function TalentClassPage({ params }: Params) {
  const { class: slug } = await params;
  if (!isTalentClass(slug)) notFound();
  const catalog = await loadCatalog(slug);
  const { source, rules } = catalog;

  return (
    <article className="space-y-8">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">
          <Link href="/tools/talents" className="hover:text-fg"><Bracket>Talents</Bracket></Link>
        </p>
        <h1 className={`text-3xl sm:text-4xl font-bold tracking-tight ${CLASS_TEXT[slug]}`}>{catalog.className} talent calculator</h1>
        <ul className="flex flex-wrap gap-2 font-mono text-xs text-muted">
          <li className="rounded-full border border-dashed border-edge px-3 py-1">trees: beta client files via {source.name}, build {catalog.build} · unconfirmed</li>
          <li className="rounded-full border border-dashed border-edge px-3 py-1">point rules: assumed · unconfirmed</li>
        </ul>
      </header>

      <TalentCalculator catalog={catalog} />

      <section className="space-y-3 border-t border-line pt-6 text-sm text-fg-2 max-w-2xl">
        <h2 className="text-fg font-semibold">Where this comes from</h2>
        <p>
          Talent names, positions, ranks and prerequisites are from{" "}
          <a className="text-accent underline" href={source.url}>{source.name}</a>, licensed{" "}
          <a className="text-accent underline" href={source.licenceUrl}>{source.licence}</a>. They read
          the layout from the beta client files; we read their export on {source.retrieved}. We changed
          it into our own format and added ids of our own.
        </p>
        <p>
          Blizzard owns the talent names, tooltip text, icons and art. The licence does not cover them,
          so this page shows no tooltip text and no icons. For what a talent does, check the game or{" "}
          <a className="text-accent underline" href={`${source.url}${slug}`}>the {catalog.className} page on {source.name}</a>.
        </p>
        <p>
          {rules.note} Nothing here has been read from the game by Everloot yet, so treat the trees and
          rules as unconfirmed. If a tree is wrong, a share link made on an older build will list what
          no longer fits instead of dropping it.
        </p>
      </section>
    </article>
  );
}
