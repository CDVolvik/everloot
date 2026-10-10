// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import GoldCalculator from "./GoldCalculator";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

function status() {
  const region = container.querySelector('[role="status"]');
  expect(region?.getAttribute("aria-live")).toBe("polite");
  return region!.textContent ?? "";
}

function setValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

test("a screen reader hears the result once typing settles, not on every keystroke", async () => {
  await act(async () => root.render(<GoldCalculator />));
  await act(async () => { vi.advanceTimersByTime(1000); });
  expect(status()).toMatch(/Gold per hour .*Total /);

  const vendor = container.querySelector<HTMLInputElement>('input[placeholder="Lump sum from trash / quests"]');
  expect(vendor).not.toBeNull();
  await act(async () => setValue(vendor!, "50"));
  const before = status();
  await act(async () => { vi.advanceTimersByTime(100); });
  expect(status()).toBe(before);
  await act(async () => { vi.advanceTimersByTime(1000); });
  expect(status()).not.toBe(before);
  expect(status()).toContain("Total 50g");
});
