import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import { Card, Container, EmptyState, PageHeader, SectionHeading } from "@/components/ui";
import { dataAgeLabel } from "@/lib/data-age";
import {
  COLLECTING_LINE, HUB_ROWS, RANKINGS, START_LINE, hubIndexable, itemListJsonLd, loadRankingWeeks, rankingPath, rankingView,
} from "@/lib/rankings";
import { pageMetadata } from "@/lib/seo";
import { STORAGE_UNREACHABLE } from "@/lib/upload-store";
import { HowItCounts, ONE_WEEK_LINE, RankTable, RankingRail, link, weekLabel } from "./parts";

export const dynamic = "force-dynamic";

const DESCRIPTION =
  "WoW Forever rankings by week: the most played classes, races and the faction balance from the Everloot census, with each rank's change against last week.";

export async function generateMetadata(): Promise<Metadata> {
  const { weeks, unreachable } = await loadRankingWeeks();
  const index = !unreachable && hubIndexable(weeks);
  return {
    ...pageMetadata({ title: "WoW Forever Rankings", description: DESCRIPTION, path: "/rankings" }),
    ...(index ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function RankingsHub() {
  const { weeks, unreachable, dataAsOf } = await loadRankingWeeks();
  const views = RANKINGS.map((def) => rankingView(def, weeks));
  const withNumbers = views[0]?.weeksWithNumbers ?? 0;
  return (
    <Container width="data">
      <article>
        <PageHeader
          title="Rankings"
          lede="WoW: Forever week by week, from players who turned the census on."
          meta={!unreachable && <span>{dataAgeLabel(dataAsOf)}</span>}
        />
        <div className="grid gap-4 lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-6">
          <RankingRail />
          <div className="min-w-0 space-y-10">
            {unreachable ? (
              <Card><p className="text-fg-2">{STORAGE_UNREACHABLE}</p></Card>
            ) : weeks.length === 0 ? (
              <EmptyState message={START_LINE} />
            ) : (
              <>
                {withNumbers === 1 && <p className="text-cell text-muted">{ONE_WEEK_LINE}</p>}
                {views.map((view) => (
                  <section key={view.def.slug} aria-labelledby={view.def.slug}>
                    <SectionHeading
                      id={view.def.slug}
                      note={`${view.def.lede} ${weekLabel(view.week!)}.`}
                      action={<Link href={rankingPath(view.def.slug)} className={link}>Full ranking<span className="sr-only">: {view.def.title}</span></Link>}
                    >
                      {view.def.title}
                    </SectionHeading>
                    {view.week!.window.collecting ? (
                      <EmptyState count={view.week!.window.installs} message={COLLECTING_LINE} />
                    ) : (
                      <RankTable
                        rows={view.rows.filter((r) => r.rank !== null).slice(0, HUB_ROWS)}
                        caption={`${view.def.title}: top ${HUB_ROWS}`}
                        showChange={view.previous !== null}
                        asOf={view.week!.to}
                      />
                    )}
                  </section>
                ))}
                {hubIndexable(weeks) && (
                  <JsonLd data={itemListJsonLd("WoW Forever rankings", "/rankings", RANKINGS.map((r) => ({ name: r.title, path: rankingPath(r.slug) })))} />
                )}
              </>
            )}
            <HowItCounts />
          </div>
        </div>
      </article>
    </Container>
  );
}
