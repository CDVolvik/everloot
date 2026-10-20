import type { ReactNode } from "react";
import { QUALITY_LABEL, QUALITY_TEXT, type Quality } from "./quality";

/**
 * The badge set, and only this set:
 * - `files`: dashed, "From game files · unconfirmed" by default. The same dashed edge the SourceLine explains.
 * - `confirmed`: solid accent, for a fact three installs agree on.
 * - `neutral`: a plain fact (a build, a type).
 * - `quality`: an item quality in its own colour.
 */
export type BadgeProps =
  | { tone: "files"; children?: ReactNode }
  | { tone: "confirmed"; children?: ReactNode }
  | { tone: "neutral"; children: ReactNode }
  | { tone: "quality"; quality: Quality; children?: ReactNode };

const BASE = "inline-flex h-6 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 font-mono text-xs";

export default function Badge(props: BadgeProps) {
  switch (props.tone) {
    case "files":
      return <span data-badge="files" className={`${BASE} border-dashed border-edge text-fg-2`}>{props.children ?? "From game files · unconfirmed"}</span>;
    case "confirmed":
      return <span data-badge="confirmed" className={`${BASE} border-accent text-accent`}>{props.children ?? "Confirmed by 3 installs"}</span>;
    case "neutral":
      return <span data-badge="neutral" className={`${BASE} border-line text-fg-2`}>{props.children}</span>;
    case "quality":
      return <span data-badge="quality" className={`${BASE} border-current ${QUALITY_TEXT[props.quality]}`}>{props.children ?? QUALITY_LABEL[props.quality]}</span>;
  }
}
