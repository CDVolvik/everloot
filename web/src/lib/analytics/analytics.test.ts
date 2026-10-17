// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { analyticsConfig, needsAnalyticsConsent } from "./config";
import { loadConsented, loadCookieless, optedOutBySignal, unloadConsented } from "./load";
import { track } from "./track";

const GA = "G-ABCD1234";
const PH = "phc_abcdefghij1234567890";
const CF = "0123456789abcdef0123456789abcdef";

afterEach(() => {
  document.head.innerHTML = "";
  delete window.gtag;
  delete window.posthog;
});

describe("analyticsConfig", () => {
  it("has every tool off when no variable is set", () => {
    const c = analyticsConfig({});
    expect(c.gaId).toBeUndefined();
    expect(c.posthogKey).toBeUndefined();
    expect(c.cfBeaconToken).toBeUndefined();
    expect(needsAnalyticsConsent(c)).toBe(false);
  });

  it("treats malformed values as unset", () => {
    const c = analyticsConfig({ NEXT_PUBLIC_GA_ID: "<script>", NEXT_PUBLIC_POSTHOG_KEY: "nope", NEXT_PUBLIC_CF_BEACON_TOKEN: "x", NEXT_PUBLIC_POSTHOG_HOST: "https://evil.example" });
    expect(c.gaId).toBeUndefined();
    expect(c.posthogKey).toBeUndefined();
    expect(c.cfBeaconToken).toBeUndefined();
    expect(c.posthogHost).toBe("https://eu.i.posthog.com");
  });

  it("accepts well-formed values", () => {
    const c = analyticsConfig({ NEXT_PUBLIC_GA_ID: GA, NEXT_PUBLIC_POSTHOG_KEY: PH, NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com/", NEXT_PUBLIC_CF_BEACON_TOKEN: CF });
    expect(c).toEqual({ gaId: GA, posthogKey: PH, posthogHost: "https://us.i.posthog.com", cfBeaconToken: CF });
    expect(needsAnalyticsConsent(c)).toBe(true);
  });
});

describe("script loading", () => {
  it("loads nothing without env vars, even after consent", () => {
    loadCookieless({}, {}, document);
    loadConsented({}, window, document);
    expect(document.head.querySelectorAll("script")).toHaveLength(0);
    expect(window.gtag).toBeUndefined();
  });

  it("loads the cookieless beacon without consent and only once", () => {
    loadCookieless({ cfBeaconToken: CF }, {}, document);
    loadCookieless({ cfBeaconToken: CF }, {}, document);
    const scripts = document.head.querySelectorAll("script");
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe("https://static.cloudflareinsights.com/beacon.min.js");
    expect(JSON.parse(scripts[0].getAttribute("data-cf-beacon")!)).toEqual({ token: CF });
  });

  it.each([{ doNotTrack: "1" }, { globalPrivacyControl: true }])("skips the beacon for %o", (signals) => {
    expect(optedOutBySignal(signals)).toBe(true);
    loadCookieless({ cfBeaconToken: CF }, signals, document);
    expect(document.head.querySelectorAll("script")).toHaveLength(0);
  });

  it("loads Google Analytics only when asked to, and removes it on withdrawal", () => {
    expect(document.getElementById("everloot-ga")).toBeNull();
    loadConsented({ gaId: GA }, window, document);
    expect((document.getElementById("everloot-ga") as HTMLScriptElement).src).toContain(`googletagmanager.com/gtag/js?id=${GA}`);
    unloadConsented(document, window);
    expect(document.getElementById("everloot-ga")).toBeNull();
    expect(window.gtag).toBeUndefined();
  });
});

describe("track", () => {
  it("does nothing when no tool is loaded", () => {
    expect(() => track("search", { surface: "lore" })).not.toThrow();
  });

  it("sends to loaded tools and survives one that throws", () => {
    const capture = vi.fn();
    window.posthog = { capture };
    window.gtag = vi.fn();
    track("addon_download", { addon: "polestar", to: "github" });
    expect(capture).toHaveBeenCalledWith("addon_download", { addon: "polestar", to: "github" });
    expect(window.gtag).toHaveBeenCalledWith("event", "addon_download", { addon: "polestar", to: "github" });
    window.posthog = { capture: () => { throw new Error("boom"); } };
    expect(() => track("search", { surface: "lore" })).not.toThrow();
  });
});
