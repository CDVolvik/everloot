import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import FilterBar from "./FilterBar";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

const html = renderToStaticMarkup(
  <FilterBar
    label="Item filters"
    active={0}
    clearHref="/database/items"
    controls={[{ type: "menu", key: "quality", label: "Quality", options: [{ label: "Epic", href: "/database/items?quality=epic", on: false }] }]}
  />,
);

test("filter menus and the phone sheet fade in when they open (the .pop class)", () => {
  expect(html).toMatch(/<ul class="pop /);
  expect(html).toMatch(/<div class="pop mt-2 flex/);
});

test("each chevron points up while its own menu is open, with no animation", () => {
  const chevrons = html.match(/<svg[^>]*class="[^"]*"/g) ?? [];
  expect(chevrons.length).toBeGreaterThan(0);
  for (const svg of chevrons) {
    expect(svg).toContain("[[open]&gt;summary&gt;&amp;]:rotate-180");
    expect(svg).not.toContain("transition");
  }
});

test(".pop is the one 150 ms fade, runs only on an open <details>, and closing is instant", () => {
  expect(css).toMatch(/@keyframes fade-in\s*\{\s*from\s*\{\s*opacity: 0;\s*\}\s*\}/);
  expect(css).toMatch(/\.pop\s*\{\s*animation: fade-in var\(--dur-fade\) var\(--ease-out\);\s*\}/);
  expect(css).toMatch(/details:not\(\[open\]\) > \.pop\s*\{\s*animation: none;\s*\}/);
});

test("the navigation bar fades in by opacity only and goes at once", () => {
  expect(css).toMatch(/\.nav-pending\s*\{\s*opacity: 0;\s*\}/);
  expect(css).toMatch(/\.nav-pending\[data-on\]\s*\{\s*opacity: 1;\s*transition: opacity var\(--dur-fade\) var\(--ease-out\);\s*\}/);
});

test("the filters, sort headers, pager and link tabs load through PendingLink", () => {
  for (const file of ["FilterBar", "DataTable", "Pager", "LinkTabs"]) {
    const source = readFileSync(new URL(`./${file}.tsx`, import.meta.url), "utf8");
    expect(source, file).toContain('import Link from "./PendingLink";');
    expect(source, file).not.toContain('from "next/link"');
  }
});

test("under reduced motion every animation and transition is off", () => {
  expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\*, ::before, ::after\s*\{\s*animation: none !important;\s*transition: none !important;/);
});
