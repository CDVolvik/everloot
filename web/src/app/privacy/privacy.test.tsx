import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import PrivacyPage from "./page";

const html = renderToStaticMarkup(<PrivacyPage />).replace(/&#x27;|&apos;/g, "'");

test("says what Battle.net sign-in stores", () => {
  expect(html).toContain("Battle.net Account ID");
  expect(html).toContain("BattleTag");
});

test("says provider tokens are not kept", () => {
  expect(html).toContain("We don't keep your Battle.net access token");
});

test("says sessions carry no IP address", () => {
  expect(html).toContain("stored with no IP address and no browser details");
});

test("says a session ends at most 30 days after the last visit", () => {
  expect(html).toContain("It ends at most 30 days after your last visit.");
  expect(html).not.toContain("up to 30 days");
});

test("no emoji or pictographs", () => {
  expect(html).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{25A0}-\u{25FF}]/u);
});
