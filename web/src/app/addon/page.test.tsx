import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { latestAddonRelease } from "@/lib/addon-release";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => <a href={href} className={className}>{children}</a>,
}));

import AddonPage from "./page";

const DL = "https://github.com/Everloot/everloot/releases/download";
const addon = latestAddonRelease()!;
const desktop = (name: string, size: number) => ({ name, size, digest: `sha256:${"b".repeat(64)}`, browser_download_url: `${DL}/desktop-v0.1.0/${name}` });
const releases = [
  {
    tag_name: "desktop-v0.1.0", html_url: "https://github.com/Everloot/everloot/releases/tag/desktop-v0.1.0", published_at: "2026-10-19T15:22:44Z", draft: false, prerelease: false,
    assets: [
      desktop("Everloot-DesktopApp-0.1.0-linux-x86_64.AppImage", 127995716),
      desktop("Everloot-DesktopApp-0.1.0-mac-arm64.dmg", 130617780),
      desktop("Everloot-DesktopApp-0.1.0-win-x64-portable.exe", 113085564),
      desktop("Everloot-DesktopApp-0.1.0-win-x64-setup.exe", 113304866),
      desktop("SHA256SUMS", 443),
    ],
  },
  {
    tag_name: `addon-v${addon.version}`, html_url: `https://github.com/Everloot/everloot/releases/tag/addon-v${addon.version}`, published_at: "2026-10-18T00:05:47Z", draft: false, prerelease: false,
    assets: [{ name: "SHA256SUMS", size: 85, digest: null, browser_download_url: `${DL}/addon-v${addon.version}/SHA256SUMS` }],
  },
];

const visible = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
async function render(answer: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(answer));
  return renderToStaticMarkup(await AddonPage());
}

afterEach(() => vi.unstubAllGlobals());

test("the addon and every desktop build are offered with version, date, size and checksum", async () => {
  const html = await render(() => Promise.resolve(Response.json(releases)));
  const text = visible(html);
  expect(html).toContain(`href="${addon.downloadPath}"`);
  expect(text).toContain(`Version ${addon.version}, beta, released 2026-10-18`);
  expect(text).toContain("Version 0.1.0, released 2026-10-19");
  for (const [label, size] of [["Windows installer", "108 MB"], ["Windows portable", "108 MB"], ["macOS disk image", "125 MB"], ["Linux AppImage", "122 MB"]]) {
    expect(text).toContain(`${label} (${size})`);
  }
  // Installer first, AppImage last, whatever order GitHub lists them in.
  expect(html.indexOf("win-x64-setup.exe")).toBeLessThan(html.indexOf("linux-x86_64.AppImage"));
  expect(html).toContain(`href="${DL}/desktop-v0.1.0/SHA256SUMS"`);
  expect(html).toContain(`href="${DL}/addon-v${addon.version}/SHA256SUMS"`);
  expect(html).toContain("b".repeat(64));
  // The addon's checksum is worked out from the zip the site serves.
  expect(html).toMatch(/<code[^>]*>[0-9a-f]{64}<\/code>/);
});

test("the page says the builds are unsigned and what Windows and macOS show", async () => {
  const text = visible(await render(() => Promise.resolve(Response.json(releases))));
  expect(text).toContain("not code-signed");
  expect(text).toContain("More info, then Run anyway");
  expect(text).toContain("Open Anyway");
});

test("install steps, the upload page, privacy, data policy and source are linked", async () => {
  const html = await render(() => Promise.resolve(Response.json(releases)));
  expect(visible(html)).toContain("Interface/AddOns");
  for (const href of ["/upload", "/privacy", "https://github.com/Everloot/everloot/blob/main/docs/DATA_POLICY.md", "https://github.com/Everloot/everloot/tree/main/addon", "https://github.com/Everloot/everloot/tree/main/desktop"]) {
    expect(html).toContain(`href="${href}"`);
  }
});

test("when GitHub cannot be read the addon still downloads and the app points at the releases page", async () => {
  const html = await render(() => Promise.reject(new Error("offline")));
  expect(html).toContain(`href="${addon.downloadPath}"`);
  expect(visible(html)).toContain("could not be loaded right now");
  expect(html).toContain('href="https://github.com/Everloot/everloot/releases"');
  expect(html).not.toContain("DesktopApp-");
});
