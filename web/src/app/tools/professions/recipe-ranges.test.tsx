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
  // One empty state stands for both the path and the ranges until a report arrives.
  expect(html).toContain("data-empty-state");
  expect(html).toContain("No recipe ranges for Alchemy yet");
});

test("three agreeing installs show the inferred range", async () => {
  store.loadCorpus.mockResolvedValue({
    uploads: 3, dataAsOf: "2026-10-10T00:00:00.000Z",
    records: [obs("install-aaaa", 50, "optimal"), obs("install-bbbb", 60, "medium"), obs("install-cccc", 55, "medium")],
  });
  expect(await render()).toContain("Lesser Healing Potion (Alchemy), 3 installs: yellow from 51-55");
});

test("agreed reagents priced by auction scans show a cost per craft", async () => {
  const ids = ["install-aaaa", "install-bbbb", "install-cccc"];
  const reagents = [{ item: "Peacebloom", count: 2 }];
  store.loadCorpus.mockResolvedValue({
    uploads: 3, dataAsOf: "2026-10-10T00:00:00.000Z",
    records: [
      ...ids.map((id, i) => ({ ...obs(id, 50 + i, "optimal"), reagents })),
      ...ids.flatMap((id) => [
        { kind: "auction_scan", installId: id, capturedAt: "2026-10-10T00:00:00.000Z", realm: "Forever", itemId: 2447, copper: 30, priceBasis: "unit" },
        { kind: "item_seen", installId: id, itemId: 2447, name: "Peacebloom" },
      ]),
    ],
  });
  expect(await render()).toContain("Reagents: 2 Peacebloom. Estimated cost per craft: 60c.");
});

test("the path on the page routes through steps derived from colours and trainer ranks", async () => {
  const ids = ["install-aaaa", "install-bbbb", "install-cccc"];
  const reagents = [{ item: "Peacebloom", count: 1 }];
  store.loadCorpus.mockResolvedValue({
    uploads: 3, dataAsOf: "2026-10-10T00:00:00.000Z",
    records: [
      { ...obs(ids[0], 1, "optimal"), reagents }, { ...obs(ids[1], 10, "optimal"), reagents }, { ...obs(ids[2], 12, "medium"), reagents },
      ...ids.map((id) => ({ kind: "trainer_seen", installId: id, profession: "Alchemy", recipe: "Lesser Healing Potion", requiredRank: 1 })),
    ],
  });
  const html = renderToStaticMarkup(await ProfessionsPage({ searchParams: Promise.resolve({ profession: "Alchemy", from: "1", to: "11" }) }));
  expect(html).toContain("1–11  Lesser Healing Potion  10 crafts × 1");
});
