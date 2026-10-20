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
 * values (an infobox, a pack's details). Not for a dataset that can be empty: that is a DataTable.
 */
export default function Facts({ items, layout = "grid", label }: { items: Fact[]; layout?: "grid" | "rows"; label?: string }) {
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
