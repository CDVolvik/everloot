import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { DESCRIPTION_MAX, DESCRIPTION_MIN } from "@/lib/seo";
import GameVersionPage, { generateMetadata, generateStaticParams } from "./page";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

test("only a version without the snapshot has a notice", async () => {
  expect(generateStaticParams()).toEqual([{ id: "ptr" }]);
  await expect(GameVersionPage(params("beta"))).rejects.toThrow("NOT_FOUND");
  expect(await generateMetadata(params("beta"))).toEqual({});
});

test("the PTR notice says none is running and which version the pages show", async () => {
  const page = text(renderToStaticMarkup(await GameVersionPage(params("ptr"))));
  expect(page).toContain("PTR game data");
  expect(page).toContain("PTR: None running.");
  expect(page).toMatch(/Every page on the site shows Beta, build \d+\.\d+\.\d+\.\d+/);
});

test("the notice's canonical is its own prefix, and it stays out of the index", async () => {
  const m = await generateMetadata(params("ptr"));
  expect(m.alternates?.canonical).toBe("/ptr");
  expect(m.robots).toEqual({ index: false, follow: true });
  const description = String(m.description);
  expect(description.length).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
  expect(description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
});
