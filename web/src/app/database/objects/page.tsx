import type { Metadata } from "next";
import Link from "next/link";
import { objectList } from "../../../../../kb/src/object-page";
import IdLookup from "@/components/IdLookup";
import { Container, DataTable, EmptyState, PageHeader, SourceLine } from "@/components/ui";
import type { Crumb } from "@/lib/jsonld";
import { loadObjectFacts } from "@/lib/objects";
import { pageMetadata } from "@/lib/seo";
import { LINK, Unreachable } from "../entity";

export const metadata: Metadata = pageMetadata({
  title: "WoW Forever objects: chests, herbs and ore",
  description: "Chests, herbs, ore veins and fishing pools players looted in WoW: Forever, with what came out of them. A frequency is public after 3 install reports.",
  path: "/database/objects",
});
export const dynamic = "force-dynamic";

const TRAIL: Crumb[] = [{ name: "Home", path: "/" }, { name: "Database", path: "/database" }, { name: "Objects", path: "/database/objects" }];

export default async function ObjectsPage() {
  const facts = await loadObjectFacts();
  const objects = objectList(facts);
  return (
    <Container width="wide">
      <article>
        <PageHeader
          trail={TRAIL}
          title="Objects"
          lede="Chests, herbs, ore veins and fishing pools, by the id in their GUID, with what players looted from them."
          actions={<IdLookup kind="objects" label="Object id" />}
        />
        <DataTable
          caption="Objects with public loot observations"
          columns={[
            { key: "object", header: "Object", cell: (o) => <Link href={`/database/objects/${o.objectId}`} className={LINK}>Object {o.objectId}</Link> },
            { key: "windows", header: "Loot windows", numeric: true, cell: (o) => o.windows },
            { key: "items", header: "Items seen", numeric: true, cell: (o) => o.items },
            { key: "installs", header: "Install IDs", numeric: true, cell: (o) => o.reporters },
          ]}
          rows={facts.unreachable ? [] : objects}
          rowKey={(o) => String(o.objectId)}
          empty={facts.unreachable ? <Unreachable /> : <EmptyState framed={false} message="No object has public loot observations yet. Each needs loot windows from 3 installs." />}
        />
        <SourceLine confirmed>Distinct install IDs do not prove independent players.</SourceLine>
      </article>
    </Container>
  );
}
