import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import IdLookup from "@/components/IdLookup";
import { Container, DataTable, EmptyState, PageHeader, SourceLine } from "@/components/ui";
import { trailFor } from "@/lib/breadcrumbs";
import { loadWorldFacts } from "@/lib/rollup-compute";
import { publicVendors } from "@/lib/world-lists";
import { LINK, Unreachable } from "../entity";

export const metadata: Metadata = {
  ...pageMetadata({ title: "WoW Forever Vendor Lookup", description: "Look up a WoW: Forever vendor by id. A price is shown only after three installs agree on the item and the price in copper.", path: "/database/vendors" }),
};
export const dynamic = "force-dynamic";

export default async function VendorLookupPage() {
  const facts = await loadWorldFacts();
  const vendors = facts.unreachable ? [] : publicVendors(facts);
  return (
    <Container width="wide">
      <article>
        <PageHeader
          trail={trailFor("/database/vendors")!}
          title="Vendor lookup"
          lede="Open any vendor by its NPC id. An item is listed when 3 installs agree on it and its copper price."
          actions={<IdLookup kind="vendors" label="Vendor NPC id" />}
        />
        <DataTable
          caption="Vendors with agreed prices"
          columns={[
            { key: "vendor", header: "Vendor", cell: (v) => <Link href={`/database/vendors/${v.vendorNpcId}`} className={LINK}>Vendor NPC {v.vendorNpcId}</Link> },
            { key: "goods", header: "Prices", numeric: true, cell: (v) => v.offers.length },
          ]}
          rows={vendors}
          rowKey={(v) => String(v.vendorNpcId)}
          empty={facts.unreachable ? <Unreachable /> : <EmptyState framed={false} message="No vendor has an agreed price yet. Each shows here once 3 installs agree on an item and its copper." />}
        />
        <SourceLine confirmed>Two agreed prices for one item both stay listed.</SourceLine>
      </article>
    </Container>
  );
}
