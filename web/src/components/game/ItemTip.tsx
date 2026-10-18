"use client";

import { cloneElement, isValidElement, useEffect, useId, useState, type ReactElement } from "react";
import type { ItemTip as Tip } from "@/lib/game-assets";
import TalentTooltip from "@/components/talents/TalentTooltip";
import GameIcon from "./GameIcon";

// An item link with the item's icon in front and the game's tooltip on hover and keyboard focus
// (Escape closes it), drawn by the talent calculator's tooltip. The link keeps its own text. The
// tooltip text is also the link's description, so a screen reader gets it without hovering.
// Without a tip (no asset URL, or no record for the item) the link is returned exactly as it was.

export default function ItemTip({ tip, size = 20, children }: { tip: Tip | null | undefined; size?: number; children: ReactElement }) {
  return tip ? <Tipped tip={tip} size={size}>{children}</Tipped> : children;
}

function Tipped({ tip, size, children }: { tip: Tip; size: number; children: ReactElement }) {
  const id = useId();
  const anchorId = `item${id}`;
  const descId = `${anchorId}-desc`;
  const [open, setOpen] = useState(false);
  // Escape closes it however it opened: a tooltip opened by hovering has no focus inside it to catch the key.
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  const link = isValidElement<{ "aria-describedby"?: string }>(children) ? cloneElement(children, { "aria-describedby": descId }) : children;
  return (
    <span
      id={anchorId}
      className="inline-flex items-center gap-1.5 align-middle"
      data-item-tip
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {tip.icon && <GameIcon src={tip.icon} size={size} />}
      {link}
      <span id={descId} hidden>{[`${tip.name}, ${tip.quality}`, ...tip.lines, tip.label].join(". ")}</span>
      {open && (
        <TalentTooltip
          anchorId={anchorId}
          id={`${anchorId}-tip`}
          titleColor={tip.color}
          content={{ title: tip.name, rank: null, text: tip.lines.join("\n") || null, partial: tip.partial, lock: null, label: tip.label }}
        />
      )}
    </span>
  );
}
