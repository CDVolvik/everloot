import AdSlot from "@/components/AdSlot";
import JsonLd from "@/components/JsonLd";
import RaidBuilder from "./RaidBuilder";
import { CURRENT_BUILD, TABLES } from "@/data/game-data/raid";
import { getTool } from "@/data/tools";
import { webApplicationJsonLd } from "@/lib/jsonld";
import { raidTalentFacts } from "@/lib/raid-facts";
import { BANNER_MAP, creditWhat, loadingArt, loadSiteAssets, raidArt } from "@/lib/game-assets";
import GameCredit from "@/components/game/GameCredit";
import PageBanner from "@/components/game/PageBanner";

const tool = getTool("raid")!;
export const TITLE = "WoW Forever Raid Buff Planner";
export const description = "Fill a 10, 20 or 40 player WoW: Forever raid with classes and talent trees to see which buffs and debuffs each group gets. Rules are unconfirmed.";

const PROOF: Record<string, string> = {
  "talent spell": "a talent has the effect's spell",
  "spell chain": "a talent spell learns or triggers it",
  "talent name": "a talent has the same name",
};

/** The raid planner page body. The page renders it as is; a raid link (/tools/raid/r/<code>) renders it with the raid to open. */
export default async function RaidView({ initialCode }: { initialCode?: string } = {}) {
  const facts = raidTalentFacts(TABLES[CURRENT_BUILD]);
  // Class, tree and buff icons and a raid's loading screen, only when the asset URL is set and the upload has them.
  const assets = await loadSiteAssets();
  const art = raidArt(assets, TABLES[CURRENT_BUILD]);
  const banner = loadingArt(assets, BANNER_MAP.raid);
  const credit = creditWhat(art && "icons", art && Object.keys(art.familyTips).length > 0 && "tooltip text", banner && "loading screen art");
  return (
    <article className="space-y-8">
      <JsonLd data={webApplicationJsonLd({ name: TITLE, path: "/tools/raid", description })} />
      {banner && <PageBanner art={banner} eager />}
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">Tool · {tool.title}</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg">{TITLE}</h1>
        <p className="text-lg text-fg-2 max-w-2xl">{description}</p>
      </header>

      <RaidBuilder art={art} initialCode={initialCode} />
      {assets && (art || banner) && <GameCredit version={assets.version} label={assets.label} what={credit} />}
      <AdSlot slot="belowTool" />

      <section aria-labelledby="needs-talent" className="max-w-2xl space-y-3 border-t border-line pt-6 text-fg-2">
        <h2 id="needs-talent" className="text-2xl text-fg">Which raid buffs need a talent?</h2>
        <p>
          In the game files of build {facts.build}, {facts.talent.length} of the effects the planner counts come only through a
          talent{facts.unknownTree.length ? `, and ${facts.unknownTree.length} more have talent matches in more than one tree` : ""}.
          The other {facts.baseline} come with the class. Unconfirmed until seen in play.
        </p>
        <ul className="list-disc pl-6 space-y-1">
          {facts.talent.map((b) => (
            <li key={`${b.class}-${b.label}`}>
              <span className="text-fg">{b.label}</span>: {b.class}, {b.tree} tree{b.proof ? ` (${PROOF[b.proof] ?? b.proof})` : ""}
            </li>
          ))}
          {facts.unknownTree.map((b) => (
            <li key={`${b.class}-${b.label}`}>
              <span className="text-fg">{b.label}</span>: {b.class}, tree unknown
            </li>
          ))}
        </ul>
      </section>

      <section className="max-w-2xl space-y-3 border-t border-line pt-6 text-fg-2">
        <h2 className="text-2xl text-fg">How to read it</h2>
        <p>
          Pick a slot, then a class and a talent tree. Each group holds five. The tables show what the classes you
          picked can bring, not what a raid has assigned: a shaman is counted as able to bring every totem, even
          though one shaman drops one totem per element.
        </p>
        <p>
          A party effect counts for the group that holds the provider. A raid effect counts for every group.
          Buffs cast on players one at a time are marked &ldquo;Cast&rdquo;, because someone has to cast them.
          Effects in one family, such as Mark of the Wild and Gift of the Wild, count once. Whether the Tranquil
          Air, Windfury and Grace of Air totems stack across different shamans is not modelled.
        </p>
        <h2 className="text-2xl text-fg">Where the rules come from</h2>
        <p>
          Everything here is read from the game files of build {CURRENT_BUILD} and is unconfirmed until it is
          seen in play. Where the files do not settle how far an effect reaches, or its ranks disagree, it reads
          &ldquo;unknown&rdquo; and is not counted as covered. Where a talent gives a class an effect, the
          tree comes from the game&apos;s talent data, and a slot set to the wrong tree does not count; an effect
          with no talent behind it comes with the class.
          Rules stay in data, per build, so a change in a later build is a new row and not a code change.
        </p>
        <h2 className="text-2xl text-fg">In game</h2>
        <p>
          The Everloot addon can list the raid buffs missing in each group of your current raid with{" "}
          <span className="font-mono">/everloot raid</span>, and{" "}
          <span className="font-mono">/everloot raid code</span> gives a link that opens the same raid here. It only
          reads your group and displays; it never casts or acts for you. It cannot read other players&apos; talent
          trees, so those slots come in as &ldquo;any tree&rdquo;.
        </p>
      </section>
    </article>
  );
}
