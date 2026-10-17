import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const src = fileURLToPath(new URL("..", import.meta.url));
const css = readFileSync(join(src, "app/globals.css"), "utf8");

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  expect(match, selector).not.toBeNull();
  return match![1];
}

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) yield path;
  }
}

test(".btn is an outline pill", () => {
  const btn = rule(".btn");
  expect(btn).toContain("border-radius: 9999px");
  expect(btn).toContain("border: 1px solid rgb(var(--fg))");
  expect(btn).toContain("background: transparent");
});

test(".btn-primary keeps a real border that forced-colours mode can paint", () => {
  expect(rule(".btn-primary")).toContain("border: 1.5px solid transparent");
});

test(".btn-primary draws the gradient outline as a masked ring", () => {
  const ring = rule(".btn-primary::before");
  expect(ring).toContain("var(--grad-from)");
  expect(ring).toContain("var(--grad-to)");
  expect(ring).toContain("mask-composite: exclude");
});

test("in forced colours the primary pill has a thicker edge than the outline pill", () => {
  const block = /@media \(forced-colors: active\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
  expect(block).toMatch(/\.btn-primary\s*\{[^}]*border-width:\s*3px/);
});

test("the focus ring follows each element's own corners", () => {
  expect(rule(":focus-visible")).not.toContain("border-radius");
});

const PRIMARY = [
  "app/tools/auctions/page.tsx",
  "app/tools/collections/page.tsx",
  "app/tools/gold-ledger/page.tsx",
  "app/tools/guild-board/page.tsx",
  "app/tools/professions/page.tsx",
  "app/upload/UploadClient.tsx",
  "app/not-found.tsx",
  "app/page.tsx",
  "components/BrowseFilters.tsx",
  "components/CookieConsent.tsx",
  "components/EmailCapture.tsx",
  "components/GoldCalculator.tsx",
  "components/IdLookup.tsx",
  "components/LoreSearchForm.tsx",
];

test.each(PRIMARY)("%s uses the primary pill", (file) => {
  expect(readFileSync(join(src, file), "utf8")).toContain("btn btn-primary");
});

test("no filled gold buttons remain", () => {
  const offenders = [...sourceFiles(src)].filter((path) => /bg-gold-|text-parchment-950/.test(readFileSync(path, "utf8")));
  expect(offenders).toEqual([]);
});
