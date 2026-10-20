import Link from "next/link";
import type { Crumb } from "@/lib/jsonld";

/**
 * The visible trail: every crumb a link except the last, which is the page itself. One style site-wide.
 * `owner` marks who drew it: when a PageHeader draws one, globals.css hides the layout's copy. `onArt`
 * lifts the links to fg-2 for a trail drawn over banner art, where muted would fall under 4.5:1.
 */
export default function Crumbs({ trail, owner, onArt = false, className = "" }: { trail: Crumb[]; owner: "layout" | "page"; onArt?: boolean; className?: string }) {
  const marker = owner === "layout" ? { "data-layout-crumbs": "" } : { "data-page-crumbs": "" };
  return (
    <nav aria-label="Breadcrumb" className={`text-sm ${onArt ? "text-fg-2" : "text-muted"} ${className}`.trim()} {...marker}>
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
