import { NextRequest } from "next/server";
import { afterEach, expect, test, vi } from "vitest";
import { config, middleware } from "./middleware";

const request = (cookie?: string) => new NextRequest("https://everloot.app/", { headers: cookie ? { cookie } : {} });
const rewrittenTo = (res: Response) => res.headers.get("x-middleware-rewrite");

afterEach(() => { vi.unstubAllEnvs(); });

test("only / goes through the middleware", () => {
  expect(config.matcher).toBe("/");
});

test("with a session cookie, / is the signed-in home, marked as the rewrite", () => {
  vi.stubEnv("EVERLOOT_PROFILES", "1");
  for (const cookie of [`everloot_session=${"a".repeat(64)}`, "everloot.session_token=abc.def", "__Secure-everloot.session_token=abc.def"]) {
    const res = middleware(request(`theme=dark; ${cookie}`));
    expect(rewrittenTo(res)).toBe("https://everloot.app/home");
    expect(res.headers.get("x-middleware-request-x-everloot-home")).toBe("1");
  }
});

test("without one, or with only other cookies, / stays the landing page", () => {
  vi.stubEnv("EVERLOOT_PROFILES", "1");
  expect(rewrittenTo(middleware(request()))).toBeNull();
  expect(rewrittenTo(middleware(request("everloot_return_to=/me; everloot.session_data=x; everloot_session=")))).toBeNull();
});

test("with the switch off nothing is rewritten", () => {
  for (const value of ["", "0", "true"]) {
    vi.stubEnv("EVERLOOT_PROFILES", value);
    expect(rewrittenTo(middleware(request("everloot.session_token=abc.def")))).toBeNull();
  }
});
