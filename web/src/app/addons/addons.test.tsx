import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";

const github = vi.hoisted(() => ({ polestarLive: vi.fn() }));
vi.mock("@/lib/polestar-github", () => github);
vi.mock("@/components/AccountControls", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

import AddonsPage, { metadata as addonsMeta } from "./page";
import PolestarPage, { metadata as polestarMeta } from "./polestar/page";
import PacksPage, { metadata as packsMeta } from "./polestar/packs/page";
import WantedPage, { metadata as wantedMeta } from "./polestar/wanted/page";
import sitemap from "../sitemap";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

const html = async (page: () => ReactNode | Promise<ReactNode>) => renderToStaticMarkup(await page());

beforeEach(() => { github.polestarLive.mockReset().mockResolvedValue(null); vi.unstubAllEnvs(); });

test("/addons lists Everloot's addon and Polestar, and says Polestar is independent", async () => {
  const page = await html(AddonsPage);
  expect(page).toContain('href="/addons/polestar"');
  expect(page).toContain('href="/upload"');
  expect(page).toContain("not part of it");
  expect(addonsMeta.alternates?.canonical).toBe("/addons");
});

test("/addons links to the leaderboard of addons players run", async () => {
  expect(await html(AddonsPage)).toContain('href="/addons/popular"');
});

test("at build, the Polestar page renders every static fact with GitHub down", async () => {
  vi.stubEnv("NEXT_PHASE", "phase-production-build");
  const page = await html(PolestarPage);
  for (const text of [
    "https://www.curseforge.com/wow/addons/polestar-guides", "https://github.com/fitzforge/polestar/releases",
    "https://discord.gg/vMbee6F2e9", "/polestar packs", "LICENSE-EXCEPTION.md",
    'href="/addons/polestar/packs"', 'href="/addons/polestar/wanted"', "author%3ACDVolvik",
    "Live details from GitHub are unavailable right now",
  ]) expect(page).toContain(text);
  expect(polestarMeta.alternates?.canonical).toBe("/addons/polestar");
});

test("the Polestar page shows the live release and help-wanted issues when GitHub answers", async () => {
  github.polestarLive.mockResolvedValue({
    release: { tag: "v0.2.3", date: "2026-10-14", url: "https://github.com/fitzforge/polestar/releases/tag/v0.2.3" },
    openIssues: 40, bugReports: 12,
    helpWanted: [{ number: 10, title: "Navigation: help us map caves", url: "https://github.com/fitzforge/polestar/issues/10" }],
  });
  const page = await html(PolestarPage);
  expect(page).toContain("v0.2.3");
  expect(page).toContain("2026-10-14");
  expect(page).toContain("Navigation: help us map caves");
  expect(page).toContain("12 open bug reports");
  expect(page).toContain("label%3Abug");
  expect(page).not.toContain("unavailable right now");
});

test("after the build, a failed GitHub refresh throws so the cache keeps the last good page", async () => {
  await expect(PolestarPage()).rejects.toThrow("keep the last good page");
});

test("counts of one read in the singular", async () => {
  github.polestarLive.mockResolvedValue({
    release: { tag: "v0.2.3", date: "2026-10-14", url: "https://github.com/fitzforge/polestar/releases/tag/v0.2.3" },
    openIssues: 1, bugReports: 1, helpWanted: [],
  });
  const page = await html(PolestarPage);
  expect(page).toContain("1 open bug report</a>");
  expect(page).toContain("1 open issue in all");
});

test("the packs page lists Polestar Guides with its manifest fields and the independence notice", async () => {
  const page = await html(PacksPage);
  for (const text of ["Polestar Guides", "GPL-3.0-only", "Polestar_Guides", "neither Polestar nor Everloot", "mailto:hello@everloot.app"]) {
    expect(page).toContain(text);
  }
  expect(packsMeta.alternates?.canonical).toBe("/addons/polestar/packs");
});

test("the wanted page cites a reason for each idea and links the pack handbook", async () => {
  const page = await html(WantedPage);
  expect(page).toContain("solo");
  expect(page).toContain("https://github.com/fitzforge/polestar/blob/next/docs/PACKS.md");
  expect(page).toContain("polestar new");
  expect(page).toContain("https://github.com/fitzforge/polestar/issues/10");
  expect(wantedMeta.alternates?.canonical).toBe("/addons/polestar/wanted");
});

test("the sitemap, header and footer reach the addons pages", async () => {
  const urls = (await sitemap()).map((entry) => new URL(entry.url).pathname);
  for (const path of ["/addons", "/addons/popular", "/addons/polestar", "/addons/polestar/packs", "/addons/polestar/wanted"]) expect(urls).toContain(path);
  expect(renderToStaticMarkup(<Header />)).toContain('href="/addons"');
  expect(renderToStaticMarkup(<Footer />)).toContain('href="/addons"');
});
