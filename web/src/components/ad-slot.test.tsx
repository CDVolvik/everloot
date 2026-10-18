import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import AdSlot, { AD_SLOTS } from "./AdSlot";

test("renders nothing without an AdSense client, so previews and tests show no ads", () => {
  expect(renderToStaticMarkup(<AdSlot slot="inContent" client="" />)).toBe("");
});

test("renders a labelled, responsive unit for the chosen slot with space reserved", () => {
  const html = renderToStaticMarkup(<AdSlot slot="belowTool" client="ca-pub-7465007562895301" />);
  expect(html).toContain('aria-label="Advertisement"');
  expect(html).toContain(">Advertisement<");
  expect(html).toContain('data-ad-client="ca-pub-7465007562895301"');
  expect(html).toContain(`data-ad-slot="${AD_SLOTS.belowTool}"`);
  expect(html).toContain('data-ad-format="auto"');
  expect(html).toContain("min-height:250px");
});
