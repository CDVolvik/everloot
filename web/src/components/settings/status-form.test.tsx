// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import StatusForm from "./StatusForm";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

let container: HTMLDivElement;
let root: Root;
const fetch = vi.fn(async () => Response.json({ status: null }));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetch);
  fetch.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const submit = async () => {
  const form = container.querySelector("form")!;
  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  return JSON.parse((fetch.mock.calls.at(-1) as unknown as [string, RequestInit])[1].body as string);
};

test("editing a status keeps its clear-after time unless another is picked", async () => {
  const clearsAt = new Date(Date.now() + 3 * 3_600_000).toISOString();
  await act(async () => root.render(<StatusForm status={{ emoji: "🔥", text: "Raiding", clearsAt }} />));
  const select = container.querySelector<HTMLSelectElement>('select[name="clearAfter"]')!;
  expect(select.value).toBe("keep");
  container.querySelector<HTMLInputElement>('input[name="text"]')!.value = "Raiding later";
  expect(await submit()).toEqual({ emoji: "🔥", text: "Raiding later", clearsAt });
  select.value = "never";
  expect((await submit()).clearsAt).toBeNull();
  select.value = "30m";
  const at = Date.parse((await submit()).clearsAt);
  expect(Math.abs(at - (Date.now() + 30 * 60_000))).toBeLessThan(5_000);
});

test("a status that never clears starts at Never, with no Keep current", async () => {
  await act(async () => root.render(<StatusForm status={{ emoji: null, text: "Hi", clearsAt: null }} />));
  expect(container.querySelector<HTMLSelectElement>('select[name="clearAfter"]')!.value).toBe("never");
  expect(container.querySelector('option[value="keep"]')).toBeNull();
});
