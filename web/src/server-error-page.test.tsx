import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { UNAVAILABLE_COPY } from "@/lib/lore";
import ServerError from "@/pages/500";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

test("the 500 page shows the unavailable copy with a retry and a way back", () => {
  const html = renderToStaticMarkup(<ServerError />);
  expect(html).toContain("Lore archive unavailable");
  expect(html).toContain(UNAVAILABLE_COPY);
  expect(html).toContain("Try again");
  expect(html).toContain('href="/lore"');
});

