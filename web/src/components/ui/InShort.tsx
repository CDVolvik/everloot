import type { ReactNode } from "react";

/**
 * The page's lines in short: what it is, what players observed, what nobody has reported yet, and
 * where the name came from. A list and not cards: the point is that one read is enough, and the
 * page's own sections carry the detail.
 */
export default function InShort({ summary, bullets, note }: { summary: string; bullets: readonly string[]; note?: ReactNode }) {
  if (!bullets.length) return null;
  return (
    <section aria-label={summary} className="mt-6">
      <h2 className="text-cell font-semibold text-fg">{summary}</h2>
      <ul className="mt-2 space-y-1 text-sm text-fg-2">
        {bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      {note ? <p className="mt-2 text-sm text-fg-2">{note}</p> : null}
    </section>
  );
}
