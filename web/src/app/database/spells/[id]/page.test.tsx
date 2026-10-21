import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));

import SpellPage from "./page";

const render = async (id: string) => renderToStaticMarkup(await SpellPage({ params: Promise.resolve({ id }) }));

test("a spell page says what it is, in short, and names the build it was read from", async () => {
  const page = await render("1234");
  expect(page).toContain("In short");
  expect(page).toContain("Build");
  expect(page).toContain("Copy for AI");
  // The page says where the numbers come from, the way every other database page does.
  expect(page).toContain('href="/database#reading"');
});

test("a spell page is not indexed before it has a name", async () => {
  expect(await render("1234")).toContain("Spell 1234");
});
