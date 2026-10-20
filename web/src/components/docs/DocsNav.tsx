"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DOCS_TABS, tabFor, type DocsTab } from "@/lib/docs/nav";
import DocsIcon from "./DocsIcon";

/** The docs' tab bar: Overview, Guides, API Reference, MCP, Cookbook. Scrolls sideways on a phone. */
export function DocsTabs() {
  const active = tabFor(usePathname() ?? "/docs").id;
  return (
    <nav aria-label="Docs sections" className="-mx-4 mb-8 overflow-x-auto overflow-y-hidden border-b border-line px-4 [scrollbar-width:none]">
      <ul className="flex min-w-max gap-6">
        {DOCS_TABS.map((tab) => {
          const on = tab.id === active;
          return (
            <li key={tab.id}>
              <Link
                href={tab.href}
                aria-current={on ? "page" : undefined}
                className={`-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 text-sm font-medium transition-colors ${on ? "border-accent text-fg" : "border-transparent text-fg-2 hover:text-fg"}`}
              >
                <DocsIcon name={tab.icon} className={on ? "text-accent" : "text-muted"} />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SidebarLinks({ tab, path, onNavigate }: { tab: DocsTab; path: string; onNavigate?: () => void }) {
  return (
    <div className="space-y-7">
      {tab.groups.map((group) => (
        <div key={group.title}>
          <p className="mb-2 flex items-center gap-2 px-3 text-sm font-semibold text-fg">
            {group.icon && <DocsIcon name={group.icon} className="text-muted" />}
            {group.title}
          </p>
          <ul className="space-y-0.5">
            {group.pages.map((page) => {
              const on = page.href === path;
              return (
                <li key={page.href}>
                  <Link
                    href={page.href}
                    onClick={onNavigate}
                    aria-current={on ? "page" : undefined}
                    className={`flex min-h-9 items-center gap-2 rounded-control px-3 py-1.5 text-sm transition-colors ${on ? "bg-accent/10 font-medium text-accent" : "text-fg-2 hover:bg-panel hover:text-fg"}`}
                  >
                    {page.method && (
                      <span className={`rounded-[4px] px-1 font-mono text-[10px] font-semibold leading-4 ${page.method === "GET" ? "bg-accent/15 text-accent" : "bg-warning/15 text-warning"}`}>{page.method}</span>
                    )}
                    <span className={`min-w-0 [overflow-wrap:anywhere] ${page.method || tab.id === "mcp" && page.href.includes("/tools/") ? "font-mono text-[13px]" : ""}`}>{page.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * The active tab's pages, grouped. A column beside the page from `lg` up; on smaller screens a "Menu"
 * button that opens the same list, closed again by choosing a page or pressing Escape.
 */
export function DocsSidebar() {
  const path = usePathname() ?? "/docs";
  const tab = tabFor(path);
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  return (
    <>
      <div className="lg:hidden">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="docs-menu"
          onClick={() => setOpen(!open)}
          onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
          className="btn mb-6 min-h-10 w-full justify-between px-4 text-sm"
        >
          <span>{tab.label} menu</span>
          <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" className={open ? "rotate-180" : ""}><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
        {open && (
          <nav id="docs-menu" aria-label={`${tab.label} pages`} className="mb-8 rounded-card border border-line bg-panel p-3">
            <SidebarLinks tab={tab} path={path} onNavigate={() => setOpen(false)} />
          </nav>
        )}
      </div>
      <nav aria-label={`${tab.label} pages`} className="sticky top-24 hidden max-h-[calc(100vh-7rem)] overflow-y-auto pb-8 pr-2 lg:block">
        <SidebarLinks tab={tab} path={path} />
      </nav>
    </>
  );
}
