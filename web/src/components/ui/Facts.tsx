import type { ReactNode } from "react";

export interface Fact {
  label: ReactNode;
  value: ReactNode;
  /** Mono, tabular figures: counts, ids, dates, builds. */
  numeric?: boolean;
}

/**
 * A few facts about one thing, label over value, in one card: an addon's installs and dates, a
 * repository's licence and last commit. `rows` puts the label beside its value instead, for longer
 * values (an infobox, a pack's details). `list` is the quick-facts list of a database page: no card,
 * 13 px text on 28 px rows, label left and value right, flowing down two columns on a phone and on a
 * wide screen (one beside the tooltip on a tablet). Not for a dataset
 * that can be empty: that is a DataTable.
 */
export default function Facts({ items, layout = "grid", label }: { items: Fact[]; layout?: "grid" | "rows" | "list"; label?: string }) {
  if (layout === "list") {
    return (
      <dl data-facts="list" aria-label={label} className="columns-2 gap-x-6 text-meta sm:columns-1 lg:columns-2">
        {items.map((item, i) => (
          <div key={i} className="flex min-h-7 min-w-0 break-inside-avoid items-center justify-between gap-3 border-b border-line py-1">
            <dt className="shrink-0 text-muted">{item.label}</dt>
            <dd className={`min-w-0 text-right text-fg [overflow-wrap:anywhere] ${item.numeric ? "tabular-nums" : ""}`}>{item.value}</dd>
          </div>
        ))}
      </dl>
    );
  }
  if (layout === "rows") {
    return (
      <dl data-facts="rows" aria-label={label} className="grid grid-cols-[minmax(0,max-content)_minmax(0,1fr)] gap-x-6 gap-y-2 rounded-card border border-line bg-panel p-6 text-sm">
        {items.map((item, i) => (
          <div key={i} className="contents">
            <dt className="text-muted">{item.label}</dt>
            <dd className={`min-w-0 text-fg [overflow-wrap:anywhere] ${item.numeric ? "font-mono tabular-nums" : ""}`}>{item.value}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <dl data-facts="grid" aria-label={label} className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-card border border-line bg-panel p-6 md:grid-cols-4">
      {items.map((item, i) => (
        <div key={i} className="min-w-0">
          <dt className="font-mono text-xs text-muted">{item.label}</dt>
          <dd className={`mt-1 text-lg text-fg [overflow-wrap:anywhere] ${item.numeric ? "font-mono tabular-nums" : ""}`}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
