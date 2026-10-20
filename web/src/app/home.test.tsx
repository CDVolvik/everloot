import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

import Home from "./page";

const html = renderToStaticMarkup(await Home());

test("no ticker, aurora, scroll reveal or glow", () => {
  expect(html).not.toMatch(/ticker|aurora|reveal|cta-glow/);
});

test("tool status keeps its meaning: a tool still collecting shows the 0-of-3 meter, a planned one says so, a live one carries no label", () => {
  const list = html.slice(html.indexOf('id="tools-title"'), html.indexOf('id="agree"'));
  const row = (href: string) => list.slice(list.indexOf(`href="${href}"`), list.indexOf("</a>", list.indexOf(`href="${href}"`)));
  expect(row("/tools/guild-board")).toContain('aria-label="0 of 3 installs agree"');
  expect(row("/tools/farming-routes")).toMatch(/text-muted[^"]*"[^>]*>Planned</);
  expect(row("/tools/raid")).not.toMatch(/installs agree|Planned/);
});

test("no emoji or pictographs", () => {
  expect(html).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{25A0}-\u{25FF}]/u);
});
