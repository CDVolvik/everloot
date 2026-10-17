// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fixture } from "@/lib/talents/fixture";
import { encodeBuild } from "@/lib/talents/share";
import TalentCalculator from "./TalentCalculator";

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.location.hash = "";
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const render = () => act(async () => root.render(<TalentCalculator catalog={fixture} />));
const node = (id: number) => container.querySelector<HTMLButtonElement>(`#talent-${id}`)!;
const status = () => container.querySelector('[role="status"]')!.textContent;
const button = (label: RegExp) => [...container.querySelectorAll("button")].find((b) => label.test(b.textContent ?? ""))!;
const click = (el: Element) => act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

test("a talent says its rank, row and why it is locked", async () => {
  await render();
  expect(node(11).getAttribute("aria-label")).toBe("Talent 11, rank 0 of 5, row 1, can take a point");
  expect(node(21).getAttribute("aria-label")).toBe("Talent 21, rank 0 of 5, row 2, locked. Needs 5 points spent in Left on rows above.");
});

test("a click adds a point and announces it; a refused click explains itself", async () => {
  await render();
  await click(node(11));
  expect(status()).toBe("Talent 11: rank 1 of 5.");
  expect(node(11).textContent).toContain("1/5");
  await click(node(21));
  expect(status()).toBe("Needs 5 points spent in Left on rows above.");
  expect(container.textContent).toContain("1 of 51 points spent, 50 left");
});

test("take-points-back mode removes, and a point other rows depend on stays", async () => {
  await render();
  for (let i = 0; i < 5; i++) await click(node(11));
  await click(node(21));
  await click(button(/Take points back/));
  expect(button(/Take points back/).getAttribute("aria-pressed")).toBe("true");
  await click(node(11));
  expect(status()).toBe("A talent further down depends on this point.");
  await click(node(21));
  await click(node(11));
  expect(node(11).textContent).toContain("4/5");
});

test("undo, redo and reset", async () => {
  await render();
  await click(node(11));
  await click(node(11));
  await click(button(/^Undo$/));
  expect(node(11).textContent).toContain("1/5");
  await click(button(/^Redo$/));
  expect(node(11).textContent).toContain("2/5");
  await click(button(/Reset this set/));
  expect(node(11).textContent).toContain("0/5");
  await click(button(/^Undo$/));
  expect(node(11).textContent).toContain("2/5");
});

test("the second set stays locked below level 40 unless planning ahead", async () => {
  await render();
  const second = button(/Second set/);
  expect(second.getAttribute("aria-disabled")).toBe("false");
  const slider = container.querySelector<HTMLInputElement>('input[type="range"]')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setter.call(slider, "30"); slider.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(button(/Second set/).getAttribute("aria-disabled")).toBe("true");
  expect(container.textContent).toContain("opens at level 40");
  await click(container.querySelector('input[type="checkbox"]')!);
  expect(button(/Second set/).getAttribute("aria-disabled")).toBe("false");
});

test("a link from another build loads and lists what it could not place", async () => {
  const code = encodeBuild({ classSlug: "mage", specId: 1482, build: "0.9.0.0", ranks: { 11: { rank: 2 }, 999: { rank: 1 } } });
  window.location.hash = `#plan=${code}`;
  await render();
  expect(node(11).textContent).toContain("2/5");
  const text = container.querySelector('[aria-label="What loaded"]')!.textContent!;
  expect(text).toContain("Loaded, with 2 changes.");
  expect(text).toContain("Made on game build 0.9.0.0");
  expect(text).toContain("node 999");
});

test("a share link names the build and loads back", async () => {
  await render();
  await click(node(11));
  await click(button(/Make a share link/));
  const link = container.querySelector<HTMLInputElement>("#talent-link")!.value;
  expect(link).toMatch(/#plan=EL1-mage-1482-1\.0\.0\.1-/);
});

const setLevel = (value: string) => act(async () => {
  const slider = container.querySelector<HTMLInputElement>('input[type="range"]')!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(slider, value);
  slider.dispatchEvent(new Event("input", { bubbles: true }));
});
const key = (el: Element, k: string) => act(async () => { el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })); });

test("redo cannot bring back more points than the level holds", async () => {
  await render();
  for (let i = 0; i < 5; i++) await click(node(11));
  for (let i = 0; i < 3; i++) await click(node(12));
  expect(container.textContent).toContain("8 of 51 points spent");
  for (let i = 0; i < 3; i++) await click(button(/^Undo$/));
  await setLevel("14");
  expect(container.textContent).toContain("5 of 5 points spent");
  for (let i = 0; i < 3; i++) await click(button(/^Redo$/));
  expect(container.textContent).toMatch(/8 of 8 points spent, 0 left/);
  expect(status()).toBe("Level raised to 17, the lowest that holds the points in this build.");
});

test("a locked talent says what it needs before it says the points ran out", async () => {
  await render();
  await setLevel("10");
  await click(node(11));
  expect(container.textContent).toContain("1 of 1 points spent, 0 left");
  expect(node(21).getAttribute("aria-label")).toContain("Needs 5 points spent in Left on rows above");
  expect(node(21).getAttribute("aria-label")).not.toContain("No points left");
  expect(node(12).getAttribute("aria-label")).toContain("No points left at this level");
});

test("arrow keys stay on the row or column and do not jump rows sideways", async () => {
  await render();
  const focusAfter = async (from: number, k: string) => {
    await act(async () => node(from).focus());
    await key(node(from), k);
    return document.activeElement?.id;
  };
  expect(await focusAfter(21, "ArrowRight")).toBe("talent-22");
  expect(await focusAfter(22, "ArrowRight")).toBe("talent-22"); // nothing further right on row 2: stays
  expect(await focusAfter(11, "ArrowDown")).toBe("talent-21");
  expect(await focusAfter(12, "ArrowDown")).toBe("talent-22");
  expect(await focusAfter(22, "ArrowDown")).toBe("talent-32-0"); // choice node, first entry
  expect(await focusAfter(11, "ArrowLeft")).toBe("talent-11");
  expect(await focusAfter(41, "ArrowUp")).toBe("talent-31"); // column 1: row 3 is the next one up
});

test("pasting a share link into an open tab loads it", async () => {
  await render();
  expect(node(11).textContent).toContain("0/5");
  const code = encodeBuild({ classSlug: "mage", specId: 1482, build: "1.0.0.1", ranks: { 11: { rank: 3 } } });
  await act(async () => {
    // jsdom, like a browser, fires hashchange itself once the hash is set.
    window.location.hash = `#plan=${code}`;
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(node(11).textContent).toContain("3/5");
  expect(status()).toBe("Build loaded from the link.");
  await click(button(/^Undo$/));
  expect(node(11).textContent).toContain("0/5");
});
