import Link from "next/link";
import type { ReactNode } from "react";

export type SortDirection = "asc" | "desc";

export interface Column<Row> {
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  /** Numbers, counts and ids: right-aligned, mono, tabular figures. */
  numeric?: boolean;
  /** The column can be sorted; its header becomes a link when the table has `sortHref`. */
  sortable?: boolean;
  /** Keep the cell on one line (names may still wrap when this is off). */
  nowrap?: boolean;
}

export interface DataTableProps<Row> {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** What the table lists, for screen readers and the scroll region's name. */
  caption: string;
  /** The column the rows are sorted by, as the page sorted them. */
  sort?: { key: string; direction: SortDirection };
  /** Where a sortable header points: usually the same page with ?sort= and ?dir=. */
  sortHref?: (key: string, direction: SortDirection) => string;
  /** Shown under the headers when there are no rows: an EmptyState with `framed={false}`. */
  empty?: ReactNode;
  /** Under the rows: "8 of 19 recipes · Show all". */
  footer?: ReactNode;
  /** Tabs or filters above the headers, inside the frame. */
  toolbar?: ReactNode;
}

const ariaSort = (direction: SortDirection) => (direction === "asc" ? "ascending" : "descending");

/**
 * The one table: dense rows in a card frame. A wide table scrolls inside its frame, never the page.
 * Names go in their quality colour through QUALITY_TEXT. Rendered on the server; sorting is a link.
 */
export default function DataTable<Row>({ columns, rows, rowKey, caption, sort, sortHref, empty, footer, toolbar }: DataTableProps<Row>) {
  return (
    <div data-table className="min-w-0 overflow-hidden rounded-card border border-line bg-panel">
      {toolbar && <div className="border-b border-line">{toolbar}</div>}
      {/* Focusable so a keyboard can scroll it sideways; named by the caption. Positioned, so a cell's
          absolutely placed sr-only text is clipped with the rest instead of widening the page. */}
      <div role="region" aria-label={caption} tabIndex={0} className="relative max-w-full overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((col) => {
                const sorted = sort?.key === col.key ? sort.direction : undefined;
                const next: SortDirection = sorted === "desc" ? "asc" : "desc";
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={sorted ? ariaSort(sorted) : undefined}
                    className={`h-9 whitespace-nowrap border-b border-line bg-canvas px-4 font-mono text-xs font-medium ${sorted ? "text-fg" : "text-muted"} ${col.numeric ? "text-right" : "text-left"}`}
                  >
                    {col.sortable && sortHref ? (
                      <Link href={sortHref(col.key, next)} className="inline-flex min-h-6 items-center gap-1 hover:text-fg">
                        {col.header}
                        {sorted && <span aria-hidden="true" className="text-accent">{sorted === "desc" ? "↓" : "↑"}</span>}
                      </Link>
                    ) : (
                      <>
                        {col.header}
                        {sorted && <span aria-hidden="true" className="ml-1 text-accent">{sorted === "desc" ? "↓" : "↑"}</span>}
                      </>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && empty ? (
              <tr><td colSpan={columns.length} className="p-0">{empty}</td></tr>
            ) : rows.map((row) => (
              <tr key={rowKey(row)} className="border-t border-line first:border-t-0 hover:bg-canvas/40">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`h-11 px-4 py-2 align-middle text-fg ${col.numeric ? "text-right font-mono tabular-nums" : "text-left"} ${col.nowrap || col.numeric ? "whitespace-nowrap" : ""}`}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-sm text-muted">{footer}</div>}
    </div>
  );
}
