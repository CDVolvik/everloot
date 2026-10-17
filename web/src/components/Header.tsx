"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { tools, toolHref } from "@/data/tools";
import AccountControls from "./AccountControls";

export default function Header() {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  return (
    <header className="border-b border-line bg-canvas sticky top-0 z-40" onKeyDown={(event) => {
      if (event.key === "Escape" && open) { setOpen(false); toggle.current?.focus(); }
    }}>
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-3">
        <Link href="/" className="text-xl font-bold text-accent hover:text-accent transition shrink-0" onClick={() => setOpen(false)}>
          Everloot<span className="text-fg">.app</span>
        </Link>
        <nav aria-label="Primary" className="hidden sm:flex items-center gap-4 text-sm">
          <Link href="/database" className="inline-flex items-center min-h-11 text-fg-2 hover:text-accent">Database</Link>
          <Link href="/lore" className="inline-flex items-center min-h-11 text-fg-2 hover:text-accent">Lore</Link>
          <Link href="/upload" className="inline-flex items-center min-h-11 text-fg-2 hover:text-accent">Upload</Link>
          <Link href="/tools/gold-per-hour" className="inline-flex items-center min-h-11 text-fg-2 hover:text-accent">Gold/Hour</Link>
          <Link href="/addons" className="inline-flex items-center min-h-11 text-fg-2 hover:text-accent">Addons</Link>
        </nav>
        <div className="flex items-center gap-1 shrink-0">
          <AccountControls />
          <button ref={toggle} type="button" aria-label={open ? "Close menu" : "Menu"} aria-expanded={open} aria-controls="site-navigation" onClick={() => setOpen(!open)} className="min-h-11 px-3 rounded-lg border border-line text-sm text-fg hover:border-accent">
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </div>
      {open && (
        <nav id="site-navigation" aria-label="All tools" className="absolute top-full inset-x-0 border-b border-line bg-canvas shadow-xl max-h-[70vh] overflow-y-auto">
          <div className="mx-auto max-w-6xl px-4 py-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            <Link href="/addons" onClick={() => setOpen(false)} className="min-h-11 px-3 py-3 rounded-lg text-sm text-fg-2 hover:bg-panel hover:text-accent">
              Addons
              <span className="ml-2 text-xs text-muted">Everloot, Polestar and guide packs</span>
            </Link>
            {tools.map((tool) => (
              <Link key={tool.slug} href={toolHref(tool)} onClick={() => setOpen(false)} className="min-h-11 px-3 py-3 rounded-lg text-sm text-fg-2 hover:bg-panel hover:text-accent">
                {tool.shortTitle}
                <span className="ml-2 text-xs text-muted">{tool.status === "coming-soon" ? "Planned" : tool.status === "collecting" ? "Collecting data" : "Available"}</span>
              </Link>
            ))}
            <Link href="/lore" onClick={() => setOpen(false)} className="min-h-11 px-3 py-3 rounded-lg text-sm text-fg-2 hover:text-accent">
              Lore archive
              <span className="ml-2 text-xs text-muted">2023 wiki</span>
            </Link>
            <Link href="/about" onClick={() => setOpen(false)} className="min-h-11 px-3 py-3 rounded-lg text-sm text-fg-2 hover:text-accent">About</Link>
          </div>
        </nav>
      )}
    </header>
  );
}
