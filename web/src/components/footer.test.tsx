import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));
vi.mock("./CookieConsent", () => ({ CookiePreferencesButton: () => <button type="button">Cookie preferences</button> }));

import Footer from "./Footer";
import { TRADEMARK_LINE } from "@/lib/jsonld";

afterEach(() => { vi.unstubAllEnvs(); });

const html = () => renderToStaticMarkup(<Footer />);
const text = () => html().replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

function sourceHref(): string | undefined {
  return html().match(/<a href="([^"]+)"[^>]*>Source<\/a>/)?.[1];
}

test("links Source to the deployed commit", () => {
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abc1234");
  expect(sourceHref()).toBe("https://github.com/CDVolvik/everloot/tree/abc1234");
});

test("links Source to the repository when no commit is known", () => {
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
  expect(sourceHref()).toBe("https://github.com/CDVolvik/everloot");
});

test("ignores a malformed sha", () => {
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "../x");
  expect(sourceHref()).toBe("https://github.com/CDVolvik/everloot");
});

test("names the deployed build only when one is known", () => {
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abc1234def5678");
  expect(text()).toContain("Build abc1234");
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
  expect(text()).not.toContain("Build ");
});

test("states the code and data licences", () => {
  expect(text()).toContain("R21 Media Group, LLC. ");
  expect(text()).toContain("Code AGPL-3.0, data CC BY-SA 4.0.");
});

test("carries the full Blizzard trademark sentence", () => {
  expect(text()).toContain(TRADEMARK_LINE);
  expect(TRADEMARK_LINE).toContain("registered trademarks of Blizzard Entertainment, Inc.");
});

test("links How we count and the Discord invite", () => {
  expect(html()).toContain('href="/methodology"');
  expect(html()).toContain('href="https://discord.gg/9CKsbHTRu3"');
});

test("links every legal page and the privacy choices anchor", () => {
  const markup = html();
  for (const href of ["/privacy", "/terms", "/security", "/privacy#choices", "/terms#takedown", "/contact"]) {
    expect(markup, href).toContain(`href="${href}"`);
  }
  expect(markup).toContain("Cookie preferences");
});

test("groups the links under labelled columns", () => {
  const markup = html();
  for (const heading of ["Browse", "Data and API", "Project", "Legal"]) expect(markup).toContain(heading);
  expect(markup).toContain('aria-label="Footer"');
});
