import type { Metadata } from "next";
import AdSlot from "@/components/AdSlot";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import {
  CHANGE_FILTERS, GAME_LABEL, TYPE_LABEL, filterTimeline, loadTimeline, parseFilter,
  type ChangeEntry, type ChangeFilter,
} from "@/lib/changes";
import { REPO_URL } from "@/lib/source";
import JsonLd from "@/components/JsonLd";
import { latestBuildLine } from "@/lib/changes-facts";
import { changesJsonLd } from "@/lib/jsonld";
import { trailFor } from "@/lib/breadcrumbs";
import { BANNER_MAP, loadingArt, loadSiteAssets } from "@/lib/game-assets";
import { mentionIndex, siteSpellNames, splitMentions, type MentionIndex } from "@/lib/spell-mentions";
import { BannerArt } from "@/components/game/PageBanner";
import SpellTip from "@/components/game/SpellTip";
import PostEntry, { stamp } from "@/components/PostEntry";
import { Card, Container, Entry, EntryList, Explainer, LinkTabs, PageHeader } from "@/components/ui";

export const metadata: Metadata = {
  ...pageMetadata({ title: "WoW Forever Patch Notes and Blizzard Posts", description: "New WoW: Forever builds, hotfixes and Blizzard blue posts, newest first. Each links to Blizzard's original; builds are dated when Everloot first saw them.", path: "/changes", image: "/changes/opengraph-image" }),
};

const TITLE = "WoW Forever Patch Notes and Blizzard Posts";
const LEAD = "Official posts from Blizzard staff and new game builds, newest first.";

const link = "text-accent hover:underline underline-offset-4";
const PAGE_SIZE = 60;

// The filters are link tabs. A blue tracker of staff forum posts joins them as one more tab (or a sibling
// route such as /changes/blue-tracker with the same tabs), its items drawn by PostEntry like the posts here.
const FILTER_LABEL: Record<ChangeFilter, string> ={ all: "Everything", posts: "Blue posts", hotfixes: "Hotfixes", builds: "Builds" };

const href = (show: ChangeFilter, both: boolean) => {
  const query = [show !== "all" ? `show=${show}` : "", both ? "game=all" : ""].filter(Boolean).join("&");
  return query ? `/changes?${query}` : "/changes";
};

const ORIGIN_LABEL: Record<string, string> = { forum: "Blizzard's forum", bluesky: "Bluesky" };

/** Text with the spells it names given their icon and tooltip, linked to the page that shows them. Without the art, the text as it was. */
function WithSpells({ text, index }: { text: string; index: MentionIndex }) {
  return (
    <>
      {splitMentions(text, index).map((p, i) => (typeof p === "string" ? p : (
        <SpellTip key={i} tip={p.mention.tip}>
          <Link href={p.mention.href} className={link}>{p.text}</Link>
        </SpellTip>
      )))}
    </>
  );
}

/** One post or build: the same list item for every kind, in one list. */
function ChangeItem({ entry, index }: { entry: ChangeEntry; index: MentionIndex }) {
  const meta = <>{TYPE_LABEL[entry.type]} · {GAME_LABEL[entry.game]} · <time dateTime={entry.at}>{stamp(entry.at)}</time></>;
  if (entry.type === "build") {
    return (
      <Entry
        meta={meta}
        title={entry.title}
        actions={entry.diffUrl
          ? <a href={entry.diffUrl} className={`inline-flex items-center min-h-11 ${link}`}>See what changed in this build</a>
          : <span className="text-muted">What changed in this build: not published yet.</span>}
      >
        <p>First seen by Everloot on this date. Blizzard&apos;s own release time is not recorded.</p>
      </Entry>
    );
  }
  return (
    <PostEntry
      kind={<>{TYPE_LABEL[entry.type]} · {GAME_LABEL[entry.game]}</>}
      at={entry.at}
      title={entry.title}
      url={entry.url}
      origin={ORIGIN_LABEL[entry.source ?? ""] ?? "Blizzard"}
      author={entry.author}
      role={entry.role}
      forum={entry.category}
      summary={entry.summary && <WithSpells text={entry.summary} index={index} />}
      excerpt={entry.excerpt && <WithSpells text={entry.excerpt} index={index} />}
    />
  );
}

export default async function ChangesPage({ searchParams }: { searchParams: Promise<{ show?: string; game?: string }> }) {
  const params = await searchParams;
  const show = parseFilter(params.show);
  const both = params.game === "all";
  const all = loadTimeline();
  const entries = filterTimeline(all, show, both ? undefined : "forever");
  const shown = entries.slice(0, PAGE_SIZE);
  // The newest thing we hold, not the time of the last check: a stalled schedule has to look stale.
  const newest = all[0]?.at;
  // A loading screen under the title and the game's icon and tooltip on spells the posts name, only when
  // the asset URL is set and the upload has them.
  const assets = await loadSiteAssets();
  const banner = loadingArt(assets, BANNER_MAP.changes);
  const index = mentionIndex(assets, assets ? await siteSpellNames() : []);
  return (
    <article>
      <JsonLd data={changesJsonLd({ name: TITLE, description: LEAD, path: "/changes", entries: shown })} />
      <PageHeader
        trail={trailFor("/changes")!}
        title={TITLE}
        lede={LEAD}
        meta={
          <>
            <span className="text-fg-2">{latestBuildLine(all)}</span>
            <span className="font-mono text-xs">
              {entries.length} {entries.length === 1 ? "entry" : "entries"} · {newest ? `Newest entry ${stamp(newest)}` : "Nothing recorded yet"}
            </span>
          </>
        }
        actions={<a href="/changes/feed.xml" className="btn">RSS feed</a>}
        banner={banner ? { image: <BannerArt art={banner} eager /> } : undefined}
      />

      <Container width="reading">
        <LinkTabs
          label="Filter changes"
          tabs={CHANGE_FILTERS.map((f) => ({ href: href(f, both), label: FILTER_LABEL[f], current: f === show }))}
          aside={<Link href={href(show, !both)} className={link}>{both ? "Show only WoW: Forever" : "Include WoW Classic"}</Link>}
        />
        <div className="mt-6">
          {shown.length === 0 ? (
            <Card><p className="text-fg-2">Nothing recorded for this filter yet. New entries appear after the next check.</p></Card>
          ) : (
            <EntryList ordered label={both ? "WoW: Forever and WoW Classic, newest first" : "WoW: Forever, newest first"}>
              {shown.map((entry) => <ChangeItem key={entry.id} entry={entry} index={index} />)}
            </EntryList>
          )}
          {entries.length > shown.length && (
            <p className="mt-4 text-sm text-muted">The {shown.length} newest are shown. The RSS feed carries the newest 50.</p>
          )}
        </div>

        <Explainer summary="Where these come from">
          <p>
            Everloot shows the title, who posted it, when, and the first couple of sentences, with a link to the original.
            The full text is Blizzard&apos;s, so it stays on their site.
          </p>
          <p>
            A build&apos;s date is when Everloot first saw it, not when Blizzard shipped it. Sources are checked every
            30 minutes and the site updates after each check that finds something new.
          </p>
          <p>
            Blue posts are read from Blizzard&apos;s public WoW forum and the official World of Warcraft account on Bluesky,
            politely and within their robots rules. How Everloot collects and publishes data is in the{" "}
            <a href={`${REPO_URL}/blob/main/docs/DATA_POLICY.md`} rel="noopener" className="text-accent">data policy</a>.
          </p>
        </Explainer>
        <AdSlot slot="inContent" />
      </Container>
    </article>
  );
}
