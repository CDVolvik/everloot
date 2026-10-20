import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { objectPage, type ObjectDrop } from "../../../../../../kb/src/object-page";
import { formatMeasuredZero } from "../../../../../../kb/src/item-page";
import { loadObjectFacts } from "@/lib/objects";
import { pageMetadata } from "@/lib/seo";
import { Container, DataTable, EmptyState, PageHeader, SourceLine, Tabs, TooltipFrame, type Column } from "@/components/ui";
import type { Crumb } from "@/lib/jsonld";
import { EntityLayout, FactsCard, LINK, percent, Unreachable } from "../../entity";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const params = await props.params;
  if (!/^[1-9]\d*$/.test(params.id)) return { robots: { index: false, follow: true } };
  const facts = await loadObjectFacts();
  const page = objectPage(Number(params.id), facts);
  return {
    ...pageMetadata({ title: `Object ${params.id}`, description: "A WoW: Forever object (chest, herb, ore vein or fishing pool) and what players looted from it.", path: `/database/objects/${params.id}` }),
    robots: { index: !facts.unreachable && Boolean(page.drops.length || page.zero), follow: true },
  };
}

const columns: Column<ObjectDrop>[] = [
  { key: "item", header: "Item", cell: (d) => <Link href={`/database/items/${d.itemId}`} className={LINK}>{d.itemName ?? `Item ${d.itemId}`}</Link> },
  { key: "windows", header: "Loot windows", numeric: true, cell: (d) => d.kills },
  { key: "drops", header: "Drops", numeric: true, cell: (d) => d.drops },
  { key: "rate", header: "Observed frequency", numeric: true, cell: (d) => percent(d.rate) },
  { key: "installs", header: "Install IDs", numeric: true, cell: (d) => d.reporters },
];

export default async function ObjectPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!/^[1-9]\d*$/.test(params.id)) notFound();
  const facts = await loadObjectFacts();
  const page = objectPage(Number(params.id), facts);
  const title = `Object ${page.objectId}`;
  const trail: Crumb[] = [
    { name: "Home", path: "/" },
    { name: "Database", path: "/database" },
    { name: "Objects", path: "/database/objects" },
    { name: title, path: `/database/objects/${page.objectId}` },
  ];
  const windows = page.zero?.kills ?? page.drops[0]?.kills;

  return (
    <Container width="wide">
      <article>
        <PageHeader trail={trail} title={title} lede="A chest, herb, ore vein, fishing pool or other object players looted, known by the id in its GUID." />
        <EntityLayout
          rail={
            <>
              <TooltipFrame name={title} label={`${title}, as players saw it`}>
                <p>Uploads carry no object names yet.</p>
              </TooltipFrame>
              {!facts.unreachable && (
                <FactsCard
                  title="Seen by players"
                  facts={[
                    { label: "Loot windows", value: windows },
                    { label: "Items seen", value: page.zero ? "None" : page.drops.length ? page.drops.length : undefined },
                    { label: "Map position", value: "Not collected" },
                  ]}
                />
              )}
            </>
          }
        >
          <Tabs
            label={`${title}: relations`}
            tabs={[{
              id: "drops", label: "Drops", count: facts.unreachable ? undefined : page.drops.length,
              panel: (
                <DataTable
                  caption={`What players looted from ${title}`}
                  columns={columns}
                  rows={facts.unreachable ? [] : page.drops}
                  rowKey={(d) => String(d.itemId)}
                  empty={facts.unreachable ? <Unreachable />
                    : page.zero ? <p className="px-4 py-8 text-fg sm:px-6">{formatMeasuredZero(page.zero.kills)} · {page.zero.reporters} install IDs.</p>
                    : <EmptyState framed={false} message={page.queued
                      ? "Observed, not yet public: a frequency shows here once 3 installs record loot windows from this object."
                      : "Nobody has looted this object in Forever yet. A frequency shows here once 3 installs record it."} />}
                  footer={page.drops.length > 0 ? <span>Loot windows are observations, not a count of every time the object was opened.</span> : undefined}
                />
              ),
            }]}
          />
        </EntityLayout>
        <SourceLine confirmed>Distinct install IDs do not prove independent players.</SourceLine>
      </article>
    </Container>
  );
}
