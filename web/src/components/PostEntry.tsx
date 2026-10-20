import type { ReactNode } from "react";
import { Entry } from "@/components/ui";

const link = "text-accent hover:underline underline-offset-4";

/** UTC to the minute, whatever offset the time was written with. */
export const stamp = (iso: string) => `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;

export interface PostEntryProps {
  title: string;
  /** The original post; without it the entry says the link is unavailable. */
  url?: string | null;
  /** Where the original lives, for the link: "Blizzard's forum", "Bluesky". */
  origin: string;
  /** ISO time of the post. */
  at: string;
  /** The small line above the title before the date: kind and game, e.g. "Blue post · WoW: Forever". */
  kind: ReactNode;
  author?: string | null;
  role?: string | null;
  /** The forum or category it was posted in. */
  forum?: string | null;
  /** Everloot's own one-line summary, when there is one. */
  summary?: ReactNode;
  /** The first sentences of the original, quoted. */
  excerpt?: ReactNode;
}

/**
 * One post by Blizzard staff, linked out to the original: the patch notes' blue posts now, and a blue
 * tracker of forum posts later. Who posted it, where, when, the title, a quoted excerpt and the link.
 * An item in an EntryList.
 */
export default function PostEntry({ title, url, origin, at, kind, author, role, forum, summary, excerpt }: PostEntryProps) {
  const byline = [[author, role].filter(Boolean).join(", "), forum].filter(Boolean).join(" · ");
  return (
    <Entry
      meta={<>{kind} · <time dateTime={at}>{stamp(at)}</time></>}
      title={title}
      actions={url ? (
        <a href={url} rel="noopener" className={`inline-flex items-center min-h-11 font-medium ${link}`}>
          Read the original on {origin}<span className="sr-only">: {title}</span>
        </a>
      ) : (
        <span className="text-muted">The link to the original is unavailable.</span>
      )}
    >
      {byline && <p>{byline}</p>}
      {summary && <p className="text-fg"><span className="font-mono text-xs text-muted">Everloot summary </span>{summary}</p>}
      {excerpt && <p className="border-l-2 border-line pl-3 text-base">{excerpt}</p>}
    </Entry>
  );
}
