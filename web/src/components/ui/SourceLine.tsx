import type { ReactNode } from "react";

export interface SourceLineProps {
  /** The game build the values were read from, e.g. "1.60.1.70450". */
  build?: string;
  /** True when players have confirmed what the page shows; then the line drops "unconfirmed". */
  confirmed?: boolean;
  /** The licence of the page's data. */
  licence?: string;
  /** One more short clause, e.g. "lore from Warcraft Wiki, 2023". */
  children?: ReactNode;
}

/**
 * The page's one source line, at the foot of its content: where the values come from, the build and
 * the licence. It also carries the key for the dashed convention: anything drawn with a dashed edge
 * on the page is from the game files and unconfirmed. At most one per page.
 */
export default function SourceLine({ build, confirmed = false, licence = "CC BY-SA 4.0", children }: SourceLineProps) {
  const parts: ReactNode[] = [];
  parts.push(
    confirmed
      ? <span key="from">Confirmed by players</span>
      : (
        <span key="from" className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-3 w-5 shrink-0 rounded-[3px] border border-dashed border-edge" />
          From game files, unconfirmed
        </span>
      ),
  );
  if (build) parts.push(<span key="build">build <span className="font-mono tabular-nums">{build}</span></span>);
  if (children) parts.push(<span key="extra">{children}</span>);
  parts.push(<span key="licence">{licence}</span>);
  return (
    <p data-source-line className="mt-12 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-4 text-sm text-muted">
      {parts.flatMap((part, i) => (i === 0 ? [part] : [<span key={`sep${i}`} aria-hidden="true">·</span>, part]))}
    </p>
  );
}
