import type { ReactNode } from "react";
import JsonLd from "@/components/JsonLd";
import { trailFor } from "@/lib/breadcrumbs";
import { breadcrumbJsonLd, type Crumb } from "@/lib/jsonld";

/**
 * The title row of a database list, the hub and search (density spec, 2026-10-20): the h1 at 28 px with one
 * 13 px meta line beside it, 12 px above the filter bar. No visible breadcrumb: the header tab and the title
 * say where the page is. `trail` still gives search engines the BreadcrumbList, for pages the layout does not
 * already cover (lib/breadcrumbs.ts).
 */
export default function DataTitle({ title, meta, trail, aside }: { title: ReactNode; meta?: ReactNode; trail?: Crumb[]; aside?: ReactNode }) {
  const page = trail?.[trail.length - 1];
  const emitJsonLd = trail && trail.length > 1 && page && !trailFor(page.path);
  return (
    <header data-page-header className="mb-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      {emitJsonLd && <JsonLd data={breadcrumbJsonLd(trail)} />}
      <h1 className="min-w-0 text-title-sm text-fg [overflow-wrap:anywhere] sm:text-title">{title}</h1>
      {meta && <p className="text-meta text-muted">{meta}</p>}
      {/* The result strip ("3,845 items · 1–50 · ‹ 1 2 … 77 ›") shares the title's row, so the table starts higher. */}
      {aside && <div className="min-w-0 max-sm:w-full sm:ml-auto">{aside}</div>}
    </header>
  );
}
