import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));
vi.mock("./AccountControls", () => ({ default: () => null }));

import Header from "./Header";

test("the primary navigation links to the lore archive", () => {
  const html = renderToStaticMarkup(<Header />);
  expect(html).toContain('href="/lore"');
  expect(html).toMatch(/href="\/database"[^>]*>Database<\/a><a href="\/lore"[^>]*>Lore<\/a>/);
});
