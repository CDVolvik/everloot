import type { ReactNode } from "react";

export type ContainerWidth = "reading" | "wide" | "data";

const WIDTHS: Record<ContainerWidth, string> = {
  reading: "max-w-reading",
  wide: "max-w-wide",
  data: "max-w-data",
};

/**
 * The page's column. `reading` (768 px) for documents and prose, `wide` (1152 px) for tools and
 * hubs, `data` (1440 px) for the database, search and entity pages. A `data` column also widens the
 * layout's <main> and tightens its padding (globals.css), so tables get the room.
 */
export default function Container({ width = "wide", className = "", children }: { width?: ContainerWidth; className?: string; children: ReactNode }) {
  return <div data-container={width} className={`w-full min-w-0 ${WIDTHS[width]} ${className}`.trim()}>{children}</div>;
}
