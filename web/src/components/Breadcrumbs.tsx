"use client";

import { usePathname } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import Crumbs from "@/components/ui/Crumbs";
import { trailFor } from "@/lib/breadcrumbs";
import { breadcrumbJsonLd } from "@/lib/jsonld";

/** The visible trail and its BreadcrumbList, built from one list so they always agree. */
export default function Breadcrumbs() {
  const trail = trailFor(usePathname() ?? "/");
  if (!trail) return null;
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(trail)} />
      <Crumbs trail={trail} owner="layout" className="mb-6" />
    </>
  );
}
