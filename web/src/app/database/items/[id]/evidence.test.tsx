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

test("the page says in short what players reported, and links the key to read the numbers", async () => {
  store.loadCorpus.mockResolvedValue({
    uploads: 3, dataAsOf: "2026-10-10T00:00:00.000Z",
    records: ["a", "b", "c"].map((i) => loot(`install-${i}`, 299, 2770)),
  });
  const page = await render("2770");
  expect(page).toContain("In short");
  expect(page).toContain("Players reported 1 drop source");
  expect(page).toContain("How to read these numbers");
  expect(page).toContain('href="/database#reading"');
  // The key lives on the database index, so an item page stays quiet about it.
  expect(page).not.toContain("Measured zero");
});

test("an item nobody reported says so rather than staying silent", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, dataAsOf: "2026-10-10T00:00:00.000Z", records: [] });
  const page = await render("2770");
  expect(page).toContain("No player has reported a drop source or a map position yet.");
  expect(page).toContain("It has no agreed name yet");
});
