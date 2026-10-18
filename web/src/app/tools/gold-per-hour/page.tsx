import type { Metadata } from "next";
import AdSlot from "@/components/AdSlot";
import { pageMetadata } from "@/lib/seo";
import GoldCalculator from "@/components/GoldCalculator";
import JsonLd from "@/components/JsonLd";
import { webApplicationJsonLd } from "@/lib/jsonld";
import { getTool } from "@/data/tools";

const tool = getTool("gold-per-hour")!;
const TITLE = "WoW Forever Gold per Hour Calculator";
const description = "Calculate gold per hour for a WoW: Forever farm from your own route, items looted and auction prices. Includes the 5% auction house cut and vendor trash.";

export const metadata: Metadata = {
  ...pageMetadata({ title: TITLE, description, path: "/tools/gold-per-hour" }),
  keywords: tool.keywords,
};

export default function GoldPerHourPage() {
  return (
    <article className="space-y-8">
      <JsonLd data={webApplicationJsonLd({ name: TITLE, path: "/tools/gold-per-hour", description })} />
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">
          Tool · Gold
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg">
          {TITLE}
        </h1>
        <p className="text-lg text-fg-2 max-w-2xl">
          {description}
        </p>
      </header>

      <GoldCalculator />
      <AdSlot slot="belowTool" />

      {/* SEO content — AdSense wants real text below the fold */}
      <section className="prose prose-invert max-w-none pt-6 border-t border-line">
        <h2 className="text-2xl text-fg">
          How to use this calculator
        </h2>
        <ol className="list-decimal pl-6 space-y-2 text-fg-2">
          <li>
            Run your farm for a measured amount of time — even 20 minutes gives a
            useful sample. Enter the duration at the top.
          </li>
          <li>
            Log your drops. For each stack or item, enter the item name, how many
            you got, and the current price on your realm&apos;s auction house.
          </li>
          <li>
            Add any vendor gold from trash or quest rewards to the &ldquo;Vendor
            gold&rdquo; field.
          </li>
          <li>
            Leave the 5% AH cut toggle on if you plan to list these on the
            auction house — it&apos;s what you&apos;ll actually net.
          </li>
        </ol>

        <h2 className="text-2xl text-fg mt-8">
          Why measure your gold per hour?
        </h2>
        <p className="text-fg-2">
          &ldquo;GPH&rdquo; is the great equalizer in World of Warcraft gold
          making. A farm that drops rare gear can feel exciting but actually
          pay less per hour than a boring herbing route. Measuring gold per
          hour turns vibes into numbers, so you can compare a cloth farm, a
          herbing route and a dungeon run in the same units.
        </p>

        <h2 className="text-2xl text-fg mt-8">
          Tips for accurate numbers
        </h2>
        <ul className="list-disc pl-6 space-y-2 text-fg-2">
          <li>
            Use the lower end of the current AH price, not the highest listing —
            you&apos;re competing with undercutters.
          </li>
          <li>
            For items that sell slowly, discount the price further or track a
            separate &ldquo;realized&rdquo; gold/hour a week later.
          </li>
          <li>
            Do a few runs before trusting the number. One lucky rare drop can
            inflate a single sample significantly.
          </li>
          <li>
            Compare the share-link results across your guild — what works on one
            realm may not work on another.
          </li>
        </ul>
      </section>
    </article>
  );
}
