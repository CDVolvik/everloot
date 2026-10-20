"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { MOTION } from "@/design/tokens";

type State = "idle" | "copied" | "failed";

export interface CopyButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "onClick" | "type"> {
  /** What goes on the clipboard, or a function that reads it at the click; null copies nothing. */
  text: string | (() => string | null);
  label: string;
  /** Shown after a failed copy. Without it a failure leaves the label as it is. */
  failedLabel?: string;
  /** Before the label: an icon. */
  icon?: ReactNode;
  /** Told whether the copy worked, for a message in the page's status line. */
  onResult?: (ok: boolean) => void;
}

/**
 * A button that copies and then says "Copied" for MOTION.duration.copied. Every label sits in the same grid cell, so
 * the button is as wide as its widest label whichever one shows and never moves under the pointer; the labels
 * cross-fade over 150 ms. A second click restarts the wait instead of being cut short by the first one's timer.
 */
export default function CopyButton({ text, label, failedLabel, icon, onResult, className = "btn", ...button }: CopyButtonProps) {
  const [state, setState] = useState<State>("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    const value = typeof text === "function" ? text() : text;
    if (value === null) return;
    let ok = true;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      ok = false;
    }
    onResult?.(ok);
    window.clearTimeout(timer.current);
    if (!ok && !failedLabel) return setState("idle");
    setState(ok ? "copied" : "failed");
    timer.current = window.setTimeout(() => setState("idle"), MOTION.duration.copied);
  };

  const labels: [State, string][] = [["idle", label], ["copied", "Copied"]];
  if (failedLabel) labels.push(["failed", failedLabel]);
  return (
    <button type="button" {...button} className={className} onClick={() => void copy()}>
      {icon}
      <span data-copy-labels className="inline-grid">
        {labels.map(([s, words]) => (
          <span
            key={s}
            aria-hidden={s === state ? undefined : true}
            className={`[grid-area:1/1] transition-opacity duration-fade ease-out ${s === state ? "opacity-100" : "opacity-0"}`}
          >
            {words}
          </span>
        ))}
      </span>
    </button>
  );
}
