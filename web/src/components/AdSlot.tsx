"use client";

import { useEffect } from "react";

/** Display ad units in the Everloot AdSense account (pub-7465007562895301), all responsive. */
export const AD_SLOTS = {
  /** Below the facts on database pages, the patch notes and the home page. */
  inContent: "6833061644",
  /** Reserved for a desktop sidebar; no page has one yet. */
  sidebar: "7165243291",
  /** Directly below a tool (talents, raid planner, gold calculator, professions). */
  belowTool: "9300452042",
} as const;

declare global {
  interface Window { adsbygoogle?: unknown[] }
}

/**
 * One AdSense unit, labelled as an advertisement, with space reserved so the page doesn't jump when
 * it fills. Renders nothing unless NEXT_PUBLIC_ADSENSE_CLIENT is set, so previews, tests and local
 * builds show no ads. Pages decide where a slot may go: never on a page without real content.
 */
export default function AdSlot({ slot, client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT }: { slot: keyof typeof AD_SLOTS; client?: string }) {
  useEffect(() => {
    if (!client) return;
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { /* a slot that's already filled */ }
  }, [client]);
  if (!client) return null;
  return (
    <aside aria-label="Advertisement" className="not-prose my-8">
      <p className="mb-1 text-[11px] font-mono text-muted">Advertisement</p>
      <ins
        className="adsbygoogle"
        style={{ display: "block", minHeight: 250 }}
        data-ad-client={client}
        data-ad-slot={AD_SLOTS[slot]}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
