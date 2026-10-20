import type { ReactNode } from "react";

export type ContainerWidth = "reading" | "wide" | "data";

const WIDTHS: Record<ContainerWidth, string> = {
  reading: "max-w-reading",
  wide: "max-w-wide",
  data: "max-w-data",
};

/**
 * The page's column. `reading` (768 px) for documents and prose, `wide` (1152 px) for tools and
 * hubs, `data` (1440 px) for the database, search and entity pages. Every one starts at the left edge
 * of <main>, which is the header's own container (globals.css), so pages line up with the logo.
 */
export default function Container({ width = "wide", className = "", children }: { width?: ContainerWidth; className?: string; children: ReactNode }) {
  return <div data-container={width} className={`w-full min-w-0 ${WIDTHS[width]} ${className}`.trim()}>{children}</div>;
}
