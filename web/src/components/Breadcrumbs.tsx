"use client";

import { usePathname } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import { trailFor } from "@/lib/breadcrumbs";
import { breadcrumbJsonLd } from "@/lib/jsonld";

/**
 * The BreadcrumbList for the routes lib/breadcrumbs.ts knows. There is no visible trail (density
 * spec, 2026-10-20): the header's active tab and the page title say where you are; search engines
 * still get the trail.
 */
export default function Breadcrumbs() {
  const trail = trailFor(usePathname() ?? "/");
  if (!trail) return null;
  return <JsonLd data={breadcrumbJsonLd(trail)} />;
}
