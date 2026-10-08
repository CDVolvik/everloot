"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { tools, toolHref } from "@/data/tools";
import AccountControls from "./AccountControls";

export default function Header() {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  return (
    <header className="border-b border-parchment-100/10 bg-parchment-950 sticky top-0 z-40" onKeyDown={(event) => {
      if (event.key === "Escape" && open) { setOpen(false); toggle.current?.focus(); }
    }}>
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-3">
        <Link href="/" className="font-display text-xl font-bold text-gold-400 hover:text-gold-300 transition shrink-0" onClick={() => setOpen(false)}>
          Everloot<span className="text-parchment-100">.app</span>
        </Link>
        <nav aria-label="Primary" className="hidden sm:flex items-center gap-4 text-sm">
          <Link href="/database" className="inline-flex items-center min-h-11 text-parchment-100/80 hover:text-gold-400">Database</Link>
          <Link href="/upload" className="inline-flex items-center min-h-11 text-parchment-100/80 hover:text-gold-400">Upload</Link>
          <Link href="/tools/gold-per-hour" className="inline-flex items-center min-h-11 text-parchment-100/80 hover:text-gold-400">Gold/Hour</Link>
        </nav>
        <div className="flex items-center gap-1 shrink-0">
          <AccountControls />
          <button ref={toggle} type="button" aria-label={open ? "Close menu" : "Menu"} aria-expanded={open} aria-controls="site-navigation" onClick={() => setOpen(!open)} className="min-h-11 px-3 rounded-lg border border-parchment-100/20 text-sm text-parchment-100 hover:border-gold-400/60">
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </div>
      {open && (
        <nav id="site-navigation" aria-label="All tools" className="absolute top-full inset-x-0 border-b border-parchment-100/20 bg-parchment-950 shadow-xl max-h-[70vh] overflow-y-auto">
          <div className="mx-auto max-w-6xl px-4 py-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {tools.map((tool) => (
              <Link key={tool.slug} href={toolHref(tool)} onClick={() => setOpen(false)} className="min-h-11 px-3 py-3 rounded-lg text-sm text-parchment-100/80 hover:bg-parchment-900 hover:text-gold-400">
                {tool.shortTitle}
                <span className="ml-2 text-xs text-parchment-100/60">{tool.status === "coming-soon" ? "Planned" : tool.status === "collecting" ? "Collecting data" : "Available"}</span>
              </Link>
            ))}
            <Link href="/about" onClick={() => setOpen(false)} className="min-h-11 px-3 py-3 rounded-lg text-sm text-parchment-100/80 hover:text-gold-400">About</Link>
          </div>
        </nav>
      )}
    </header>
  );
}
