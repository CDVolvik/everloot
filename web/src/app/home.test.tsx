import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

import Home from "./page";

const html = renderToStaticMarkup(<Home />);

test("no ticker, aurora, scroll reveal or glow", () => {
  expect(html).not.toMatch(/ticker|aurora|reveal|cta-glow/);
});

test("tool status keeps its meaning: available in green, the rest muted", () => {
  expect(html).toMatch(/text-q-uncommon[^"]*"[^>]*>Available</);
  expect(html).toMatch(/text-muted[^"]*"[^>]*>(Planned|Collecting data)</);
});

test("no emoji or pictographs", () => {
  expect(html).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{25A0}-\u{25FF}]/u);
});
