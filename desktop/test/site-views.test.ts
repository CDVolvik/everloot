import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ BrowserWindow: class {}, WebContentsView: class {}, app: { getVersion: () => "0.1.0" }, shell: { openExternal: vi.fn() } }));

const { appUserAgent, siteToolPath, USER_AGENT_TOKEN } = await import("../src/main/site-views");

describe("site views", () => {
  it("appends the app token to Chromium's user agent so the site can leave ads out", () => {
    const ua = appUserAgent("Mozilla/5.0 (Windows NT 10.0) Chrome/140.0", "0.1.0");
    expect(ua).toBe("Mozilla/5.0 (Windows NT 10.0) Chrome/140.0 EverlootDesktopApp/0.1.0");
    expect(ua).toContain(`${USER_AGENT_TOKEN}/`);
  });

  it("maps a tool id to its site path and rejects unknown ids", () => {
    expect(siteToolPath("talents")).toBe("/tools/talents");
    expect(siteToolPath("nope")).toBeNull();
  });
});
