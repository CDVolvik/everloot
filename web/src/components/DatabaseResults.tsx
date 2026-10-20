import Link from "next/link";
import { DataTable, SectionHeading } from "@/components/ui";
import type { DatabaseHit } from "@/lib/database-search";

/**
 * The database matches for a site search query (lib/database-search.ts), as one section the search page
 * places above the lore results. Renders nothing without hits, so a lore-only query looks as it did.
 */
export default function DatabaseResults({ hits }: { hits: DatabaseHit[] }) {
  if (hits.length === 0) return null;
  return (
    <section aria-labelledby="database-results" data-database-results>
      <SectionHeading id="database-results">In the database</SectionHeading>
      <DataTable
        caption="Database matches"
        columns={[
          { key: "name", header: "Name", cell: (h: DatabaseHit) => <Link href={h.href} className="text-accent hover:underline underline-offset-4">{h.name}</Link> },
          { key: "what", header: "What", cell: (h: DatabaseHit) => <span className="text-fg-2">{h.detail}</span> },
          { key: "id", header: "ID", numeric: true, cell: (h: DatabaseHit) => h.id },
        ]}
        rows={hits}
        rowKey={(h) => `${h.kind}-${h.id}`}
      />
    </section>
  );
}
