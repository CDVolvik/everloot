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

import ItemPage from "./page";

let n = 0;
const loot = (installId: string, npcId: number, itemId: number) => ({
  kind: "loot", sourceEvidence: "loot-api", installId, eventId: `e:${n++}`, capturedAt: "2026-10-10T00:00:00.000Z",
  sourceNpcId: npcId, items: [{ itemId, count: 1 }],
});
const render = async (id: string) => renderToStaticMarkup(await ItemPage({ params: Promise.resolve({ id }) }));

beforeEach(() => store.loadCorpus.mockReset());

test("a reported item shows its Source in the quick facts, each label linking to a tab on the page", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 3, dataAsOf: "2026-10-10T00:00:00.000Z", records: ["a", "b", "c"].map((i) => loot(`install-${i}`, 299, 2770)) });
  const page = await render("2770");
  expect(page).toContain("Source");
  const link = page.match(/<a href="#([a-z-]+)"[^>]*>Drop<\/a>/);
  expect(link?.[1]).toBe("dropped-by");
  expect(page).toContain(`data-tab-panel="${link![1]}"`);
});

test("an item nobody has reported shows no Source row", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 3, dataAsOf: "2026-10-10T00:00:00.000Z", records: [loot("install-a", 299, 2770), loot("install-b", 299, 2770)] });
  const page = await render("2770");
  expect(page).not.toMatch(/<dt[^>]*>Source<\/dt>/);
});
