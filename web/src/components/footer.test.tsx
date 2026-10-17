import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));
vi.mock("./CookieConsent", () => ({ CookiePreferencesButton: () => null }));

import Footer from "./Footer";

afterEach(() => { vi.unstubAllEnvs(); });

function sourceHref(): string | undefined {
  return renderToStaticMarkup(<Footer />).match(/<a href="([^"]+)"[^>]*>Source<\/a>/)?.[1];
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

test("states the code and data licences", () => {
  expect(renderToStaticMarkup(<Footer />)).toContain("Code AGPL-3.0, data CC BY-SA 4.0.");
});
