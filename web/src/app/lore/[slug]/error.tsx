"use client";

import Link from "next/link";

// Shown when the page throws because the knowledge release could not be opened. A failed render is
// never cached, so this page is served per request until the release opens again.
export default function LoreUnavailable({ reset }: { error: Error; reset: () => void }) {
  return (
    <article className="space-y-4 max-w-4xl">
      <p className="font-mono text-xs text-muted">Lore archive</p>
      <h1 className="text-3xl font-bold text-fg">Lore archive unavailable</h1>
      <p className="text-fg-2">The lore archive couldn&apos;t load right now. Try again in a few minutes.</p>
      <p className="text-sm">
        <button type="button" onClick={reset} className="text-accent hover:underline underline-offset-4">Try again</button>
        {" · "}
        <Link href="/lore" className="text-accent hover:underline underline-offset-4">Lore archive</Link>
      </p>
    </article>
  );
}
