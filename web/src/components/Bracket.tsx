import type { ReactNode } from "react";

// A label in square brackets, the way the game prints item links in chat.
// The brackets are decoration, so screen readers hear only the word.
export default function Bracket({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono">
      <span aria-hidden="true" className="text-muted">[</span>
      {children}
      <span aria-hidden="true" className="text-muted">]</span>
    </span>
  );
}
