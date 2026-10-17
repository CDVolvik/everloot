import type { Metadata } from "next";
import Link from "next/link";
import { LAUNCH, longDate } from "@/data/wow-forever";
import { latestBuildLine } from "@/lib/changes-facts";
import { loadTimeline } from "@/lib/changes";
import { pageMetadata } from "@/lib/seo";

const description =
  "WoW Forever is Blizzard's World of Warcraft: Forever release. The launch date from Blizzard's announcement, and the newest game build Everloot has seen.";

export const metadata: Metadata = pageMetadata({ title: "What Is WoW Forever? Launch Date and Latest Build", description, path: "/wow-forever" });

const link = "text-accent hover:underline underline-offset-4";

export default function WowForeverPage() {
  return (
    <article className="space-y-8 max-w-3xl">
      <header className="space-y-3">
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">What is WoW: Forever?</h1>
        <p className="text-lg text-fg-2 max-w-2xl">
          WoW: Forever is short for World of Warcraft: Forever, the Blizzard release Everloot follows. Everloot is a fan project and
          is not affiliated with or endorsed by Blizzard Entertainment, so anything official is Blizzard&apos;s to say. This page
          points at what they have said.
        </p>
      </header>

      <section aria-labelledby="launch" className="space-y-3">
        <h2 id="launch" className="text-2xl font-semibold text-fg">When does WoW: Forever launch?</h2>
        <p className="text-fg-2">
          Blizzard&apos;s announcement gives the date as {longDate(LAUNCH.date)}. This is the sentence, word for word:
        </p>
        <blockquote className="border-l-2 border-line pl-4 text-fg">&ldquo;{LAUNCH.quote}&rdquo;</blockquote>
        <p className="text-sm text-fg-2">
          Source: <a href={LAUNCH.sourceUrl} rel="noopener" className={link}>{LAUNCH.sourceName}, {LAUNCH.sourceTitle}</a>.
          Checked on <time dateTime={LAUNCH.checkedOn}>{longDate(LAUNCH.checkedOn)}</time>. If Blizzard changes the date, their post is
          the one to trust.
        </p>
      </section>

      <section aria-labelledby="latest" className="space-y-3">
        <h2 id="latest" className="text-2xl font-semibold text-fg">What is the latest WoW: Forever build?</h2>
        <p className="text-fg-2">{latestBuildLine(loadTimeline())}</p>
        <p className="text-sm text-muted">
          A build&apos;s date is when Everloot first saw it, not when Blizzard shipped it. Every build and Blizzard post is on{" "}
          <Link href="/changes" className={link}>Patch notes and Blizzard posts</Link>.
        </p>
      </section>

      <section aria-labelledby="tools" className="space-y-3">
        <h2 id="tools" className="text-2xl font-semibold text-fg">What can you do with it on Everloot?</h2>
        <ul className="list-disc pl-6 space-y-1 text-fg-2">
          <li><Link href="/tools/talents" className={link}>Talent calculator</Link> for all nine classes, from the game files.</li>
          <li><Link href="/tools/raid" className={link}>Raid buff planner</Link> for 10, 20 and 40 player raids.</li>
          <li><Link href="/map" className={link}>World map</Link> of zones and dungeon and raid entrances.</li>
          <li><Link href="/addons" className={link}>Addons</Link> and the Everloot addon that collects what players see.</li>
        </ul>
        <p className="text-sm text-muted">
          Game-file data is Blizzard&apos;s, shown as found in game files and unconfirmed until it is seen in play.
        </p>
      </section>
    </article>
  );
}
