import type { ReactNode } from "react";
import JsonLd from "@/components/JsonLd";
import { trailFor } from "@/lib/breadcrumbs";
import { breadcrumbJsonLd, type Crumb } from "@/lib/jsonld";
import Banner from "./Banner";
import Crumbs from "./Crumbs";
import { QUALITY_TEXT, type Quality } from "./quality";

export interface PageHeaderProps {
  /** The page's one h1. One size on every page. */
  title: ReactNode;
  /** One line under the title: what the page is. Not a paragraph. */
  lede?: ReactNode;
  /** Home first, the page last. Pages listed in lib/breadcrumbs.ts can pass `trailFor(path)`. */
  trail?: Crumb[];
  /** Small facts beside each other under the lede: badges, an id, a date, an agreement meter. */
  meta?: ReactNode;
  /** Buttons or links at the right of the title (below it on a phone). */
  actions?: ReactNode;
  /** A game icon before the title, for entity pages. */
  icon?: ReactNode;
  /** Colours the title as an item of this quality. */
  quality?: Quality;
  /**
   * Section hubs only: a wide-screen picture with the breadcrumb, title and lede on it (see Banner).
   * `image` is the decorative picture, `credit` its caption. Meta and actions follow under the picture.
   * The header must then sit directly in the layout's main, not in a Container.
   */
  banner?: { image: ReactNode; credit?: ReactNode };
}

/**
 * The page-title pattern, the same on every page: breadcrumb, title, one-line lede, then meta and
 * actions. No line above the title: no bracket eyebrow, no "Tool ·" label.
 */
export default function PageHeader({ title, lede, trail, meta, actions, icon, quality, banner }: PageHeaderProps) {
  // The layout already emits the BreadcrumbList for routes lib/breadcrumbs.ts knows; emit it here
  // only for the others (entity pages), so a page never carries two.
  const page = trail?.[trail.length - 1];
  const emitJsonLd = trail && trail.length > 1 && page && !trailFor(page.path);
  if (banner) {
    return (
      <header data-page-header className="mb-8">
        {emitJsonLd && <JsonLd data={breadcrumbJsonLd(trail)} />}
        <Banner image={banner.image} credit={banner.credit}>
          {trail && trail.length > 1 && <Crumbs trail={trail} owner="page" onArt className="mb-4" />}
          <h1 className="text-3xl font-bold tracking-tight text-fg [overflow-wrap:anywhere] sm:text-4xl">{title}</h1>
          {lede && <p className="mt-3 max-w-[65ch] text-lg text-fg-2">{lede}</p>}
        </Banner>
        {(meta || actions) && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-b border-line pb-6">
            {meta && <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">{meta}</div>}
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
        )}
      </header>
    );
  }
  return (
    <header data-page-header className="mb-8 border-b border-line pb-6">
      {emitJsonLd && <JsonLd data={breadcrumbJsonLd(trail)} />}
      {trail && trail.length > 1 && <Crumbs trail={trail} owner="page" className="mb-4" />}
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 flex-1 basis-80">
          <div className="flex items-center gap-4">
            {icon && <span className="shrink-0">{icon}</span>}
            <h1 className={`min-w-0 text-3xl font-bold tracking-tight [overflow-wrap:anywhere] sm:text-4xl ${quality ? QUALITY_TEXT[quality] : "text-fg"}`}>{title}</h1>
          </div>
          {lede && <p className="mt-3 max-w-[65ch] text-lg text-fg-2">{lede}</p>}
          {meta && <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
