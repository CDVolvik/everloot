import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import IdLookup from "@/components/IdLookup";
import { Container, DataTable, EmptyState, PageHeader, SourceLine } from "@/components/ui";
import { trailFor } from "@/lib/breadcrumbs";
import { loadWorldFacts } from "@/lib/rollup-compute";
import { publicNpcs } from "@/lib/world-lists";
import { LINK, Unreachable } from "../entity";

export const metadata: Metadata = {
  ...pageMetadata({ title: "WoW Forever NPC Lookup", description: "Look up a WoW: Forever NPC by id. A name or a map pin becomes public only after three installs agree, and single reports stay queued.", path: "/database/npcs" }),
};
export const dynamic = "force-dynamic";

export default async function NpcLookupPage() {
  const facts = await loadWorldFacts();
  const npcs = facts.unreachable ? [] : publicNpcs(facts);
  return (
    <Container width="wide">
      <article>
        <PageHeader
          trail={trailFor("/database/npcs")!}
          title="NPC lookup"
          lede="Open any NPC by its id. A name or a map pin is public when 3 installs report the same one."
          actions={<IdLookup kind="npcs" label="NPC id" />}
        />
        <DataTable
          caption="NPCs players have named or placed"
          columns={[
            { key: "npc", header: "NPC", cell: (p) => <Link href={`/database/npcs/${p.npcId}`} className={LINK}>{p.name ?? `NPC ${p.npcId}`}</Link> },
            { key: "pins", header: "Map positions", numeric: true, cell: (p) => p.pins.length },
            { key: "id", header: "ID", numeric: true, cell: (p) => p.npcId },
          ]}
          rows={npcs}
          rowKey={(p) => String(p.npcId)}
          empty={facts.unreachable ? <Unreachable /> : <EmptyState framed={false} message="No NPC has an agreed name or position yet. Each shows here once 3 installs report it." />}
        />
        <SourceLine confirmed>One install repeating itself does not count.</SourceLine>
      </article>
    </Container>
  );
}
