import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import { tools } from "@/data/tools";
import { aboutPageJsonLd } from "@/lib/jsonld";

const TITLE = "About Everloot";
const description = "Everloot offers free WoW: Forever tools and a database built from player addon uploads. It is run by its maintainer and not affiliated with Blizzard.";

export const metadata: Metadata = {
  ...pageMetadata({ title: TITLE, description, path: "/about" }),
};

export default function AboutPage() {
  return (
    <article className="prose prose-invert max-w-3xl">
      <JsonLd data={aboutPageJsonLd({ name: TITLE, description, path: "/about" })} />
      <h1 className="text-3xl font-bold text-fg">
        {TITLE}
      </h1>

      <p className="text-lg text-fg-2">{description}</p>

      <p className="text-fg-2">
        Everloot is the WoW: Forever database, rebuilt Thottbot-style: drop
        rates, spawn maps, quest pages and guild progression collected by
        players running our lightweight addon — plus free tools that make the
        data usable. No account required to browse.
      </p>

      <h2 className="text-xl text-fg mt-8">
        What makes these tools different
      </h2>
      <p className="text-fg-2">
        Big WoW databases are great for looking things up, but terrible for
        actually <em>doing</em> something with the information. These tools are
        focused: one problem, one page, one answer. Input your data, get your
        answer, close the tab.
      </p>

      <h2 className="text-xl text-fg mt-8">
        What&apos;s available now
      </h2>
      <ul className="list-disc pl-6 text-fg-2">
        {tools.map((t) => (
          <li key={t.slug}>
            <Link
              href={`/tools/${t.slug}`}
              className="text-accent hover:underline underline-offset-4"
            >
              {t.title}
            </Link>
            {t.status === "coming-soon" && (
              <span className="text-muted"> — coming soon</span>
            )}
            <br />
            <span className="text-sm text-muted">{t.tagline}</span>
          </li>
        ))}
      </ul>

      <h2 className="text-xl text-fg mt-8">
        How it stays free
      </h2>
      <p className="text-fg-2">
        Everloot is run by its maintainer and paid for by a few clearly labelled
        Google ads on the tools, the patch notes and database pages. We don&apos;t
        sell data, we don&apos;t gate tools behind signups, and we don&apos;t show
        popups or interstitials.
      </p>

      <h2 className="text-xl text-fg mt-8">
        Not affiliated with Blizzard
      </h2>
      <p className="text-fg-2">
        Everloot is an independent fan project. World of Warcraft, its
        artwork, and related trademarks are property of Blizzard Entertainment,
        Inc.
      </p>
    </article>
  );
}
