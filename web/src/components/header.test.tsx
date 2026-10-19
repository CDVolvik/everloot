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

const html = renderToStaticMarkup(<Header />);

test("the primary navigation keeps its order", () => {
  const order = ["/database", "/chat", "/lore", "/upload", "/tools/gold-per-hour", "/addons", "/connect"].map((href) => html.indexOf(`href="${href}"`));
  expect(order.every((at) => at >= 0)).toBe(true);
  expect(order).toEqual([...order].sort((a, b) => a - b));
});

test("the map link sits between Lore and Changes", () => {
  const at = ["/lore", "/map", "/changes"].map((href) => html.indexOf(`href="${href}"`));
  expect(at.every((i) => i >= 0)).toBe(true);
  expect(at).toEqual([...at].sort((a, b) => a - b));
});

test.each(["Database", "Chat", "Lore", "Map", "Upload", "Gold/Hour", "Addons", "Connect"])("%s is a bracket label", (label) => {
  const escaped = label.replace("/", "\\/");
  expect(html).toMatch(new RegExp(`href="[^"]+"[^>]*><span class="font-mono"><span aria-hidden="true" class="text-muted">\\[<\\/span>${escaped}<`));
});

test("the database link is a bracket label", () => {
  expect(html).toMatch(/href="\/database"[^>]*><span class="font-mono"><span aria-hidden="true" class="text-muted">\[<\/span>Database/);
});

test("the wordmark is the diamond and a lowercase everloot", () => {
  const home = html.match(/<a href="\/"[^>]*>(.*?)<\/a>/)?.[1] ?? "";
  expect(home).toContain("<svg aria-hidden=\"true\"");
  expect(home).toContain("everloot");
});

test("no shadows", () => {
  expect(html).not.toContain("shadow-");
});
