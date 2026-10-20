"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface TabItem {
  /** Also the URL hash that opens this tab: `#dropped-by`. Lowercase letters, digits and dashes. */
  id: string;
  label: ReactNode;
  /** Rows behind the tab. Zero is drawn quieter, not hidden. */
  count?: number;
  panel: ReactNode;
}

/** The tab a hash names, or null when it names none of them. */
export function tabFromHash(hash: string, ids: string[]): string | null {
  const id = decodeURIComponent(hash.replace(/^#/, ""));
  return ids.includes(id) ? id : null;
}

/**
 * Tabs whose state is in the URL hash, so `/database/items/7960#sold-by` opens on that tab and the
 * address can be shared. Arrow keys, Home and End move between tabs (WAI-ARIA tabs pattern, automatic
 * activation). The first tab is open on the server and without JavaScript.
 */
export default function Tabs({ label, tabs, inFrame = false }: { label: string; tabs: TabItem[]; inFrame?: boolean }) {
  const uid = useId();
  const ids = tabs.map((t) => t.id);
  const [selected, setSelected] = useState(ids[0]);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const idsKey = ids.join(" ");

  useEffect(() => {
    const sync = () => {
      const fromHash = tabFromHash(window.location.hash, idsKey.split(" "));
      if (fromHash) setSelected(fromHash);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [idsKey]);

  function choose(id: string, focus = false) {
    setSelected(id);
    // replaceState, not location.hash: no jump to an element and no history entry per click.
    window.history.replaceState(window.history.state, "", `#${id}`);
    if (focus) refs.current[id]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const at = ids.indexOf(selected);
    const to = event.key === "ArrowRight" ? (at + 1) % ids.length
      : event.key === "ArrowLeft" ? (at - 1 + ids.length) % ids.length
      : event.key === "Home" ? 0
      : event.key === "End" ? ids.length - 1
      : -1;
    if (to < 0) return;
    event.preventDefault();
    choose(ids[to], true);
  }

  const tabId = (id: string) => `${uid}-tab-${id}`;
  const panelId = (id: string) => `${uid}-panel-${id}`;

  return (
    <div data-tabs className={inFrame ? "" : "min-w-0"}>
      {/* The hairline sits outside the scrolling list, so a narrow screen scrolls the tabs and not the page. */}
      <div className="border-b border-line">
      <div role="tablist" aria-label={label} className={`flex gap-1 overflow-x-auto ${inFrame ? "px-2" : ""}`}>
        {tabs.map((tab) => {
          const on = tab.id === selected;
          return (
            <button
              key={tab.id}
              ref={(el) => { refs.current[tab.id] = el; }}
              id={tabId(tab.id)}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={panelId(tab.id)}
              tabIndex={on ? 0 : -1}
              onClick={() => choose(tab.id)}
              onKeyDown={onKeyDown}
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors ${on ? "border-accent text-fg" : "border-transparent text-fg-2 hover:text-fg"}`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={`rounded-control px-1.5 font-mono text-xs tabular-nums ${tab.count === 0 ? "border border-line text-muted" : "bg-canvas text-fg-2"}`}>{tab.count}</span>
              )}
            </button>
          );
        })}
      </div>
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} id={panelId(tab.id)} role="tabpanel" aria-labelledby={tabId(tab.id)} tabIndex={0} hidden={tab.id !== selected} data-tab-panel={tab.id}>
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
