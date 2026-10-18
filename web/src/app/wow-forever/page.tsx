import type { Metadata } from "next";
import Link from "next/link";
import { CLASSES, LAUNCH, longDate, NEW_COMBOS, RACES } from "@/data/wow-forever";
import { latestBuildLine } from "@/lib/changes-facts";
import { loadTimeline } from "@/lib/changes";
import { pageMetadata } from "@/lib/seo";
import { emblems, loadSiteAssets } from "@/lib/game-assets";
import GameIcon from "@/components/game/GameIcon";
import GameCredit from "@/components/game/GameCredit";

const description =
  "WoW Forever is Blizzard's World of Warcraft: Forever: the launch date, every playable race and class combination, and the newest game build Everloot has seen.";

export const metadata: Metadata = pageMetadata({ title: "What Is WoW Forever? Launch Date and Latest Build", description, path: "/wow-forever" });

const link = "text-accent hover:underline underline-offset-4";
const isNew = (race: string, cls: string) => NEW_COMBOS.some(([r, c]) => r === race && c === cls);

/** `icons`: the game's race and faction emblems by name (lib/game-assets.ts), empty without the asset URL. */
function RaceTable({ faction, rows, icons }: { faction: string; rows: Record<string, readonly string[]>; icons: ReturnType<typeof emblems> }) {
  const factionIcon = icons.factions.get(faction);
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-sm">
        <caption className="text-left px-3 py-2 font-semibold text-fg">{factionIcon && <GameIcon src={factionIcon} size={24} className="mr-2" />}{faction}</caption>
        <thead>
          <tr className="border-t border-line text-muted">
            <th scope="col" className="text-left px-3 py-2 font-medium">Race</th>
            {CLASSES.map((c) => <th key={c} scope="col" className="px-2 py-2 font-medium">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {Object.entries(rows).map(([race, classes]) => (
            <tr key={race} className="border-t border-line">
              <th scope="row" className="text-left px-3 py-2 font-medium text-fg">{icons.races.get(race) && <GameIcon src={icons.races.get(race)!} size={24} className="mr-2" />}{race}</th>
              {CLASSES.map((c) => (
                <td key={c} className="px-2 py-2 text-center">
                  {!classes.includes(c) ? <span className="sr-only">Not playable</span>
                    : isNew(race, c) ? <span className="text-accent font-semibold">New</span>
                    : <><span className="sr-only">Playable</span><span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-fg-2" /></>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function WowForeverPage() {
  // The game's race and faction emblems beside the names, only when the asset URL is set and the upload has them.
  const assets = await loadSiteAssets();
  const icons = emblems(assets);
  const shown = icons.races.size > 0 || icons.factions.size > 0;
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

      <section aria-labelledby="races" className="space-y-3">
        <h2 id="races" className="text-2xl font-semibold text-fg">Which races and classes can you play?</h2>
        <p className="text-fg-2">
          Ten race rows across the two factions. Skyborne, the new race, plays on both: Horde Skyborne can be Shamans and Alliance
          Skyborne can be Mages. <span className="text-accent font-semibold">New</span> marks the combinations Blizzard names as new
          in WoW: Forever.
        </p>
        {Object.entries(RACES.factions).map(([faction, rows]) => <RaceTable key={faction} faction={faction} rows={rows} icons={icons} />)}
        <p className="text-sm text-fg-2">
          Source: <a href={RACES.sourceUrl} rel="noopener" className={link}>{RACES.sourceName}, {RACES.sourceTitle}</a>, published{" "}
          <time dateTime={RACES.published}>{longDate(RACES.published)}</time>. Checked on{" "}
          <time dateTime={RACES.checkedOn}>{longDate(RACES.checkedOn)}</time>.
        </p>
        {assets && shown && <GameCredit version={assets.version} label={assets.label} what="Race and faction emblems" />}
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
