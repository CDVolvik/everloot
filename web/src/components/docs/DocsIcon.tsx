import type { DocsIcon as Name } from "@/lib/docs/nav";

// 24-unit line icons for the docs' tabs and sidebar groups, drawn for Everloot. Stroke follows the text colour.
const PATHS: Record<Name, string> = {
  home: "M4 11 12 4l8 7M6 9.5V20h12V9.5",
  rocket: "M12 15c5-3 7-7 7-11-4 0-8 2-11 7l4 4ZM9 12l-4 1-1 3 4-1M12 15l-1 4-3 1 1-4M14.5 7.5h.01",
  book: "M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4ZM5 17a3 3 0 0 1 3-3h9",
  code: "m9 8-4 4 4 4M15 8l4 4-4 4",
  plug: "M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0V8ZM12 16v5",
  chef: "M7 13a4 4 0 1 1 1.5-7.7A4 4 0 0 1 15.5 5.3 4 4 0 1 1 17 13v6H7v-6ZM7 16h10",
  compass: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM15.5 8.5l-2 5-5 2 2-5 5-2Z",
  shield: "M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z",
  scale: "M12 4v16M7 20h10M5 8h14M5 8l-2.5 6a3 3 0 0 0 5 0L5 8ZM19 8l-2.5 6a3 3 0 0 0 5 0L19 8Z",
  help: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01",
  box: "M4 8l8-4 8 4v8l-8 4-8-4V8ZM4 8l8 4 8-4M12 12v8",
  upload: "M12 15V4M7 9l5-5 5 5M5 15v4h14v-4",
  monitor: "M4 5h16v11H4zM9 20h6M12 16v4",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4",
  user: "M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM5 20a7 7 0 0 1 14 0",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
  list: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  database: "M12 4c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3ZM4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  file: "M6 3h8l4 4v14H6V3ZM14 3v4h4M9 12h6M9 16h6",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  terminal: "M4 5h16v14H4zM8 10l3 2-3 2M13 15h3",
  chart: "M4 20h16M7 16v-5M12 16V7M17 16v-8",
};

export default function DocsIcon({ name, className = "" }: { name: Name; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`.trim()}>
      <path d={PATHS[name]} />
    </svg>
  );
}
