"use client";

import { cloneElement, isValidElement, useEffect, useId, useState, type ReactElement } from "react";
import type { SpellTip as Tip } from "@/lib/game-assets";
import TalentTooltip from "@/components/talents/TalentTooltip";
import GameIcon from "./GameIcon";

// A spell's name with its icon in front and the game's tooltip on hover and keyboard focus (Escape
// closes it), drawn by the talent calculator's tooltip, like ItemTip for items. The child keeps its own
// text and must be focusable (a link, or an element with tabIndex). The tooltip text is also its
// description, so a screen reader gets it without hovering. Without a tip the child is returned as it was.

export default function SpellTip({ tip, size = 16, children }: { tip: Tip | null | undefined; size?: number; children: ReactElement }) {
  return tip ? <Tipped tip={tip} size={size}>{children}</Tipped> : children;
}

function Tipped({ tip, size, children }: { tip: Tip; size: number; children: ReactElement }) {
  const id = useId();
  const anchorId = `spell${id}`;
  const descId = `${anchorId}-desc`;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  const named = isValidElement<{ "aria-describedby"?: string }>(children) ? cloneElement(children, { "aria-describedby": descId }) : children;
  return (
    <span
      id={anchorId}
      className="inline-flex items-center gap-1.5 align-middle"
      data-spell-tip
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {tip.icon && <GameIcon src={tip.icon} size={size} />}
      {named}
      <span id={descId} hidden>{`${[tip.name, tip.text ?? "No description in the game files", tip.label].map((s) => s.replace(/\.$/, "")).join(". ")}.`}</span>
      {open && (
        <TalentTooltip
          anchorId={anchorId}
          id={`${anchorId}-tip`}
          content={{ title: tip.name, rank: null, text: tip.text, partial: tip.partial, lock: null, label: tip.label }}
        />
      )}
    </span>
  );
}
