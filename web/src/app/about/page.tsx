import type { Metadata } from "next";
import Link from "next/link";
import { tools } from "@/data/tools";

export const metadata: Metadata = {
  title: "About",
  description:
    "GoldGoblin.gg is a free toolkit for World of Warcraft players — calculators, planners, and trackers built to save playtime.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <article className="prose prose-invert max-w-3xl">
      <h1 className="font-display text-3xl font-bold text-parchment-100">
        About GoldGoblin.gg
      </h1>

      <p className="text-parchment-100/80">
        GoldGoblin.gg is a growing collection of free, no-account-required tools
        for World of Warcraft players. Every tool here comes from a
        &ldquo;I wish something just did X&rdquo; moment mid-raid or mid-farm.
      </p>

      <h2 className="font-display text-xl text-parchment-100 mt-8">
        What makes these tools different
      </h2>
      <p className="text-parchment-100/80">
        Big WoW databases are great for looking things up, but terrible for
        actually <em>doing</em> something with the information. These tools are
        focused: one problem, one page, one answer. Input your data, get your
        answer, close the tab.
      </p>

      <h2 className="font-display text-xl text-parchment-100 mt-8">
        What&apos;s available now
      </h2>
      <ul className="list-disc pl-6 text-parchment-100/80">
        {tools.map((t) => (
          <li key={t.slug}>
            <Link
              href={`/tools/${t.slug}`}
              className="text-gold-400 hover:underline underline-offset-4"
            >
              {t.title}
            </Link>
            {t.status === "coming-soon" && (
              <span className="text-parchment-100/50"> — coming soon</span>
            )}
            <br />
            <span className="text-sm text-parchment-100/60">{t.tagline}</span>
          </li>
        ))}
      </ul>

      <h2 className="font-display text-xl text-parchment-100 mt-8">
        How it stays free
      </h2>
      <p className="text-parchment-100/80">
        The site is supported by Google AdSense ads. We don&apos;t sell data, we
        don&apos;t gate tools behind signups, and we don&apos;t show popups or
        interstitials. If you want to support the project more directly, a
        future &ldquo;buy me a coffee&rdquo; link will appear here.
      </p>

      <h2 className="font-display text-xl text-parchment-100 mt-8">
        Not affiliated with Blizzard
      </h2>
      <p className="text-parchment-100/80">
        GoldGoblin.gg is an independent fan project. World of Warcraft, its
        artwork, and related trademarks are property of Blizzard Entertainment,
        Inc.
      </p>
    </article>
  );
}
