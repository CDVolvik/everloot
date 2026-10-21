import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test, vi } from "vitest";
import { MOTION } from "@/design/tokens";
import { glide, reducedMotion, scrollBehavior } from "./motion";

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

/** A rect, in a test without a DOM. */
const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height }) as DOMRect;

/** An element at `at` with a recorded animate(), and a glide already running on it. */
function element(at: DOMRect) {
  const calls: unknown[][] = [];
  const running = { cancelled: false, cancel() { this.cancelled = true; } };
  const el = {
    getBoundingClientRect: () => at,
    getAnimations: () => [running],
    animate: (...args: unknown[]) => { calls.push(args); return {}; },
  } as unknown as HTMLElement;
  return { el, calls, running };
}

test("glide: the element travels from where it was to where it is, with the panel duration and the move curve", () => {
  prefers(false);
  const { el, calls, running } = element(box(10, 100, 180, 36));
  glide(el, box(210, 60, 180, 36));
  expect(running.cancelled).toBe(true);
  expect(calls).toEqual([[
    [{ transform: "translate(200px, -40px)" }, { transform: "none" }],
    { duration: MOTION.duration.panel, easing: MOTION.ease.inOut },
  ]]);
});

test("glide: nothing moves under reduced motion, from or to a hidden place, or when the place is the same", () => {
  prefers(true);
  const reduced = element(box(10, 100, 180, 36));
  glide(reduced.el, box(210, 60, 180, 36));
  expect(reduced.calls).toEqual([]);
  prefers(false);
  for (const [first, last] of [[box(0, 0, 0, 0), box(10, 10, 180, 36)], [box(10, 10, 180, 36), box(0, 0, 0, 0)], [box(10, 10, 180, 36), box(10, 10, 180, 36)]]) {
    const { el, calls } = element(last);
    glide(el, first);
    expect(calls).toEqual([]);
  }
});

// element.animate() is out of reach of the reduced-motion rule in globals.css too; every script that starts one
// does it through lib/motion.ts, which asks first.
test("no script animates an element without asking for reduced motion first", () => {
  const src = fileURLToPath(new URL("..", import.meta.url));
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []);
  const offenders = files(src).filter((f) => {
    const text = readFileSync(f, "utf8");
    return /\.animate\(/.test(text) && !/reducedMotion\(\)/.test(text);
  });
  expect(offenders.map((f) => relative(src, f))).toEqual([]);
});