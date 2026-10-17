import { expect, test } from "vitest";
import { completionFactsFromRecords, completionProgress, handleCompletionProgress } from "../src/completion.js";
import { authorizeRecord, sharingCategory, type PublicationGrant } from "../src/publication.js";
import { mergeCorpus, namedRecord, publicRecords } from "../src/corpus.js";
import { parseRecords } from "../../web/src/lib/intake.js";

const OWNER = "owner-install";
const KEY = "0a1b2c3d";
const at = (n: number) => `2026-10-${String(10 + n).padStart(2, "0")}T00:00:00Z`;
let seq = 0;
const row = (installId: string, fields: Record<string, unknown>, capturedAt = at(1)) =>
  ({ installId, eventId: `e:${++seq}`, capturedAt, ...fields });

/** The same catalog entry reported by three installs, so it is public. */
const three = (fields: Record<string, unknown>) => ["reporter-one", "reporter-two", "reporter-three"].map((id) => row(id, fields));
const owned = (fields: Record<string, unknown>, capturedAt = at(1), key = KEY) =>
  row(OWNER, { characterKey: key, class: "MAGE", level: 40, ...fields }, capturedAt);

const catalog = [
  ...three({ kind: "achievement_catalog", achievementId: 1, name: "Explore Kalimdor", categoryId: 10, category: "Exploration", points: 10, criteriaCount: 4, criteria: [] }),
  ...three({ kind: "achievement_catalog", achievementId: 2, name: "Ten Quests", categoryId: 11, category: "Quests", points: 5, criteriaCount: 10, criteria: [] }),
  ...three({ kind: "achievement_catalog", achievementId: 3, name: "Gather Herbs", categoryId: 12, category: "Professions", points: 5, criteriaCount: 3, criteria: [] }),
  ...three({ kind: "reputation_catalog", factionId: 72, name: "Stormwind", header: "Alliance" }),
  ...three({ kind: "reputation_catalog", factionId: 69, name: "Darnassus", header: "Alliance" }),
  ...three({ kind: "reputation_catalog", factionId: 2000, name: "Renown Guild", major: true }),
  ...three({ kind: "title_catalog", titleId: 4, name: "Private" }),
  ...three({ kind: "title_catalog", titleId: 5, name: "Corporal" }),
  ...three({ kind: "quest_chain_catalog", questLineId: 900, name: "The Defias", questIds: [7, 8, 9, 10] }),
  ...three({ kind: "quest_chain_catalog", questLineId: 901, name: "Westfall", questIds: [20, 21] }),
];

const progress = [
  owned({ kind: "achievement_owned", achievementId: 1, completed: true, earnedByMe: true, earnedOn: "2026-09-30", criteriaMet: 4, criteriaTotal: 4 }),
  owned({ kind: "achievement_owned", achievementId: 2, completed: false, criteriaMet: 8, criteriaTotal: 10 }),
  owned({ kind: "achievement_owned", achievementId: 3, completed: false, criteriaMet: 1, criteriaTotal: 3 }),
  owned({ kind: "reputation_owned", factionId: 72, reaction: 8, standing: 42000, floor: 42000, ceiling: 42999 }),
  owned({ kind: "reputation_owned", factionId: 69, reaction: 5, standing: 8500, floor: 3000, ceiling: 9000 }),
  owned({ kind: "reputation_owned", factionId: 2000, reaction: 3, standing: 100, floor: 0, ceiling: 2500 }),
  owned({ kind: "title_owned", titleIds: [4] }),
  owned({ kind: "quest_owned", questIds: [7, 8, 9, 20, 21, 999] }),
];

const facts = () => completionFactsFromRecords([...catalog, ...progress]);

test("what is done and what is closest to done, per character", () => {
  const result = completionProgress(OWNER, undefined, facts());
  expect(result.listed).toEqual({ achievements: 3, factions: 3, titles: 2, chains: 2 });
  const [c] = result.characters;
  expect(c.characterKey).toBe(KEY);
  expect(c.achievements.done).toBe(1);
  expect(c.achievements.points).toBe(10);
  expect(c.achievements.closest.map((a) => a.name)).toEqual(["Ten Quests", "Gather Herbs"]);
  // A renown faction is not one of the eight standings, so it is neither counted nor ranked.
  expect(c.reputation).toMatchObject({ exalted: 1, total: 2 });
  expect(c.reputation.closest).toEqual([expect.objectContaining({ name: "Darnassus", standing: "Friendly", toNext: 500 })]);
  expect(c.titles).toMatchObject({ known: 1, total: 2 });
  expect(c.quests.completed).toBe(6);
  expect(c.quests.chainsDone).toBe(1);
  expect(c.quests.closest).toEqual([{ questLineId: 900, name: "The Defias", done: 3, total: 4 }]);
  expect(c.achievements.unlisted + c.titles.unlisted).toBe(0);
});

test("an entry nobody else reported, or reported differently, stays off the list", () => {
  const lonely = row("reporter-one", { kind: "title_catalog", titleId: 6, name: "Sergeant" });
  const split = ["reporter-one", "reporter-two", "reporter-three"].map((id, i) =>
    row(id, { kind: "title_catalog", titleId: 7, name: `Variant ${i}` }));
  const result = completionProgress(OWNER, undefined, completionFactsFromRecords([...catalog, lonely, ...split, ...progress]));
  expect(result.listed.titles).toBe(2);
});

test("the later row wins for an achievement, and an account-only completion is not done", () => {
  const later = [
    owned({ kind: "achievement_owned", achievementId: 2, completed: true, earnedByMe: true, earnedOn: "2026-10-20", criteriaMet: 10, criteriaTotal: 10 }, at(9)),
    owned({ kind: "achievement_owned", achievementId: 3, completed: true, earnedByMe: false, criteriaMet: 3, criteriaTotal: 3 }, at(9)),
  ];
  const [c] = completionProgress(OWNER, undefined, completionFactsFromRecords([...catalog, ...progress, ...later])).characters;
  expect(c.achievements.done).toBe(2);
  expect(c.achievements.closest).toEqual([]);
});

test("a character key narrows the answer, and an unknown key is said so", () => {
  const second = [owned({ kind: "title_owned", titleIds: [5] }, at(1), "ffffffff")];
  const all = completionFactsFromRecords([...catalog, ...progress, ...second]);
  expect(completionProgress(OWNER, undefined, all).characters.map((c) => c.characterKey)).toEqual([KEY, "ffffffff"]);
  expect(completionProgress(OWNER, "FFFFFFFF", all).characters.map((c) => c.characterKey)).toEqual(["ffffffff"]);
  expect(handleCompletionProgress({ ownerInstallId: OWNER, characterKey: "12345678" }, all)).toContain("No character 12345678");
});

test("an install with no upload is unrecorded, not zero, and a blank install is refused", () => {
  const text = handleCompletionProgress({ ownerInstallId: "stranger-install" }, facts());
  expect(text).toContain("unrecorded, not zero");
  expect(text).toContain("/everloot completion on");
  expect(handleCompletionProgress({ ownerInstallId: " " })).toBe("Name the install.");
});

test("owned rows with no agreed list say the lists are unrecorded", () => {
  const text = handleCompletionProgress({ ownerInstallId: OWNER }, completionFactsFor(progress));
  expect(text).toContain("Lists unrecorded");
  expect(text).toContain("Achievements: 0 of 0 done");
});

function completionFactsFor(records: object[]) {
  return completionFactsFromRecords(records);
}

test("another install's progress is never read for this install", () => {
  const other = [owned({ kind: "title_owned", titleIds: [4, 5] })].map((r) => ({ ...r, installId: "someone-else" }));
  const text = handleCompletionProgress({ ownerInstallId: "someone-else-2" }, completionFactsFor([...catalog, ...progress, ...other]));
  expect(text).toContain("unrecorded, not zero");
});

test("the text answer carries the closest lines", () => {
  const text = handleCompletionProgress({ ownerInstallId: OWNER }, facts());
  expect(text).toContain("Ten Quests (Quests): 8 of 10 criteria");
  expect(text).toContain("Darnassus: Friendly, 500 to the next standing");
  expect(text).toContain("The Defias: 3 of 4 quests");
});

// --- who may see owned rows -------------------------------------------------------------------

const hash = "a".repeat(64);
const grant: PublicationGrant = { tokenHash: hash, installId: OWNER, realm: "Forever", subjectType: "install", subject: OWNER,
  categories: ["collection"], expiresAt: "2026-11-30T00:00:00Z", verifiedBy: "operator", evidence: "test", revokedAt: null };
const now = new Date("2026-10-15T00:00:00Z");

test("owned progress is named data in the collection category, like collection_owned", () => {
  const parsed = parseRecords([...catalog, ...progress]);
  expect(parsed.receipt.rejected).toEqual([]);
  for (const r of parsed.records) {
    const isOwned = r.kind.endsWith("_owned");
    expect(namedRecord(r), r.kind).toBe(isOwned);
    expect(sharingCategory(r), r.kind).toBe(isOwned ? "collection" : null);
  }
});

test("without a live install grant the corpus serves the catalogs and not the progress", () => {
  const state = mergeCorpus(undefined, [...catalog, ...progress]);
  const served = publicRecords(state, (r, grants) => authorizeRecord(r, grants, { grants: [grant], suppressions: [] }, now));
  expect(served.filter((r) => r.kind.endsWith("_owned"))).toEqual([]);
  expect(served.filter((r) => r.kind.endsWith("_catalog"))).toHaveLength(catalog.length);
  const granted = mergeCorpus(undefined, progress, [hash]);
  const own = publicRecords(granted, (r, grants) => authorizeRecord(r, grants, { grants: [grant], suppressions: [] }, now));
  expect(own).toHaveLength(progress.length);
  const wrongInstall = publicRecords(granted, (r, grants) => authorizeRecord(r, grants, { grants: [{ ...grant, installId: "other-install" }], suppressions: [] }, now));
  expect(wrongInstall).toEqual([]);
  const expired = publicRecords(granted, (r, grants) => authorizeRecord(r, grants, { grants: [{ ...grant, expiresAt: "2026-10-01T00:00:00Z" }], suppressions: [] }, now));
  expect(expired).toEqual([]);
});
