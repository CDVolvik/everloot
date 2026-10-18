import { expect, test, vi } from "vitest";
import { checkForUpdates, compareVersions, newestDesktopRelease } from "../src/main/updates";
import { allowedExternal } from "../src/main/external";

test("versions compare by number, and a dev build is older than any release", () => {
  expect(compareVersions("0.2.0", "0.1.9")).toBeGreaterThan(0);
  expect(compareVersions("1.0.0", "0.10.0")).toBeGreaterThan(0);
  expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
  expect(compareVersions("dev", "0.1.0")).toBeLessThan(0);
});

test("the newest desktop release wins; addon tags, drafts and pre-releases are ignored", () => {
  const releases = [
    { tag_name: "addon-v0.3.3", html_url: "a" },
    { tag_name: "desktop-v0.2.0", html_url: "pre", prerelease: true },
    { tag_name: "desktop-v0.1.2", html_url: "https://github.com/Everloot/everloot/releases/tag/desktop-v0.1.2" },
    { tag_name: "desktop-v0.1.10", html_url: "ten" },
    { tag_name: "desktop-v9.9.9", html_url: "draft", draft: true },
    { tag_name: "nightly" },
  ];
  expect(newestDesktopRelease(releases)).toEqual({ version: "0.1.10", url: "ten" });
  expect(newestDesktopRelease([{ tag_name: "addon-v1.0.0" }])).toBeNull();
  expect(newestDesktopRelease("nope")).toBeNull();
});

test("a check says whether something newer exists and never downloads", async () => {
  const send = vi.fn(async () => new Response(JSON.stringify([{ tag_name: "desktop-v0.2.0", html_url: "u" }]), { status: 200 }));
  expect(await checkForUpdates("0.1.0", send as unknown as typeof fetch)).toEqual({ current: "0.1.0", latest: "0.2.0", url: "u", newer: true });
  expect(await checkForUpdates("0.2.0", send as unknown as typeof fetch)).toMatchObject({ newer: false });
  expect(send).toHaveBeenCalledTimes(2);
  const empty = vi.fn(async () => new Response("[]", { status: 200 }));
  expect(await checkForUpdates("0.1.0", empty as unknown as typeof fetch)).toMatchObject({ latest: null, newer: false });
  const down = vi.fn(async () => new Response("", { status: 503 }));
  await expect(checkForUpdates("0.1.0", down as unknown as typeof fetch)).rejects.toThrow(/503/);
});

test("the page may open a browser only to https on the project's own hosts", () => {
  expect(allowedExternal("https://everloot.app/upload")).toBe(true);
  expect(allowedExternal("https://github.com/Everloot/everloot/releases")).toBe(true);
  expect(allowedExternal("http://everloot.app/")).toBe(false);
  expect(allowedExternal("https://evil.example/everloot.app")).toBe(false);
  expect(allowedExternal("file:///C:/Windows")).toBe(false);
  expect(allowedExternal("not a url")).toBe(false);
});
