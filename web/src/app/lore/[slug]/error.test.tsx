import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { UNAVAILABLE_COPY } from "@/lib/lore";
import LoreUnavailable from "./error";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

test("the error boundary shows the unavailable copy with a retry and a way back", () => {
  const html = renderToStaticMarkup(<LoreUnavailable error={new Error("x")} reset={() => {}} />);
  expect(html).toContain("Lore archive unavailable");
  expect(html).toContain(UNAVAILABLE_COPY);
  expect(html).toContain("Try again");
  expect(html).toContain('href="/lore"');
});
