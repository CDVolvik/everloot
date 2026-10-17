import type { Metadata } from "next";
import RaidBuilder from "@/components/RaidBuilder";
import { getTool } from "@/data/tools";

const tool = getTool("raid")!;

export const metadata: Metadata = {
  title: tool.title,
  description: tool.description,
  keywords: tool.keywords,
  alternates: { canonical: "/tools/raid" },
  openGraph: { title: tool.title, description: tool.tagline, url: "/tools/raid", type: "website" },
};

export default function RaidPage() {
  return (
    <article className="space-y-8">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">Tool · Raid</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg">{tool.title}</h1>
        <p className="text-lg text-fg-2 max-w-2xl">{tool.description}</p>
      </header>

      <RaidBuilder />

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
          Everything here is read from the game files of build 1.60.1.70450 and is unconfirmed until it is
          seen in play. Where the files do not settle how far an effect reaches, or its ranks disagree, it reads
          &ldquo;unknown&rdquo; and is not counted as covered. The files do not say which talent tree a class
          needs for an effect, so coverage looks at the class only; the tree names are the game&apos;s own.
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
