// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MOTION } from "@/design/tokens";
import CopyButton from "./CopyButton";

let container: HTMLDivElement;
let root: Root;
let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const button = () => container.querySelector("button")!;
/** Every label in the button, in order: the button is as wide as the widest of these. */
const labels = () => [...container.querySelectorAll("[data-copy-labels] > span")].map((s) => s.textContent);
/** The label a reader sees and a screen reader reads. */
const shown = () => [...container.querySelectorAll("[data-copy-labels] > span:not([aria-hidden])")].map((s) => s.textContent);
const click = () => act(async () => { button().click(); });
const wait = (ms: number) => act(async () => { vi.advanceTimersByTime(ms); });

test("all the labels stay in one grid cell, so saying Copied never changes the button's width", async () => {
  await act(async () => root.render(<CopyButton className="btn btn-primary" text="https://everloot.app/b/x" label="Copy link" />));
  expect(container.querySelector("[data-copy-labels]")!.className).toBe("inline-grid");
  for (const span of container.querySelectorAll("[data-copy-labels] > span")) expect(span.className).toContain("[grid-area:1/1]");
  expect(labels()).toEqual(["Copy link", "Copied"]);
  expect(shown()).toEqual(["Copy link"]);

  await click();
  expect(writeText).toHaveBeenCalledWith("https://everloot.app/b/x");
  // The same labels are in the button; only which one shows has changed, by opacity alone.
  expect(labels()).toEqual(["Copy link", "Copied"]);
  expect(shown()).toEqual(["Copied"]);
  const [idle, copied] = container.querySelectorAll("[data-copy-labels] > span");
  expect(idle.className).toContain("opacity-0");
  expect(copied.className).toContain("opacity-100");
  expect(copied.className).toContain("duration-fade");
});

test("Copied lasts MOTION.duration.copied, and a second click restarts the wait", async () => {
  await act(async () => root.render(<CopyButton text="code" label="Copy" />));
  await click();
  await wait(MOTION.duration.copied - 500);
  await click();
  // The first click's timer would have ended it here.
  await wait(1000);
  expect(shown()).toEqual(["Copied"]);
  await wait(MOTION.duration.copied - 1000);
  expect(shown()).toEqual(["Copy"]);
});

test("unmounting clears the timer", async () => {
  await act(async () => root.render(<CopyButton text="code" label="Copy" />));
  await click();
  expect(vi.getTimerCount()).toBe(1);
  await act(async () => root.render(<p>gone</p>));
  expect(vi.getTimerCount()).toBe(0);
});

test("a failed copy says so when the button has words for it, and tells the page either way", async () => {
  writeText.mockRejectedValue(new Error("denied"));
  const onResult = vi.fn();
  await act(async () => root.render(<CopyButton text={() => "page"} label="Copy page" failedLabel="Copy failed" onResult={onResult} />));
  expect(labels()).toEqual(["Copy page", "Copied", "Copy failed"]);
  await click();
  expect(onResult).toHaveBeenCalledWith(false);
  expect(shown()).toEqual(["Copy failed"]);
  await wait(MOTION.duration.copied);
  expect(shown()).toEqual(["Copy page"]);
});

test("without a failure label a failed copy leaves the label; a null text copies nothing", async () => {
  writeText.mockRejectedValue(new Error("denied"));
  await act(async () => root.render(<CopyButton text="x" label="Copy" />));
  await click();
  expect(shown()).toEqual(["Copy"]);

  writeText.mockClear();
  await act(async () => root.render(<CopyButton text={() => null} label="Copy" />));
  await click();
  expect(writeText).not.toHaveBeenCalled();
});
