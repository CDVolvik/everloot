import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import LoreUnavailable from "./error";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

test("the error boundary shows the unavailable copy with a retry and a way back", () => {
  const html = renderToStaticMarkup(<LoreUnavailable error={new Error("x")} reset={() => {}} />);
  expect(html).toContain("Lore archive unavailable");
  expect(html).toContain("The lore archive couldn&#x27;t load right now. Try again in a few minutes.");
  expect(html).toContain("Try again");
  expect(html).toContain('href="/lore"');
});
