"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import { trailFor } from "@/lib/breadcrumbs";
import { breadcrumbJsonLd } from "@/lib/jsonld";

/** The visible trail and its BreadcrumbList, built from one list so they always agree. */
export default function Breadcrumbs() {
  const trail = trailFor(usePathname() ?? "/");
  if (!trail) return null;
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(trail)} />
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {trail.map((crumb, i) => {
            const last = i === trail.length - 1;
            return (
              <li key={crumb.path} className="flex items-center gap-2">
                {last ? <span aria-current="page" className="text-fg-2">{crumb.name}</span> : <Link href={crumb.path} className="hover:text-accent hover:underline underline-offset-4">{crumb.name}</Link>}
                {!last && <span aria-hidden="true">/</span>}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
