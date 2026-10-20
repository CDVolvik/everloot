import Link from "next/link";
import type { ReactNode } from "react";
import { TabCount, tabClass } from "./tab-style";

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
        <ul className="flex">
          {tabs.map((tab) => (
            <li key={tab.href} className="shrink-0">
              <Link
                href={tab.href}
                aria-current={tab.current ? "page" : undefined}
                className={tabClass(tab.current, tab.count === 0)}
              >
                {tab.label}
                {tab.count !== undefined && <TabCount count={tab.count} />}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {aside && <div className="flex min-h-control-sm flex-wrap items-center gap-x-4 text-control text-fg-2 sm:min-h-control">{aside}</div>}
    </div>
  );
}
