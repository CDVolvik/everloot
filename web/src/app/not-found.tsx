import type { Metadata } from "next";
import Link from "next/link";
import Glint from "@/components/glint/Glint";

/** The page already answers 404; the title names it in the tab and history, and robots keeps it out of the index. */
export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <div className="max-w-xl mx-auto text-center py-16 space-y-4">
      {/* Sad Glint: an empty satchel. */}
      <Glint size={144} pose="sad" className="mx-auto block" />
      <p className="font-mono text-xs text-muted">No drop here</p>
      <h1 className="text-4xl font-bold text-fg">Nothing looted on this page.</h1>
      <p className="text-fg-2">
        The URL doesn&apos;t exist — or the data hasn&apos;t been collected yet.
      </p>
      <div className="flex items-center justify-center gap-3 pt-2">
        <Link href="/" className="btn btn-primary">
          Home
        </Link>
        <Link href="/database" className="btn">
          The database
        </Link>
      </div>
    </div>
  );
}
