import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => <a href={href} className={className}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); } }));
const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUser: auth.getUser, siteUrl: () => "https://everloot.app" }));

import SignInPage from "./page";

const add = (extra: Record<string, string> = {}) => ({ searchParams: Promise.resolve({ add: "1", ...extra }) });

beforeEach(() => {
  vi.stubEnv("BNET_CLIENT_ID", "client");
  vi.stubEnv("BNET_CLIENT_SECRET", "secret");
  vi.stubEnv("EVERLOOT_AUTH_V2", "1");
  vi.stubEnv("EVERLOOT_PROFILES", "1");
  auth.getUser.mockReset().mockResolvedValue({ id: "u1", name: "Thrall#1" });
});
afterEach(() => { vi.unstubAllEnvs(); });

test("Add another account keeps the signed-in account on the page and comes back home", async () => {
  const html = renderToStaticMarkup(await SignInPage(add()));
  expect(html).toContain(">Add another account</h1>");
  expect(html).toContain("Sign in with the account you want to add.");
  expect(html).toContain(`href="/api/auth/bnet?returnTo=${encodeURIComponent("/")}"`);
});

test("without Better Auth or the profiles switch, a signed-in visitor is sent on as before", async () => {
  vi.stubEnv("EVERLOOT_AUTH_V2", "0");
  await expect(SignInPage(add())).rejects.toThrow("NEXT_REDIRECT /account");
  vi.stubEnv("EVERLOOT_AUTH_V2", "1");
  vi.stubEnv("EVERLOOT_PROFILES", "0");
  await expect(SignInPage(add())).rejects.toThrow("NEXT_REDIRECT /account");
  // add is exactly "1".
  vi.stubEnv("EVERLOOT_PROFILES", "1");
  await expect(SignInPage({ searchParams: Promise.resolve({ add: "yes" }) })).rejects.toThrow("NEXT_REDIRECT /account");
});
