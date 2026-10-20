import Link from "next/link";

/** Previous, the page number, Next: for a list the server pages (`?page=2`). Links only where there is a page. */
export default function Pager({ label, page, prevHref, nextHref }: { label: string; page: number; prevHref?: string | null; nextHref?: string | null }) {
  const step = "inline-flex min-h-11 items-center text-accent hover:underline underline-offset-4";
  return (
    <nav aria-label={label} className="mt-4 flex items-center gap-4 text-sm">
      {prevHref && <Link href={prevHref} className={step}>Previous</Link>}
      <span className="font-mono tabular-nums text-muted">Page {page}</span>
      {nextHref && <Link href={nextHref} className={step}>Next</Link>}
    </nav>
  );
}
