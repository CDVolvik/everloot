import type { Metadata } from "next";
import AdSlot from "@/components/AdSlot";
import { pageMetadata } from "@/lib/seo";
import GoldCalculator from "@/components/GoldCalculator";
import JsonLd from "@/components/JsonLd";
import { webApplicationJsonLd } from "@/lib/jsonld";
import { trailFor } from "@/lib/breadcrumbs";
import { getTool } from "@/data/tools";
import { Container, Disclosure, PageHeader, SectionHeading, SourceLine } from "@/components/ui";

const tool = getTool("gold-per-hour")!;
const TITLE = "WoW Forever Gold per Hour Calculator";
const description = "Calculate gold per hour for a WoW: Forever farm from your own route, items looted and auction prices. Includes the 5% auction house cut and vendor trash.";

export const metadata: Metadata = {
  ...pageMetadata({ title: TITLE, description, path: "/tools/gold-per-hour" }),
  keywords: tool.keywords,
};

export default function GoldPerHourPage() {
  return (
    <Container>
      <JsonLd data={webApplicationJsonLd({ name: TITLE, path: "/tools/gold-per-hour", description })} />
      <PageHeader
        trail={trailFor("/tools/gold-per-hour")!}
        title={TITLE}
        lede="Gold per hour for a WoW: Forever farm, from your own time, loot and auction prices, after the 5% auction house cut."
      />

      <GoldCalculator />
      <AdSlot slot="belowTool" />

      {/* The how-to stays on the page for readers and search engines, closed until asked for. */}
      <section className="mt-12" aria-labelledby="gph-help">
        <SectionHeading id="gph-help">Questions</SectionHeading>
        <Disclosure summary="How do I use this calculator?">
          <ol className="list-decimal space-y-2 pl-6">
            <li>
              Run your farm for a measured amount of time — even 20 minutes gives a
              useful sample. Enter the duration at the top.
            </li>
            <li>
              Log your drops. For each stack or item, enter the item name, how many
              you got, and the current price on your realm&apos;s auction house.
            </li>
            <li>
              Add any vendor gold from trash or quest rewards to the &ldquo;Vendor /
              extra gold&rdquo; field.
            </li>
            <li>
              Leave the 5% AH cut on if you plan to list these on the
              auction house — it&apos;s what you&apos;ll actually net.
            </li>
          </ol>
        </Disclosure>
        <Disclosure summary="Why measure your gold per hour?">
          <p>
            &ldquo;GPH&rdquo; is the great equalizer in World of Warcraft gold
            making. A farm that drops rare gear can feel exciting but actually
            pay less per hour than a boring herbing route. Measuring gold per
            hour turns vibes into numbers, so you can compare a cloth farm, a
            herbing route and a dungeon run in the same units.
          </p>
        </Disclosure>
        <Disclosure summary="How do I get accurate numbers?">
          <ul className="list-disc space-y-2 pl-6">
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
        </Disclosure>
      </section>

      <SourceLine source="Your own numbers: the time, loot and prices you enter" />
    </Container>
  );
}
