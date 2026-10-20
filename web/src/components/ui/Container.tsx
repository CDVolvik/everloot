import type { ReactNode } from "react";

export type ContainerWidth = "reading" | "wide";

const WIDTHS: Record<ContainerWidth, string> = {
  reading: "max-w-reading",
  wide: "max-w-wide",
};

/**
 * The page's column. `reading` (768 px) for documents and prose, `wide` (1152 px) for data, tables
 * and tools. Both start at the same left edge as the header, so the title never jumps sideways.
 */
export default function Container({ width = "wide", className = "", children }: { width?: ContainerWidth; className?: string; children: ReactNode }) {
  return <div data-container={width} className={`w-full min-w-0 ${WIDTHS[width]} ${className}`.trim()}>{children}</div>;
}
