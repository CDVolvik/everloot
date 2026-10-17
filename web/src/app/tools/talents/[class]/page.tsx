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
    description: `Plan ${catalog.className} talents for WoW: Forever with point rules, two talent sets, undo and a share link that names the game build. Trees are unconfirmed.`,
    alternates: { canonical: path },
    openGraph: { title: `${catalog.className} talent calculator`, url: path, type: "website" },
  };
}

export default async function TalentClassPage({ params }: Params) {
  const { class: slug } = await params;
  if (!isTalentClass(slug)) notFound();
  const catalog = await loadCatalog(slug);

  return (
    <article className="space-y-8">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">
          <Link href="/tools/talents" className="hover:text-fg"><Bracket>Talents</Bracket></Link>
        </p>
        <h1 className={`text-3xl sm:text-4xl font-bold tracking-tight ${CLASS_TEXT[slug]}`}>{catalog.className} talent calculator</h1>
        <ul className="flex flex-wrap gap-2 font-mono text-xs text-muted">
          <li className="rounded-full border border-dashed border-edge px-3 py-1">{catalog.label} · build {catalog.build}</li>
          <li className="rounded-full border border-dashed border-edge px-3 py-1">{catalog.rules.gateScope === "unconfirmed" ? "gate scope unconfirmed" : `row gates count points in the ${catalog.rules.gateScope}`} · second set at level {catalog.rules.dualSpecLevel} from beta notes</li>
        </ul>
      </header>

      <TalentCalculator catalog={catalog} />

      <p className="border-t border-line pt-6 text-sm text-fg-2 max-w-2xl">
        Talent trees read from the WoW: Forever game files, build {catalog.build}. Unconfirmed until
        checked in game. Talent names &copy; Blizzard Entertainment.
      </p>
    </article>
  );
}
