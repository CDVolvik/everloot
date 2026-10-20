import type { ReactNode } from "react";
import { DocsSidebar, DocsTabs } from "@/components/docs/DocsNav";

/** Every /docs page: the tab bar, the active tab's sidebar, and the page. */
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div data-docs className="min-w-0">
      <DocsTabs />
      <div className="grid min-w-0 gap-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="min-w-0"><DocsSidebar /></aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
