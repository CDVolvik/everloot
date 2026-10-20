import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Container, Facts, TooltipFrame } from "@/components/ui";
import { trailFor } from "@/lib/breadcrumbs";
import { achievementHref, loadCatalog, parseSegment } from "@/lib/completion-lists";
import { pageMetadata } from "@/lib/seo";
import { EmptyTab, EntityHeader, EntityTop, Unreachable } from "../../entity";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { id: segment } = await props.params;
  const id = parseSegment(segment);
  const entry = id === null ? undefined : (await loadCatalog())?.achievements.find((a) => a.achievementId === id);
  // Only an entry three players reported is a page; storage down says noindex rather than cache a thin page.
  if (!entry) return { robots: { index: false, follow: true } };
  return {
    ...pageMetadata({ title: `${entry.name} (achievement)`, description: `The ${entry.name} achievement in WoW: Forever: category, points and criteria count, as three players reported it.`, path: achievementHref(entry.achievementId, entry.name) }),
    robots: { index: true, follow: true },
  };
}

export default async function AchievementPage(props: Props) {
  const { id: segment } = await props.params;
  const id = parseSegment(segment);
  if (id === null) notFound();
  const catalog = await loadCatalog();
  const entry = catalog?.achievements.find((a) => a.achievementId === id);
  if (catalog && !entry) notFound();
  if (entry) {
    const canonical = achievementHref(entry.achievementId, entry.name);
    if (`/database/achievements/${segment}` !== canonical) permanentRedirect(canonical);
  }
  const title = entry?.name ?? `Achievement ${id}`;
  const trail = [...trailFor("/database/achievements")!, { name: title, path: `/database/achievements/${segment}` }];

  return (
    <Container width="data">
      <article>
        <EntityHeader trail={trail} title={title} meta={["Achievement", entry ? entry.category : null, <span key="id" className="tabular-nums">ID {id}</span>]} />
        {entry ? (
          <EntityTop
            box={
              <TooltipFrame name={entry.name} label={`${entry.name}, as players reported it`}>
                <p>{entry.category}</p>
                <p>{entry.points} points</p>
              </TooltipFrame>
            }
            facts={
              <Facts
                layout="list"
                label={`${entry.name}: quick facts`}
                items={[
                  { label: "Category", value: entry.category },
                  { label: "Points", value: entry.points, numeric: true },
                  { label: "Criteria", value: entry.criteriaCount, numeric: true },
                  { label: "ID", value: entry.achievementId, numeric: true },
                ]}
              />
            }
          />
        ) : <Unreachable />}
        {entry && <EmptyTab players={false} action={null} message="Everloot lists what three players reported identically. The criteria wording is not published." />}
      </article>
    </Container>
  );
}
