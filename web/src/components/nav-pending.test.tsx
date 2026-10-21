// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MOTION } from "@/design/tokens";
import { DONE_MS, NavPendingBar } from "./NavPending";
import PendingLink from "./ui/PendingLink";

// The address the app router reports, changed by the tests the way a finished navigation changes it.
const address = vi.hoisted(() => ({ path: "/database/items", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => address.path,
  useSearchParams: () => new URLSearchParams(address.search),
}));
// next/link calls onNavigate when a click starts a client-side navigation.
vi.mock("next/link", () => ({
  default: ({ href, children, className, onNavigate }: { href: string; children: ReactNode; className?: string; onNavigate?: () => void }) => (
    <a href={href} className={className} onClick={(e) => { e.preventDefault(); onNavigate?.(); }}>{children}</a>
  ),
}));

let container: HTMLDivElement;
let root: Root;
let main: HTMLElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  address.path = "/database/items";
  address.search = "";
  window.history.replaceState(null, "", "/database/items");
  main = document.createElement("main");
  main.id = "main-content";
  container = document.createElement("div");
  document.body.append(main, container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  main.remove();
  vi.useRealTimers();
});

const page = () => act(async () => root.render(<><NavPendingBar /><PendingLink href="/database/items?quality=epic">Epic</PendingLink><PendingLink href="/database/items">All</PendingLink></>));
const bar = () => container.querySelector<HTMLElement>(".nav-pending")!;
const state = () => bar().getAttribute("data-state");
const on = () => state() === "on";
const busy = () => main.getAttribute("aria-busy") === "true";
const click = (label: string) => act(async () => { [...container.querySelectorAll("a")].find((a) => a.textContent === label)!.click(); });
const wait = (ms: number) => act(async () => { vi.advanceTimersByTime(ms); });
/** The new page arrives: the router reports its address. */
const arrive = async (search: string) => {
  address.search = search;
  window.history.replaceState(null, "", `/database/items?${search}`);
  await page();
};

test("a loading link marks <main> busy at once and shows the bar after the pending delay; arriving clears both", async () => {
  await page();
  expect(bar().getAttribute("aria-hidden")).toBe("true");
  expect([on(), busy()]).toEqual([false, false]);

  await click("Epic");
  expect([on(), busy()]).toEqual([false, true]);
  await wait(MOTION.duration.pendingDelay);
  expect(on()).toBe(true);

  await arrive("quality=epic");
  expect([on(), busy()]).toEqual([false, false]);
});

test("when the page arrives the bar completes and fades (done), then is idle again", async () => {
  await page();
  expect(state()).toBe("idle");
  await click("Epic");
  await wait(MOTION.duration.pendingDelay);
  expect(state()).toBe("on");
  await arrive("quality=epic");
  expect(state()).toBe("done");
  await wait(DONE_MS - 1);
  expect(state()).toBe("done");
  await wait(1);
  expect(state()).toBe("idle");
});

test("a new load while the bar finishes starts it again from the beginning", async () => {
  await page();
  await click("Epic");
  await wait(MOTION.duration.pendingDelay);
  await arrive("quality=epic");
  expect(state()).toBe("done");
  await click("All");
  // Back to its 10 % at once, unseen, and shown again only after the delay.
  expect([state(), busy()]).toEqual(["idle", true]);
  await wait(DONE_MS);
  expect(state()).toBe("on");
});

test("a page that arrives within the delay never shows the bar", async () => {
  await page();
  await click("Epic");
  await wait(MOTION.duration.pendingDelay - 50);
  await arrive("quality=epic");
  await wait(MOTION.duration.pendingDelay);
  expect([state(), busy()]).toEqual(["idle", false]);
});

test("a link to the page already shown (its own tab) starts nothing", async () => {
  await page();
  await click("All");
  await wait(MOTION.duration.pendingDelay);
  expect([on(), busy()]).toEqual([false, false]);
});

test("if the address never changes, the bar gives up instead of staying, and goes at once without completing", async () => {
  await page();
  await click("Epic");
  await wait(10_000);
  expect([state(), busy()]).toEqual(["idle", false]);
});
