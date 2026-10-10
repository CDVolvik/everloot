import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";

const store = vi.hoisted(() => ({ loadCorpus: vi.fn() }));
vi.mock("@/lib/upload-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/upload-store")>()),
  uploadStore: { loadCorpus: store.loadCorpus },
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/EmailCapture", () => ({ default: () => null }));

import ProfessionsPage from "./page";

const obs = (installId: string, rank: number, difficulty: string) => ({
  kind: "recipe_observed", eventId: `${installId}:${rank}`, installId, capturedAt: "2026-10-10T00:00:00.000Z",
  profession: "Alchemy", recipe: "Lesser Healing Potion", rank, difficulty, reagents: [],
});
const render = async (profession = "Alchemy") =>
  renderToStaticMarkup(await ProfessionsPage({ searchParams: Promise.resolve({ profession }) }));

beforeEach(() => store.loadCorpus.mockReset());

test("with no observations the page says ranges are unrecorded, not zero", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 0, records: [], dataAsOf: "2026-10-10T00:00:00.000Z" });
  const html = await render();
  expect(html).toContain("Recipe skill ranges");
  expect(html).toContain("No recipe ranges for Alchemy yet");
});

test("three agreeing installs show the inferred range", async () => {
  store.loadCorpus.mockResolvedValue({
    uploads: 3, dataAsOf: "2026-10-10T00:00:00.000Z",
    records: [obs("install-aaaa", 50, "optimal"), obs("install-bbbb", 60, "medium"), obs("install-cccc", 55, "medium")],
  });
  expect(await render()).toContain("Lesser Healing Potion (Alchemy), 3 installs: yellow from 51-55");
});
