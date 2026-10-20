// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import AdSlot, { AD_SLOTS } from "./AdSlot";

const CLIENT = "ca-pub-7465007562895301";
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  delete window.adsbygoogle;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

const ins = () => container.querySelector("ins.adsbygoogle")!;
const answer = (status: string) => act(async () => ins().setAttribute("data-ad-status", status));

test("renders nothing without an AdSense client, so previews and tests show no ads", () => {
  expect(renderToStaticMarkup(<AdSlot slot="inContent" client="" />)).toBe("");
});

test("serves a responsive unit for the chosen slot that takes no space and has no label before it fills", () => {
  const html = renderToStaticMarkup(<AdSlot slot="belowTool" client={CLIENT} />);
  expect(html).toContain(`data-ad-client="${CLIENT}"`);
  expect(html).toContain(`data-ad-slot="${AD_SLOTS.belowTool}"`);
  expect(html).toContain('data-ad-format="auto"');
  expect(html).toContain("h-0 overflow-hidden");
  expect(html).toContain('aria-hidden="true"');
  expect(html).not.toContain("Advertisement");
  expect(html).not.toContain("min-height");
  expect(html).not.toContain("my-8");
});

test("shows the label and the space once AdSense fills the unit", async () => {
  await act(async () => root.render(<AdSlot slot="inContent" client={CLIENT} />));
  expect(window.adsbygoogle).toHaveLength(1);
  await answer("filled");
  const aside = container.querySelector("aside")!;
  expect(aside.getAttribute("aria-label")).toBe("Advertisement");
  expect(aside.hasAttribute("aria-hidden")).toBe(false);
  expect(aside.className).toContain("my-8");
  expect(aside.className).not.toContain("h-0");
  expect(container.textContent).toBe("Advertisement");
});

test("removes the slot when AdSense marks it unfilled", async () => {
  await act(async () => root.render(<AdSlot slot="inContent" client={CLIENT} />));
  await answer("unfilled");
  expect(container.innerHTML).toBe("");
});

test("removes the slot when AdSense optimises an unfilled unit, since no ad is in it", async () => {
  await act(async () => root.render(<AdSlot slot="inContent" client={CLIENT} />));
  await answer("unfill-optimized");
  expect(container.innerHTML).toBe("");
});

test("stays out of sight when the script never answers: blocked, not yet approved, or no consent", async () => {
  await act(async () => root.render(<AdSlot slot="inContent" client={CLIENT} />));
  const aside = container.querySelector("aside")!;
  expect(aside.className).toContain("h-0 overflow-hidden");
  expect(aside.getAttribute("aria-hidden")).toBe("true");
  expect(container.textContent).toBe("");
});

test("renders nothing and requests no ad inside the Desktop App", async () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Windows NT 10.0) Chrome/140.0 EverlootDesktopApp/0.1.0");
  await act(async () => root.render(<AdSlot slot="inContent" client={CLIENT} />));
  expect(container.innerHTML).toBe("");
  expect(window.adsbygoogle).toBeUndefined();
});
