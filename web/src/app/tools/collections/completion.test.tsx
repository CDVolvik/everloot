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

import CollectionsPage from "./page";

const at = "2026-10-19T00:00:00Z";
let seq = 0;
const row = (installId: string, fields: Record<string, unknown>): Record<string, unknown> => ({ installId, eventId: `e:${++seq}`, capturedAt: at, ...fields });
const three = (fields: Record<string, unknown>) => ["reporter-one", "reporter-two", "reporter-three"].map((id) => row(id, fields));
const mine = (fields: Record<string, unknown>) => row("owner-install", { characterKey: "0a1b2c3d", class: "MAGE", level: 40, ...fields });

const records = [
  ...three({ kind: "achievement_catalog", achievementId: 1, name: "Ten Quests", categoryId: 2, category: "Quests", points: 5, criteriaCount: 10, criteria: [] }),
  ...three({ kind: "reputation_catalog", factionId: 69, name: "Darnassus", header: "Alliance" }),
  ...three({ kind: "title_catalog", titleId: 4, name: "Private" }),
  ...three({ kind: "quest_chain_catalog", questLineId: 900, name: "The Defias", questIds: [7, 8, 9, 10] }),
  mine({ kind: "achievement_owned", achievementId: 1, completed: false, criteriaMet: 8, criteriaTotal: 10 }),
  mine({ kind: "reputation_owned", factionId: 69, reaction: 5, standing: 8500, floor: 3000, ceiling: 9000 }),
  mine({ kind: "title_owned", titleIds: [4] }),
  mine({ kind: "quest_owned", questIds: [7, 8, 9] }),
];

const render = async (searchParams: Record<string, string>) =>
  renderToStaticMarkup(await CollectionsPage({ searchParams: Promise.resolve(searchParams) }));

beforeEach(() => {
  store.loadCorpus.mockReset().mockResolvedValue({ uploads: 1, records, dataAsOf: "2026-10-19T06:30:00.000Z" });
});

test("with no install the page asks for one and says nothing is measured", async () => {
  const html = await render({});
  expect(html).toContain("Enter an install id");
  expect(html).not.toContain('role="progressbar"');
  expect(html).toContain("Name a collection.");
});

test("an install that uploaded no completion data gets an honest empty state, not zeros", async () => {
  const html = await render({ install: "stranger-install" });
  expect(html).toContain("No completion data from this install");
  expect(html).toContain("unrecorded, not zero");
  expect(html).toContain("/everloot completion on");
  expect(html).not.toContain('role="progressbar"');
  expect(html).not.toContain("Name a collection.");
});

test("a character shows what is done and what is closest to done", async () => {
  const html = await render({ install: "owner-install" });
  expect(html).toContain("Mage");
  expect(html).toContain("key 0a1b2c3d");
  expect(html).toContain("Achievements closest to done");
  expect(html).toContain("Ten Quests");
  expect(html).toContain("Quests · 8 of 10 criteria");
  expect(html).toContain("Darnassus");
  expect(html).toContain("Friendly · 500 to go");
  expect(html).toContain("The Defias");
  expect(html).toContain("3 of 4 quests");
  expect(html).toContain('aria-label="Titles"');
  expect(html.match(/role="progressbar"/g)).toHaveLength(4);
  expect(html).toContain("Data as of 2026-10-19 06:30 UTC");
});

test("a character key that is not in the upload is named, and the collection box still works", async () => {
  expect(await render({ install: "owner-install", character: "ffffffff" })).toContain("No character ffffffff");
  expect(await render({ install: "owner-install", collection: "Mounts" })).toContain("Collection gap");
});

test("when the lists are not public yet the page says so instead of showing a measured zero", async () => {
  store.loadCorpus.mockResolvedValue({ uploads: 1, records: records.filter((r) => String(r.kind).endsWith("_owned")), dataAsOf: null });
  const html = await render({ install: "owner-install" });
  expect(html).toContain("No list is public yet");
  expect(html).toContain("Data age unrecorded");
});

test("an unreachable store is said to be unreachable", async () => {
  store.loadCorpus.mockResolvedValue({ unreachable: true, uploads: 0, records: [] });
  const html = await render({ install: "owner-install" });
  expect(html).not.toContain('role="progressbar"');
  expect(html).toMatch(/unreachable|unavailable|could not/i);
});
