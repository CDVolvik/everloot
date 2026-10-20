import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import { toolHref, tools } from "@/data/tools";
import { Container, PageHeader, SectionHeading } from "@/components/ui";
import { trailFor } from "@/lib/breadcrumbs";
import { aboutPageJsonLd, DISCORD_INVITE, NON_AFFILIATION, OPERATOR, TRADEMARK_LINE } from "@/lib/jsonld";

const TITLE = "About Everloot";
const description = `Everloot offers free WoW: Forever tools and a database built from player addon uploads. It is run by ${OPERATOR} and not affiliated with Blizzard.`;

const link = "text-accent hover:underline underline-offset-4";

export const metadata: Metadata = {
  // The layout adds "· Everloot", so the tab reads "About · Everloot" rather than naming Everloot twice.
  ...pageMetadata({ title: "About", description, path: "/about" }),
};

export default function AboutPage() {
  return (
    <Container width="reading">
      <JsonLd data={aboutPageJsonLd({ name: TITLE, description, path: "/about" })} />
      <PageHeader title={TITLE} lede={description} trail={trailFor("/about")!} />

      <div className="space-y-12">
        <section className="space-y-4 text-fg-2">
          <p>
            Everloot is the WoW: Forever database, rebuilt Thottbot-style: drop
            rates, spawn maps, quest pages and guild progression collected by
            players running our lightweight addon — plus free tools that make the
            data usable. No account required to browse.
          </p>
          <p>
            How uploads become facts, and what is never published, is on{" "}
            <Link href="/methodology" className={link}>How we count</Link>.
            Questions, bug reports and ideas are welcome on the{" "}
            <a href={DISCORD_INVITE} rel="noopener" className={link}>Everloot Discord</a>.
          </p>
        </section>

        <section aria-labelledby="different">
          <SectionHeading id="different">What makes these tools different</SectionHeading>
          <p className="text-fg-2">
            Big WoW databases are great for looking things up, but terrible for
            actually <em>doing</em> something with the information. These tools are
            focused: one problem, one page, one answer. Input your data, get your
            answer, close the tab.
          </p>
        </section>

        <section aria-labelledby="the-tools">
          <SectionHeading id="the-tools">The tools</SectionHeading>
          <ul className="divide-y divide-line border-y border-line">
            {tools.map((t) => (
              <li key={t.slug} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3">
                <Link href={toolHref(t)} className={link}>{t.title}</Link>
                <span className="text-sm text-muted">{t.tagline}{t.status === "coming-soon" && " Planned."}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="free">
          <SectionHeading id="free">How it stays free</SectionHeading>
          <p className="text-fg-2">
            Everloot is run by {OPERATOR} and paid for by a few clearly labelled
            Google ads on the tools, the patch notes and database pages. We don&apos;t
            sell data, we don&apos;t gate tools behind signups, and we don&apos;t show
            popups or interstitials.
          </p>
        </section>

        <section aria-labelledby="blizzard">
          <SectionHeading id="blizzard">Not affiliated with Blizzard</SectionHeading>
          <p className="text-fg-2">
            Everloot is an independent fan project. {NON_AFFILIATION} {TRADEMARK_LINE}
          </p>
        </section>
      </div>
    </Container>
  );
}
