import Link from "next/link";
import type { Crumb } from "@/lib/jsonld";

/**
 * The visible trail: every crumb a link except the last, which is the page itself. One style site-wide.
 * `owner` marks who drew it: when a PageHeader draws one, globals.css hides the layout's copy.
 */
export default function Crumbs({ trail, owner, className = "" }: { trail: Crumb[]; owner: "layout" | "page"; className?: string }) {
  const marker = owner === "layout" ? { "data-layout-crumbs": "" } : { "data-page-crumbs": "" };
  return (
    <nav aria-label="Breadcrumb" className={`text-sm text-muted ${className}`.trim()} {...marker}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {trail.map((crumb, i) => {
          const last = i === trail.length - 1;
          return (
            <li key={crumb.path} className="flex min-w-0 items-center gap-2">
              {last
                ? <span aria-current="page" className="text-fg-2 [overflow-wrap:anywhere]">{crumb.name}</span>
                : <Link href={crumb.path} className="hover:text-accent hover:underline underline-offset-4">{crumb.name}</Link>}
              {!last && <span aria-hidden="true">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
