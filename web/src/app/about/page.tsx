import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import { toolHref, tools } from "@/data/tools";
import { aboutPageJsonLd, DISCORD_INVITE, NON_AFFILIATION, OPERATOR, TRADEMARK_LINE } from "@/lib/jsonld";

const TITLE = "About Everloot";
const description = `Everloot offers free WoW: Forever tools and a database built from player addon uploads. It is run by ${OPERATOR} and not affiliated with Blizzard.`;

export const metadata: Metadata = {
  // The layout adds "· Everloot", so the tab reads "About · Everloot" rather than naming Everloot twice.
  ...pageMetadata({ title: "About", description, path: "/about" }),
};

export default function AboutPage() {
  return (
    <article className="max-w-3xl">
      <JsonLd data={aboutPageJsonLd({ name: TITLE, description, path: "/about" })} />
      <h1 className="text-3xl font-bold text-fg">
        {TITLE}
      </h1>

      <p className="text-lg text-fg-2">{description}</p>

      <p className="text-fg-2 mt-3">
        Everloot is the WoW: Forever database, rebuilt Thottbot-style: drop
        rates, spawn maps, quest pages and guild progression collected by
        players running our lightweight addon — plus free tools that make the
        data usable. No account required to browse.
      </p>

      <p className="text-fg-2 mt-3">
        How uploads become facts, and what is never published, is on{" "}
        <Link href="/methodology" className="text-accent hover:underline underline-offset-4">How we count</Link>.
        Questions, bug reports and ideas are welcome on the{" "}
        <a href={DISCORD_INVITE} rel="noopener" className="text-accent hover:underline underline-offset-4">Everloot Discord</a>.
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
        The tools
      </h2>
      <ul className="list-disc pl-6 text-fg-2">
        {tools.map((t) => (
          <li key={t.slug}>
            <Link
              href={toolHref(t)}
              className="text-accent hover:underline underline-offset-4"
            >
              {t.title}
            </Link>
            {t.status === "coming-soon" && (
              <span className="text-muted"> (planned)</span>
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
        Everloot is run by {OPERATOR} and paid for by a few clearly labelled
        Google ads on the tools, the patch notes and database pages. We don&apos;t
        sell data, we don&apos;t gate tools behind signups, and we don&apos;t show
        popups or interstitials.
      </p>

      <h2 className="text-xl text-fg mt-8">
        Not affiliated with Blizzard
      </h2>
      <p className="text-fg-2">
        Everloot is an independent fan project. {NON_AFFILIATION} {TRADEMARK_LINE}
      </p>
    </article>
  );
}
