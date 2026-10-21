import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test, vi } from "vitest";
import { reducedMotion, scrollBehavior } from "./motion";

afterEach(() => vi.unstubAllGlobals());

const prefers = (reduce: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query === "(prefers-reduced-motion: reduce)" }));

test("smooth scrolling turns off when the visitor asks for reduced motion", () => {
  prefers(false);
  expect(reducedMotion()).toBe(false);
  expect(scrollBehavior()).toBe("smooth");
  prefers(true);
  expect(reducedMotion()).toBe(true);
  expect(scrollBehavior()).toBe("auto");
});

test("on the server there is no preference to read", () => {
  vi.stubGlobal("matchMedia", undefined);
  expect(reducedMotion()).toBe(false);
});

// The CSS rule in globals.css cannot reach a scroll started from JavaScript, so none may ask for "smooth" itself.
test("no script scrolls smoothly without asking first", () => {
  const src = fileURLToPath(new URL("..", import.meta.url));
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []);
  const offenders = files(src).filter((f) => /behavior:\s*["']smooth["']/.test(readFileSync(f, "utf8")));
  expect(offenders.map((f) => relative(src, f))).toEqual([]);
});
