import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";

const store = vi.hoisted(() => ({ loadCorpus: vi.fn() }));
vi.mock("@/lib/upload-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/upload-store")>()),
  uploadStore: { loadCorpus: store.loadCorpus },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

import DatabasePage from "./page";
import DropsPage from "./drops/page";

const loot = (install: string, npc: number, items: { itemId: number; count: number }[], n: number) => ({
  kind: "loot", eventId: `${install}:${npc}:${n}`, installId: install, capturedAt: "2026-10-09T00:00:00.000Z",
  sourceNpcId: npc, sourceEvidence: "loot-api", items,
});
const html = async (page: () => Promise<ReactNode>) => renderToStaticMarkup(await page());

beforeEach(() => store.loadCorpus.mockReset());

test("unreadable storage reads unrecorded, never zero", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [], unreachable: true });
  const drops = await html(DropsPage);
  expect(drops).toContain("Storage unreachable");
  expect(drops).not.toContain("0 windows");
  expect(drops).not.toContain("<table");
  const db = await html(DatabasePage);
  expect(db).toContain("unrecorded");
  expect(db).not.toMatch(/>0<\/div>/);
});

test("the database page points to the lore archive and says it is not collected Forever data", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [], dataAsOf: "2026-10-09T00:00:00.000Z" });
  const db = await html(DatabasePage);
  expect(db).toContain('href="/lore"');
  expect(db).toContain("not collected Forever data");
});

test("an empty readable corpus says nothing is public yet", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [], dataAsOf: "2026-10-09T00:00:00.000Z" });
  const drops = await html(DropsPage);
  expect(drops).toContain("0 windows · 0 public frequencies");
  expect(drops).toContain("No public frequencies yet");
});

test("three installs with empty windows publish a measured zero; two installs publish nothing", async () => {
  store.loadCorpus.mockResolvedValue({
    uploads: 5,
    records: [
      loot("install-aaa", 42, [], 1), loot("install-bbb", 42, [], 1), loot("install-ccc", 42, [], 1),
      loot("install-aaa", 77, [{ itemId: 9, count: 1 }], 1), loot("install-bbb", 77, [{ itemId: 9, count: 1 }], 1),
    ],
  });
  const drops = await html(DropsPage);
  expect(drops).toContain("No items observed");
  expect(drops).toContain("NPC 42");
  expect(drops).not.toContain("NPC 77");
  expect(drops).not.toContain("Item 9");
});
