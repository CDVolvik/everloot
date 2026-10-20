import type { ReactNode } from "react";
import { QUALITY_TEXT, type Quality } from "./quality";

export interface TooltipFrameProps {
  /** The entity's name, first line, in its quality colour for items. */
  name: ReactNode;
  quality?: Quality;
  /** The lines the game shows, one element per line. */
  children?: ReactNode;
  /** Small mono line at the foot: "Build 1.60.1.70450 · unconfirmed". */
  foot?: ReactNode;
  /** Label for the frame as a region, e.g. "Linen Cloth, from the game files". */
  label?: string;
}

/**
 * The game's tooltip frame for an item, NPC, quest or zone shown on a page: dark in every theme, as
 * in the game, with the blue-grey edge and inner line. Colours inside use the dark tokens (the
 * `bg-tooltip` class re-declares them).
 */
export default function TooltipFrame({ name, quality, children, foot, label }: TooltipFrameProps) {
  return (
    <section aria-label={label} data-tooltip-frame className="max-w-sm rounded-control border border-tooltip-border bg-tooltip p-px">
      <div className="rounded-[5px] border border-tooltip-inner px-4 py-3 text-sm leading-snug text-fg">
        <p className={`text-base font-semibold [overflow-wrap:anywhere] ${quality ? QUALITY_TEXT[quality] : "text-fg"}`}>{name}</p>
        {children && <div className="mt-0.5 space-y-0.5 text-fg-2">{children}</div>}
        {foot && <p className="mt-2 font-mono text-xs text-muted">{foot}</p>}
      </div>
    </section>
  );
}
