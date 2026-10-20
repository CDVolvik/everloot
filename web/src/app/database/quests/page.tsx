import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import IdLookup from "@/components/IdLookup";
import { Container, DataTable, EmptyState, PageHeader, SourceLine } from "@/components/ui";
import { trailFor } from "@/lib/breadcrumbs";
import { loadWorldFacts } from "@/lib/rollup-compute";
import { publicQuests } from "@/lib/world-lists";
import { LINK, Unreachable } from "../entity";

export const metadata: Metadata = {
  ...pageMetadata({ title: "WoW Forever Quest Lookup", description: "Look up a WoW: Forever quest by id. Title, level, giver, turn-in and rewards become public after three installs agree on them.", path: "/database/quests" }),
};
export const dynamic = "force-dynamic";

export default async function QuestLookupPage() {
  const facts = await loadWorldFacts();
  const quests = facts.unreachable ? [] : publicQuests(facts);
  return (
    <Container width="wide">
      <article>
        <PageHeader
          trail={trailFor("/database/quests")!}
          title="Quest lookup"
          lede="Open any quest by its id. A title, level, giver, turn-in or reward is public when 3 installs agree."
          actions={<IdLookup kind="quests" label="Quest id" />}
        />
        <DataTable
          caption="Quests with agreed facts"
          columns={[
            { key: "quest", header: "Quest", cell: (q) => <Link href={`/database/quests/${q.questId}`} className={LINK}>{q.title ?? `Quest ${q.questId}`}</Link> },
            { key: "level", header: "Level", numeric: true, cell: (q) => q.level ?? "" },
            { key: "rewards", header: "Rewards", numeric: true, cell: (q) => q.rewards.length },
            { key: "id", header: "ID", numeric: true, cell: (q) => q.questId },
          ]}
          rows={quests}
          rowKey={(q) => String(q.questId)}
          empty={facts.unreachable ? <Unreachable /> : <EmptyState framed={false} message="No quest has agreed facts yet. Each shows here once 3 installs report it." />}
        />
        <SourceLine confirmed>The addon does not guess a level.</SourceLine>
      </article>
    </Container>
  );
}
