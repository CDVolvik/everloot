import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";

const store = vi.hoisted(() => ({ loadCorpus: vi.fn() }));
const github = vi.hoisted(() => ({ addonGithub: vi.fn() }));
vi.mock("@/lib/upload-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/upload-store")>()),
  uploadStore: { loadCorpus: store.loadCorpus },
}));
vi.mock("@/lib/addon-github", () => ({ addonGithub: github.addonGithub }));
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

import AddonProfilePage, { generateMetadata } from "./page";

let n = 0;
const seen = (installId: string, name: string, version?: string, loaded = true) => ({
  kind: "addon_seen", eventId: `${installId}:addon:${++n}`, installId, capturedAt: "2026-10-16T08:00:00.000Z", name, title: name, loaded,
  ...(version ? { version } : {}),
});
let version = 0;
const corpus = (records: unknown[]) => ({
  uploads: records.length, records, dataAsOf: new Date(Date.UTC(2026, 9, 17, 12, version++)).toISOString(),
});
const props = (name: string) => ({ params: Promise.resolve({ name }) });
const html = async (name: string) => renderToStaticMarkup(await AddonProfilePage(props(name)));

const okGithub = {
  status: "ok",
  data: {
    repo: "fitzforge/polestar", url: "https://github.com/fitzforge/polestar", license: "GPL-3.0", archived: false, openIssues: 4,
    release: { tag: "v0.2.4", name: null, date: "2026-10-14", url: "https://github.com/fitzforge/polestar/releases/tag/v0.2.4", notes: "Fixed arrows." },
    lastCommit: "2026-10-16", contributors: { count: 3, capped: false }, tree: [{ name: "Polestar", kind: "dir" }],
  },
};

beforeEach(() => {
  store.loadCorpus.mockReset();
  github.addonGithub.mockReset();
});

test("three installs show the counts, share and versions three agree on", async () => {
  store.loadCorpus.mockResolvedValue(corpus([
    ...["a", "b", "c"].map((id) => seen(id, "Questie", "9.1.0")),
    seen("a", "Questie", "9.2.0-mine"),
    seen("d", "Bagnon"),
  ]));
  const page = await html("Questie");
  expect(page).toContain("Installs reporting");
  expect(page).toContain("75%");
  expect(page).toContain("3 of 4 loaded it");
  expect(page).toContain("2026-10-16");
  expect(page).toContain("9.1.0");
  expect(page).not.toContain("9.2.0-mine");
});

test("two installs show no numbers, no name beyond the URL, and explain how to opt in", async () => {
  store.loadCorpus.mockResolvedValue(corpus([
    ...["a", "b", "c"].map((id) => seen(id, "Questie")),
    seen("a", "MyGuildTools", "1.0"), seen("b", "MyGuildTools", "1.0"),
  ]));
  const page = await html("MyGuildTools");
  expect(page).not.toContain("Installs reporting");
  expect(page).not.toContain("1.0");
  expect(page).toContain("once three installs report it");
  expect(page).toContain("/everloot addons on");
  expect(page).toContain('href="/upload"');
  // The same words as for a name nobody reported, so a page cannot confirm a two-install addon exists.
  const nobody = await html("NeverReported");
  expect(page.replaceAll("MyGuildTools", "X")).toBe(nobody.replaceAll("NeverReported", "X"));
});

test("a reported name that is not in the curated map says the repository is unknown and makes no GitHub call", async () => {
  store.loadCorpus.mockResolvedValue(corpus(["a", "b", "c"].map((id) => seen(id, "Questie"))));
  const page = await html("Questie");
  expect(page).toContain("does not know where this addon&#x27;s code is published");
  expect(github.addonGithub).not.toHaveBeenCalled();
});

test("a curated addon shows GitHub facts, author download links and plain links only", async () => {
  store.loadCorpus.mockResolvedValue(corpus(["a", "b", "c"].map((id) => seen(id, "Polestar", "0.2.4"))));
  github.addonGithub.mockResolvedValue(okGithub);
  const page = await html("Polestar");
  expect(github.addonGithub).toHaveBeenCalledWith("fitzforge/polestar");
  expect(page).toContain("GPL-3.0");
  expect(page).toContain("Fixed arrows.");
  expect(page).toContain('href="https://github.com/fitzforge/polestar/releases"');
  expect(page).toContain('href="https://www.curseforge.com/wow/addons/polestar-guides"');
  expect(page).toContain('href="/connect"');
  expect(page).toContain('href="/api/corpus/public"');
});

test("when GitHub cannot be reached the page still renders, says why, and keeps the download links", async () => {
  store.loadCorpus.mockResolvedValue(corpus(["a", "b", "c"].map((id) => seen(id, "Polestar"))));
  github.addonGithub.mockResolvedValue({ status: "unavailable", rateLimited: true });
  const limited = await html("Polestar");
  expect(limited).toContain("GitHub is limiting how often");
  expect(limited).toContain('href="https://github.com/fitzforge/polestar/releases"');
  github.addonGithub.mockResolvedValue({ status: "missing" });
  expect(await html("Polestar")).toContain("was not found on GitHub");
});

test("a curated addon below three installs still shows its repository, with the opt-in instead of numbers", async () => {
  store.loadCorpus.mockResolvedValue(corpus([seen("a", "Polestar")]));
  github.addonGithub.mockResolvedValue(okGithub);
  const page = await html("Polestar");
  expect(page).not.toContain("Installs reporting");
  expect(page).toContain("/everloot addons on");
  expect(page).toContain("GPL-3.0");
});

test("pages for names nobody reported three times or curated are noindex; known ones are indexed", async () => {
  store.loadCorpus.mockResolvedValue(corpus(["a", "b", "c"].map((id) => seen(id, "Questie"))));
  expect((await generateMetadata(props("Questie"))).robots).toBeUndefined();
  expect((await generateMetadata(props("Polestar"))).robots).toBeUndefined();
  expect((await generateMetadata(props("Whoever"))).robots).toEqual({ index: false, follow: true });
  expect((await generateMetadata(props("Questie"))).alternates?.canonical).toBe("/addons/Questie");
});

test("copy has no paid-plan or ad wording", async () => {
  store.loadCorpus.mockResolvedValue(corpus(["a", "b", "c"].map((id) => seen(id, "Questie"))));
  expect(await html("Questie")).not.toMatch(/premium|subscription|\bpaid\b|sponsor|\bads?\b|pricing/i);
});
