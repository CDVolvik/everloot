"use client";

import type { ReactNode } from "react";
import { track } from "@/lib/analytics/track";

/** A plain download link that also reports an addon_download event (a no-op unless analytics is on). */
export default function TrackedDownload({ href, addon, to, className, children }: { href: string; addon: string; to: "curseforge" | "github"; className?: string; children: ReactNode }) {
  return <a className={className} href={href} onClick={() => track("addon_download", { addon, to })}>{children}</a>;
}
