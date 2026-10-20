import Link from "next/link";
import type { ReactNode } from "react";

export interface LinkTab {
  href: string;
  label: ReactNode;
  /** The tab the page is showing. */
  current: boolean;
  /** Rows behind the tab, drawn as in Tabs. */
  count?: number;
}

/**
 * Tabs for a filter the server applies: each tab is a link (`?show=builds`), the current one marked
 * `aria-current`. They look like Tabs, which keep their state in the hash instead. Use these when the
 * filter changes the URL a reader shares or a search engine sees. `aside` sits at the right of the row.
 */
export default function LinkTabs({ label, tabs, aside }: { label: string; tabs: LinkTab[]; aside?: ReactNode }) {
  return (
    <div data-link-tabs className="flex min-w-0 flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-line">
      {/* The list scrolls on a narrow screen, never the page. */}
      <nav aria-label={label} className="min-w-0 max-w-full overflow-x-auto">
        <ul className="flex gap-1">
          {tabs.map((tab) => (
            <li key={tab.href} className="shrink-0">
              <Link
                href={tab.href}
                aria-current={tab.current ? "page" : undefined}
                className={`inline-flex min-h-11 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors ${tab.current ? "border-accent text-fg" : "border-transparent text-fg-2 hover:text-fg"}`}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span className={`rounded-control px-1.5 font-mono text-xs tabular-nums ${tab.count === 0 ? "border border-line text-muted" : "bg-canvas text-fg-2"}`}>{tab.count}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {aside && <div className="flex min-h-11 flex-wrap items-center gap-x-4 text-sm text-fg-2">{aside}</div>}
    </div>
  );
}
