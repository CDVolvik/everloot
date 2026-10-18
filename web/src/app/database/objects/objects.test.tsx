import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";

const store = vi.hoisted(() => ({ loadCorpus: vi.fn() }));
vi.mock("@/lib/upload-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/upload-store")>()),
  uploadStore: { loadCorpus: store.loadCorpus },
}));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, useRouter: () => ({ push: () => {} }) }));

import ObjectPage, { generateMetadata } from "./[id]/page";
import ObjectsPage from "./page";
import ItemPage from "../items/[id]/page";

let n = 0;
const loot = (installId: string, objectId: number, items: number[]) => ({
  kind: "loot", sourceEvidence: "loot-api", installId, eventId: `e:${n++}`, capturedAt: "2026-10-10T00:00:00.000Z",
  sourceObjectId: objectId, items: items.map((itemId) => ({ itemId, count: 1 })),
});
const corpus = (records: unknown[]) => ({ uploads: 3, records, dataAsOf: `2026-10-10T00:00:${String(n++ % 60).padStart(2, "0")}.000Z` });
const html = async (el: Promise<ReactNode>) => renderToStaticMarkup(await el);
const props = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => store.loadCorpus.mockReset());

test("an object with loot from 3 installs lists its drops; the list page links it; item pages link back", async () => {
  store.loadCorpus.mockResolvedValue(corpus([loot("install-a", 1731, [2770]), loot("install-b", 1731, [2770]), loot("install-c", 1731, [])]));
  const page = await html(ObjectPage(props("1731")));
  expect(page).toContain("Object 1731");
  expect(page).toContain('href="/database/items/2770"');
  expect(page).toContain("66.7%");
  expect((await generateMetadata(props("1731"))).robots).toMatchObject({ index: true });
  expect(await html(ObjectsPage())).toContain('href="/database/objects/1731"');
  expect(await html(ItemPage({ params: Promise.resolve({ id: "2770" }) }))).toContain('href="/database/objects/1731"');
});

test("two installs are not enough; storage down reads unavailable, never zero", async () => {
  store.loadCorpus.mockResolvedValue(corpus([loot("install-a", 1618, [765]), loot("install-b", 1618, [765])]));
  const queued = await html(ObjectPage(props("1618")));
  expect(queued).toContain("Observed, not yet public");
  expect(queued).not.toContain("<table");
  expect((await generateMetadata(props("1618"))).robots).toMatchObject({ index: false });
  expect(await html(ObjectsPage())).toContain("No object has public loot observations yet");
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [], unreachable: true });
  const down = await html(ObjectPage(props("1731")));
  expect(down).not.toContain("0 items");
  await expect(html(ObjectPage(props("chest")))).rejects.toThrow("NEXT_NOT_FOUND");
});
