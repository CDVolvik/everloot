import type { Metadata } from "next";
import Link from "next/link";
import Bracket from "@/components/Bracket";
import { CLASS_TEXT } from "@/components/talents/TalentTreeView";
import { getTool } from "@/data/tools";
import { TALENT_CLASSES } from "@/lib/talents/catalogs";

const tool = getTool("talents")!;

export const metadata: Metadata = {
  title: tool.title,
  description: tool.description,
  keywords: tool.keywords,
  alternates: { canonical: "/tools/talents" },
  openGraph: { title: tool.title, description: tool.tagline, url: "/tools/talents", type: "website" },
};

const title = (slug: string) => slug[0].toUpperCase() + slug.slice(1);

export default function TalentsIndexPage() {
  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted"><Bracket>Tools</Bracket></p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">{tool.title}</h1>
        <p className="text-lg text-fg-2 max-w-2xl">{tool.description}</p>
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

      <section className="space-y-2 text-sm text-fg-2 max-w-2xl">
        <h2 className="text-fg font-semibold">What is confirmed and what is not</h2>
        <p>
          Per Talents Forever, the trees come from the beta client files. They share them under CC BY 4.0.
          Everloot has not read them from the game itself, so every tree is unconfirmed and can lag
          the live game.
        </p>
        <p>
          The point rules are assumptions: one point per level from level 10, five points in a tree for
          each row above before a row opens, and a second talent set at level 40. We will confirm them
          against the game and change them if they are wrong.
        </p>
      </section>
    </article>
  );
}
