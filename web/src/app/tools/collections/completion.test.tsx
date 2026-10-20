import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";

const store = vi.hoisted(() => ({ loadCorpus: vi.fn(), loadCompletion: vi.fn(), loadState: vi.fn() }));
vi.mock("@/lib/upload-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/upload-store")>()),
  uploadStore: { loadCorpus: store.loadCorpus, loadCompletion: store.loadCompletion },
  sharingStore: { loadState: store.loadState },
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

import CollectionsPage from "./page";
import { emptyCompletion, foldCompletion } from "../../../../../kb/src/completion-rollup";
import type { PublicationGrant } from "../../../../../kb/src/publication";

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

const hash = "a".repeat(64);
const grant: PublicationGrant = { tokenHash: hash, installId: "owner-install", realm: "Forever", subjectType: "install", subject: "owner-install",
  categories: ["collection"], expiresAt: "2099-01-01T00:00:00Z", verifiedBy: "operator", evidence: "test", revokedAt: null };
/** The cron's completion rollup of these rows, uploaded with the owner's sharing token. */
const rollup = (rows: Record<string, unknown>[]) => foldCompletion(emptyCompletion(), [{ records: rows, grants: [hash] }]);

beforeEach(() => {
  store.loadCorpus.mockReset().mockResolvedValue({ uploads: 1, records: [], dataAsOf: "2026-10-19T06:30:00.000Z" });
  store.loadCompletion.mockReset().mockResolvedValue({ state: rollup(records), dataAsOf: "2026-10-19T06:30:00.000Z" });
  store.loadState.mockReset().mockResolvedValue({ grants: [grant], suppressions: [] });
});

test("with no install the page asks for one and says nothing is measured", async () => {
  const html = await render({});
  expect(html).toContain("Enter an install id");
  expect(html).not.toContain('role="progressbar"');
  // No collection upload exists yet, so the gap box is the empty state rather than a prompt.
  expect(html).toContain("No collection list yet");
  expect(html).toContain("data-empty-state");
});

test("once collection lists exist, the gap box asks for a collection", async () => {
  store.loadCorpus.mockResolvedValue({
    uploads: 3, dataAsOf: null,
    records: three({ kind: "collection_catalog", collection: "Mounts", itemId: 1, source: "Vendor" }),
  });
  expect(await render({})).toContain("Name a collection.");
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
  store.loadCompletion.mockResolvedValue({ state: rollup(records.filter((r) => String(r.kind).endsWith("_owned"))), dataAsOf: null });
  store.loadCorpus.mockResolvedValue({ uploads: 1, records: [], dataAsOf: null });
  const html = await render({ install: "owner-install" });
  expect(html).toContain("No list is public yet");
  expect(html).toContain("Data age unrecorded");
});

test("an unreachable store is said to be unreachable", async () => {
  store.loadCorpus.mockResolvedValue({ unreachable: true, uploads: 0, records: [] });
  store.loadCompletion.mockResolvedValue({ state: null, dataAsOf: null, unreachable: true });
  const html = await render({ install: "owner-install" });
  expect(html).not.toContain('role="progressbar"');
  expect(html).toMatch(/unreachable|unavailable|could not/i);
});

test("two installs agreeing is not enough: the lists stay unpublished", async () => {
  store.loadCompletion.mockResolvedValue({ state: rollup(records.filter((r) => r.installId !== "reporter-three")), dataAsOf: null });
  const html = await render({ install: "owner-install" });
  expect(html).toContain("No list is public yet");
  expect(html).not.toContain("Ten Quests");
  expect(html).not.toContain("Darnassus");
});

test("without a live grant the owner's progress is not shown", async () => {
  store.loadState.mockResolvedValue({ grants: [{ ...grant, revokedAt: "2026-10-18T00:00:00Z" }], suppressions: [] });
  const html = await render({ install: "owner-install" });
  expect(html).toContain("No completion data from this install");
  expect(html).not.toContain("Friendly · 500 to go");
});

test("without an install the page does not read the completion rollup", async () => {
  await render({ collection: "Mounts" });
  expect(store.loadCompletion).not.toHaveBeenCalled();
});

test("when older characters gave way the page says so, instead of acting as if they never uploaded", async () => {
  const keys = Array.from({ length: 9 }, (_, i) => `0000000${i}`);
  const state = foldCompletion(emptyCompletion(), keys.map((characterKey, i) => ({
    records: [{ ...mine({ kind: "title_owned", titleIds: [4] }), characterKey, capturedAt: `2026-10-0${i + 1}T00:00:00Z` }], grants: [hash],
  })));
  store.loadCompletion.mockResolvedValue({ state, dataAsOf: null });
  const html = await render({ install: "owner-install" });
  expect(html).toContain("1 older character is no longer kept for this install");
  expect(html).not.toContain("key 00000000");
});
