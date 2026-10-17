// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import CookieConsent from "./CookieConsent";

const GA = "G-ABCD1234";
const CF = "0123456789abcdef0123456789abcdef";
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  sessionStorage.clear();
  document.head.innerHTML = "";
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const button = (label: string) => Array.from(container.querySelectorAll("button")).find((b) => b.textContent === label)!;
const scripts = () => Array.from(document.head.querySelectorAll("script"));

describe("CookieConsent categories", () => {
  it("loads no script and shows no banner when nothing is configured", async () => {
    await act(async () => root.render(<CookieConsent />));
    expect(scripts()).toHaveLength(0);
    expect(container.querySelector("section")).toBeNull();
  });

  it("does not load Google Analytics before consent, and loads it after acceptance", async () => {
    await act(async () => root.render(<CookieConsent analytics={{ gaId: GA }} />));
    expect(scripts()).toHaveLength(0);
    expect(container.textContent).toContain("Analytics");
    expect(container.textContent).not.toMatch(/advertising loads/i);
    await act(async () => button("Accept optional cookies").click());
    expect(scripts().some((s) => s.src.includes("googletagmanager.com"))).toBe(true);
    expect(localStorage.getItem("everloot-analytics-consent-v1")).toBe("accepted");
  });

  it("keeps Google Analytics off after rejection", async () => {
    await act(async () => root.render(<CookieConsent analytics={{ gaId: GA }} />));
    await act(async () => button("Reject optional cookies").click());
    expect(scripts()).toHaveLength(0);
    expect(localStorage.getItem("everloot-analytics-consent-v1")).toBe("rejected");
  });

  it("keeps the cookieless beacon free of any banner or choice", async () => {
    await act(async () => root.render(<CookieConsent analytics={{ cfBeaconToken: CF }} />));
    expect(scripts().map((s) => s.src)).toEqual(["https://static.cloudflareinsights.com/beacon.min.js"]);
    expect(container.querySelector("section")).toBeNull();
  });

  it("does not offer advertising unless an AdSense client is set", async () => {
    await act(async () => root.render(<CookieConsent analytics={{ gaId: GA }} />));
    expect(container.textContent).not.toContain("Google AdSense");
  });
});
