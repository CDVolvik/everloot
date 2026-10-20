import type { ReactNode } from "react";

export interface TocItem {
  /** The id of the section's heading on the page. */
  id: string;
  label: string;
}

/**
 * A long document at reading width with its contents beside it: a rail that stays in view on a wide
 * screen, a two-column list above the text on a phone. The text column is the reading width (768 px),
 * so the document lines up with every other document page; the rail sits to its right.
 */
export default function TocLayout({ items, children }: { items: TocItem[]; children: ReactNode }) {
  return (
    <div data-toc-layout className="lg:grid lg:grid-cols-[minmax(0,48rem)_13rem] lg:gap-12">
      <nav aria-label="On this page" className="mb-8 rounded-card border border-line bg-panel p-4 text-sm lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1 lg:mb-0 lg:self-start lg:border-0 lg:bg-transparent lg:p-0">
        <p className="font-mono text-xs text-muted">On this page</p>
        <ol className="mt-2 grid grid-cols-2 gap-x-4 lg:grid-cols-1 lg:border-l lg:border-line">
          {items.map((item) => (
            <li key={item.id} className="min-w-0">
              <a href={`#${item.id}`} className="inline-flex min-h-9 items-center text-fg-2 hover:text-accent lg:-ml-px lg:border-l lg:border-transparent lg:pl-3 lg:hover:border-accent">
                {item.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">{children}</div>
    </div>
  );
}
