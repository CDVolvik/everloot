import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { REPO_URL } from "@/lib/source";
import { Container, PageHeader, SectionHeading } from "@/components/ui";

const description =
  "How Everloot turns addon uploads into WoW Forever facts: three installs must agree, unrecorded never reads as zero, and names and addresses are never published.";

export const metadata: Metadata = pageMetadata({ title: "How We Count WoW Forever Data", description, path: "/methodology" });

const link = "text-accent hover:underline underline-offset-4";

export default function MethodologyPage() {
  return (
    <Container width="reading">
      <PageHeader
        title="How we count"
        lede="Every fact on Everloot comes from players running the Everloot addon and choosing to upload what it recorded."
        trail={[{ name: "Home", path: "/" }, { name: "How we count", path: "/methodology" }]}
      />
      <div className="space-y-12">
        <p className="text-fg-2">
          This page says how those uploads become the numbers you see, and what we never publish. The full rules are in the{" "}
          <a href={`${REPO_URL}/blob/main/docs/DATA_POLICY.md`} rel="noopener" className={link}>data policy</a>.
        </p>

        <section aria-labelledby="three">
          <SectionHeading id="three">Three installs have to agree</SectionHeading>
          <div className="space-y-4">
            <p className="text-fg-2">
              A drop, a vendor item, a spawn point, a recipe range or a market price appears only once at least three different installs
              have reported it the same way. For prices and catalog entries, &ldquo;different&rdquo; means different upload addresses,
              with an IPv6 address counted by its /64 block, so one household can&apos;t make a fact true on its own. Until three agree,
              the page says so instead of guessing.
            </p>
          </div>
        </section>

        <section aria-labelledby="zero">
          <SectionHeading id="zero">Unrecorded is not zero</SectionHeading>
          <div className="space-y-4">
            <p className="text-fg-2">
              If nobody has recorded something, the page says <em>unrecorded</em>. A zero appears only when it was measured: for example,
              &ldquo;0 drops in 40 kills&rdquo; once three installs killed that creature and none of them saw the item. A storage outage
              or a missing source is never shown as zero either.
            </p>
            <p className="text-fg-2">
              Loot windows show what dropped, not how many kills it took, so they don&apos;t make a drop rate on their own. A rate is
              drops divided by recorded kills.
            </p>
          </div>
        </section>

        <section aria-labelledby="never">
          <SectionHeading id="never">What we never publish</SectionHeading>
          <div className="space-y-4">
            <ul className="list-disc pl-6 space-y-1 text-fg-2">
              <li>Character names, unless that player shares them on purpose from the <Link href="/upload" className={link}>upload page</Link>. Guild data needs an officer&apos;s upload.</li>
              <li>Your install id, or the address an upload came from. Where an address matters for counting, we keep a keyed hash in private storage.</li>
              <li>Your list of addons, row by row. It is off unless you turn it on, and only counts that three installs share are shown.</li>
            </ul>
            <p className="text-fg-2">
              Uploaded observations are public as anonymous records, so anyone can check our counts.
            </p>
          </div>
        </section>

        <section aria-labelledby="files">
          <SectionHeading id="files">Game files and play are kept apart</SectionHeading>
          <div className="space-y-4">
            <p className="text-fg-2">
              Some pages, such as the <Link href="/tools/talents" className={link}>talent calculator</Link> and the{" "}
              <Link href="/map" className={link}>map</Link>, use data read from the game&apos;s own files. It is labelled as found in the game
              files and unconfirmed until players see it in play.
            </p>
          </div>
        </section>

        <section aria-labelledby="population">
          <SectionHeading id="population">Population numbers</SectionHeading>
          <div className="space-y-4">
            <p className="text-fg-2">
              The <Link href="/census" className={link}>census</Link> counts characters from players who turn it on in the addon with{" "}
              <code className="font-mono text-fg">/everloot census on</code>: their own characters, and the players they target, mouse over
              or group with. For other players the addon reads only race, class, level and faction. Never a name.
            </p>
            <p className="text-fg-2">
              Each character is counted once. The game&apos;s id for a character never reaches storage: before an upload is stored, the id is
              replaced with a keyed code that can&apos;t be turned back into it. The census keeps the latest report of each character, from
              any install, so a player seen by fifty uploaders who also uploads their own characters counts once, at the latest level seen.
            </p>
            <ul className="list-disc pl-6 space-y-1 text-fg-2">
              <li>Two windows: active in the last 7 days (the last seven UTC days, today included), and seen since launch. Reports from
                before launch, in the beta, are not counted.</li>
              <li>A count shows only when it covers at least 10 characters reported by at least 3 installs from at least 3 different
                addresses (each address is kept only as a keyed hash, so it can be counted but not read back). Below that it reads
                &ldquo;not enough reports&rdquo;, and until a whole window gets there the page says it is still collecting. Before launch it says so.</li>
              <li>A hidden count could otherwise be worked out by taking the shown counts away from their total. So wherever one is
                hidden, more are hidden with it: in every total, at least two counts are hidden and together they cover at least
                10 characters. &ldquo;Not enough reports&rdquo; therefore means fewer than 10 characters, fewer than 3 installs or fewer than 3 addresses, or hidden to
                protect a small count.</li>
              <li>Every count that shows is rounded to the nearest 5, each from its own true number, so the shown counts don&apos;t
                add up exactly to their total either.</li>
              <li>Together these make a small count hard to work out from the published ones. They narrow what can be learned; they
                are not a guarantee. Someone who can send forged uploads could still probe a count by adding rows one at a time,
                which the limits on how much one install can send slow down but don&apos;t stop.</li>
              <li>Levels are grouped 1&ndash;9, 10&ndash;19 and so on up to 50&ndash;59, and at 60.</li>
              <li>One view for all of WoW: Forever for now. Realms are split by ruleset and region once launch shows how Forever names them.</li>
            </ul>
            <p className="text-fg-2">
              Both sources lean. Own characters over-represent people who install addons; players seen over-represent the zones uploaders
              play in. The census page shows what share came from each, so you can judge.
            </p>
          </div>
        </section>
      </div>
    </Container>
  );
}
