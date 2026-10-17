import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, expect, test, vi } from "vitest";
import { buildLoreRelease } from "@/test/lore-release";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

let release = "";
beforeAll(async () => { release = await buildLoreRelease(); });
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.restoreAllMocks(); });

async function render(path = release) {
  vi.stubEnv("KB_SNAPSHOT_PATH", path);
  const { default: LoreLanding } = await import("./page");
  return renderToStaticMarkup(await LoreLanding());
}

test("the landing page states the archive's size, date, licence and notice from the manifest", async () => {
  const html = await render();
  expect(html).toContain("30 pages");
  expect(html).not.toContain("31 pages");
  expect(html).not.toContain("32 pages");
  expect(html).toContain("13 November 2023");
  expect(html).toContain("CC BY-SA 4.0");
  expect(html).toContain("Data licensed CC BY-SA 4.0.");
  expect(html).toContain('name="q"');
  expect(html).toContain("predates WoW: Forever");
  expect(html).toContain('href="/database"');
  expect(html).toContain('href="/lore/npcs"');
  expect(html).toContain('href="/lore/coverage"');
});

test("the landing page is indexed with its canonical", async () => {
  vi.stubEnv("KB_SNAPSHOT_PATH", release);
  const { metadata } = await import("./page");
  expect(metadata.alternates).toMatchObject({ canonical: "/lore" });
  expect(metadata.openGraph).toMatchObject({ title: "Lore archive · Everloot", url: "/lore" });
  expect(metadata.twitter).toMatchObject({ card: "summary_large_image", title: "Lore archive · Everloot" });
  expect(metadata.robots ?? { index: true }).toMatchObject({ index: true });
});

test("an unavailable release renders the unavailable copy, not a zero", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const html = await render(join(tmpdir(), "missing.sqlite"));
  expect(html).toContain("Lore archive unavailable");
  expect(html).not.toContain("0 pages");
});
