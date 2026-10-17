/**
 * Completion progress for one character: achievements, reputation, titles and quest chains.
 * A catalog entry is public after 3 installs report the identical entry. Owned is what one install's
 * character uploaded, and the corpus only serves it when that install granted the "collection" choice.
 * Missing is the agreed list minus what that character has. No Blizzard profile, no copied catalog.
 */
import { parseRecords, type IntakeRecord } from "../../web/src/lib/intake.js";
import { canonicalJson } from "./corpus.js";

export const COMPLETION_AGREEMENT = 3;
export const CLOSEST_LIMIT = 5;

type Kind<K extends IntakeRecord["kind"]> = Extract<IntakeRecord, { kind: K }>;
export type AchievementCatalogRow = Kind<"achievement_catalog">;
export type ReputationCatalogRow = Kind<"reputation_catalog">;
export type TitleCatalogRow = Kind<"title_catalog">;
export type QuestChainCatalogRow = Kind<"quest_chain_catalog">;
type OwnedRow = Kind<"achievement_owned"> | Kind<"reputation_owned"> | Kind<"title_owned"> | Kind<"quest_owned">;

export type CompletionFacts = {
  achievements: AchievementCatalogRow[];
  factions: ReputationCatalogRow[];
  titles: TitleCatalogRow[];
  chains: QuestChainCatalogRow[];
  owned: OwnedRow[];
};

const OWNED_KINDS = new Set(["achievement_owned", "reputation_owned", "title_owned", "quest_owned"]);
const KINDS = new Set(["achievement_catalog", "reputation_catalog", "title_catalog", "quest_chain_catalog", ...OWNED_KINDS]);
const EMPTY_FACTS: CompletionFacts = { achievements: [], factions: [], titles: [], chains: [], owned: [] };

/** The usual eight standings, by the client's reaction index. Index 8 is the top one. */
export const STANDING_NAMES = ["Hated", "Hostile", "Unfriendly", "Neutral", "Friendly", "Honored", "Revered", "Exalted"] as const;
const TOP_REACTION = STANDING_NAMES.length;

export function completionFactsFromRecords(records: unknown[]): CompletionFacts {
  const facts: CompletionFacts = { achievements: [], factions: [], titles: [], chains: [], owned: [] };
  // The page and the tool pass the whole corpus: parse only the kinds this reads.
  const mine = records.filter((r) => typeof r === "object" && r !== null && KINDS.has((r as { kind?: string }).kind ?? ""));
  for (const row of parseRecords(mine).records) {
    if (row.kind === "achievement_catalog") facts.achievements.push(row);
    else if (row.kind === "reputation_catalog") facts.factions.push(row);
    else if (row.kind === "title_catalog") facts.titles.push(row);
    else if (row.kind === "quest_chain_catalog") facts.chains.push(row);
    else if (OWNED_KINDS.has(row.kind)) facts.owned.push(row as OwnedRow);
  }
  return facts;
}

/** Everything a row says except who said it and when: two installs agree when this text is equal. */
function content(row: { installId: string; capturedAt: string; eventId?: string }): string {
  const { installId: _i, capturedAt: _c, eventId: _e, ...rest } = row;
  return canonicalJson(rest);
}

/** One entry per id: the variant that at least 3 distinct installs reported identically (most installs wins). */
function agreed<T extends { installId: string; capturedAt: string; eventId?: string }>(rows: T[], id: (row: T) => number): Map<number, T> {
  const variants = new Map<number, Map<string, { row: T; installs: Set<string> }>>();
  for (const row of rows) {
    const key = id(row);
    const byContent = variants.get(key) ?? new Map<string, { row: T; installs: Set<string> }>();
    const text = content(row);
    const entry = byContent.get(text) ?? { row, installs: new Set<string>() };
    entry.installs.add(row.installId.trim());
    byContent.set(text, entry);
    variants.set(key, byContent);
  }
  const out = new Map<number, T>();
  for (const [key, byContent] of variants) {
    const best = [...byContent.entries()]
      .filter(([, v]) => v.installs.size >= COMPLETION_AGREEMENT)
      .sort(([ta, a], [tb, b]) => b.installs.size - a.installs.size || ta.localeCompare(tb))[0];
    if (best) out.set(key, best[1].row);
  }
  return out;
}

/** The later of two rows by capture time; the larger event id breaks a tie. */
function newer<T extends { capturedAt: string; eventId?: string }>(a: T, b: T): T {
  const order = a.capturedAt.localeCompare(b.capturedAt) || (a.eventId ?? "").localeCompare(b.eventId ?? "");
  return order > 0 ? a : b;
}

export type ClosestAchievement = { achievementId: number; name: string; category: string; met: number; total: number };
export type ClosestFaction = { factionId: number; name: string; standing: string; toNext: number; header?: string };
export type ClosestChain = { questLineId: number; name: string; done: number; total: number };

export type CharacterProgress = {
  characterKey: string;
  class: string;
  level: number;
  achievements: { done: number; total: number; points: number; pointsTotal: number; closest: ClosestAchievement[]; unlisted: number };
  reputation: { exalted: number; total: number; closest: ClosestFaction[]; unlisted: number };
  titles: { known: number; total: number; unlisted: number };
  quests: { completed: number; chainsDone: number; chainsTotal: number; closest: ClosestChain[] };
};

export type CompletionProgress = {
  ownerInstallId: string;
  /** What the agreed lists hold. All zero means no list is public yet. */
  listed: { achievements: number; factions: number; titles: number; chains: number };
  /** False when this install uploaded no completion rows: owned is unknown, not empty. */
  ownedRecorded: boolean;
  characters: CharacterProgress[];
  /** The character key that was asked for and not found. */
  unknownCharacter?: string;
};

export function completionProgress(ownerInstallId: string, characterKey: string | undefined, facts: CompletionFacts): CompletionProgress {
  const owner = ownerInstallId.trim();
  const wantedKey = characterKey?.trim().toLowerCase() || undefined;
  const achievements = agreed(facts.achievements, (r) => r.achievementId);
  const factions = agreed(facts.factions, (r) => r.factionId);
  const titles = agreed(facts.titles, (r) => r.titleId);
  const chains = agreed(facts.chains, (r) => r.questLineId);

  const mine = facts.owned.filter((r) => r.installId.trim() === owner);
  const keys = [...new Set(mine.map((r) => r.characterKey))].sort();
  const characters: CharacterProgress[] = [];
  for (const key of keys) {
    if (wantedKey && key !== wantedKey) continue;
    const rows = mine.filter((r) => r.characterKey === key);
    const latestOwned = new Map<string, OwnedRow>();
    const titleIds = new Set<number>();
    const questIds = new Set<number>();
    let identity = rows[0];
    for (const row of rows) {
      identity = newer(identity, row);
      if (row.kind === "title_owned") row.titleIds.forEach((id) => titleIds.add(id));
      else if (row.kind === "quest_owned") row.questIds.forEach((id) => questIds.add(id));
      else {
        const id = row.kind === "achievement_owned" ? `a${row.achievementId}` : `f${row.factionId}`;
        const old = latestOwned.get(id);
        latestOwned.set(id, old ? newer(old, row) : row);
      }
    }

    const doneAchievements = new Set<number>();
    const closestAchievements: ClosestAchievement[] = [];
    let unlistedAchievements = 0;
    let earnedPoints = 0;
    for (const row of latestOwned.values()) {
      if (row.kind !== "achievement_owned") continue;
      const entry = achievements.get(row.achievementId);
      const done = row.completed && row.earnedByMe !== false;
      if (done) doneAchievements.add(row.achievementId);
      if (!entry) { if (done) unlistedAchievements++; continue; }
      if (done) { earnedPoints += entry.points; continue; }
      // Complete on the account but not earned by this character: nothing left to progress here.
      if (!row.completed && row.criteriaTotal > 0 && row.criteriaMet > 0) {
        closestAchievements.push({ achievementId: row.achievementId, name: entry.name, category: entry.category, met: row.criteriaMet, total: row.criteriaTotal });
      }
    }
    closestAchievements.sort((a, b) => b.met / b.total - a.met / a.total || (a.total - a.met) - (b.total - b.met) || a.achievementId - b.achievementId);

    const plainFactions = [...factions.values()].filter((f) => !f.major);
    const closestFactions: ClosestFaction[] = [];
    let exalted = 0;
    let unlistedFactions = 0;
    for (const row of latestOwned.values()) {
      if (row.kind !== "reputation_owned") continue;
      const entry = factions.get(row.factionId);
      if (!entry) { if (row.reaction >= TOP_REACTION) unlistedFactions++; continue; }
      if (entry.major) continue;
      if (row.reaction >= TOP_REACTION) { exalted++; continue; }
      if (row.ceiling > row.standing) {
        closestFactions.push({
          factionId: row.factionId, name: entry.name, header: entry.header,
          standing: STANDING_NAMES[row.reaction - 1] ?? `Standing ${row.reaction}`, toNext: row.ceiling - row.standing,
        });
      }
    }
    closestFactions.sort((a, b) => a.toNext - b.toNext || a.factionId - b.factionId);

    const knownTitles = [...titleIds].filter((id) => titles.has(id)).length;

    const closestChains: ClosestChain[] = [];
    let chainsDone = 0;
    for (const chain of chains.values()) {
      const done = chain.questIds.filter((id) => questIds.has(id)).length;
      if (done === chain.questIds.length) chainsDone++;
      else if (done > 0) closestChains.push({ questLineId: chain.questLineId, name: chain.name, done, total: chain.questIds.length });
    }
    closestChains.sort((a, b) => (a.total - a.done) - (b.total - b.done) || b.total - a.total || a.questLineId - b.questLineId);

    characters.push({
      characterKey: key, class: identity.class, level: identity.level,
      achievements: {
        done: [...doneAchievements].filter((id) => achievements.has(id)).length, total: achievements.size,
        points: earnedPoints, pointsTotal: [...achievements.values()].reduce((sum, a) => sum + a.points, 0),
        closest: closestAchievements.slice(0, CLOSEST_LIMIT), unlisted: unlistedAchievements,
      },
      reputation: { exalted, total: plainFactions.length, closest: closestFactions.slice(0, CLOSEST_LIMIT), unlisted: unlistedFactions },
      titles: { known: knownTitles, total: titles.size, unlisted: titleIds.size - knownTitles },
      quests: { completed: questIds.size, chainsDone, chainsTotal: chains.size, closest: closestChains.slice(0, CLOSEST_LIMIT) },
    });
  }

  return {
    ownerInstallId: owner,
    listed: { achievements: achievements.size, factions: factions.size, titles: titles.size, chains: chains.size },
    ownedRecorded: mine.length > 0,
    characters,
    unknownCharacter: wantedKey && mine.length > 0 && characters.length === 0 ? wantedKey : undefined,
  };
}

const listedNothing = (l: CompletionProgress["listed"]) => l.achievements + l.factions + l.titles + l.chains === 0;

/** Why there is nothing to show, or null when there is something. Shared by the page and the MCP tool. */
export function completionEmptyState(p: CompletionProgress): string | null {
  if (!p.ownedRecorded) {
    return "No completion data from this install. The addon's completion module is off until you run /everloot completion on, "
      + "and its progress is shown here only when the install's upload shared \"My collection ownership and completion progress\" with a verified grant. "
      + "This is unrecorded, not zero.";
  }
  if (p.unknownCharacter) return `No character ${p.unknownCharacter} in this install's completion upload.`;
  return null;
}

export function formatCompletionProgress(p: CompletionProgress): string {
  const lines = [
    `Completion progress for install ${p.ownerInstallId}`,
    `A list entry is public after ${COMPLETION_AGREEMENT} installs report it identically. Owned is what one character uploaded. Closest to done means the most criteria met, the next standing nearest, or the fewest quests left in a chain.`,
  ];
  const empty = completionEmptyState(p);
  if (empty) return [...lines, empty].join("\n");
  if (listedNothing(p.listed)) {
    lines.push(`Lists unrecorded: ${COMPLETION_AGREEMENT} installs have not yet reported the same achievements, factions, titles or quest chains, so totals below read 0.`);
  }
  for (const c of p.characters) {
    lines.push("", `Character ${c.characterKey} (${c.class} ${c.level})`);
    lines.push(`Achievements: ${c.achievements.done} of ${c.achievements.total} done, ${c.achievements.points} of ${c.achievements.pointsTotal} points`);
    for (const a of c.achievements.closest) lines.push(`  ${a.name} (${a.category}): ${a.met} of ${a.total} criteria`);
    lines.push(`Reputation: ${c.reputation.exalted} of ${c.reputation.total} factions Exalted`);
    for (const f of c.reputation.closest) lines.push(`  ${f.name}: ${f.standing}, ${f.toNext} to the next standing`);
    lines.push(`Titles: ${c.titles.known} of ${c.titles.total} known`);
    lines.push(`Quests: ${c.quests.completed} completed, ${c.quests.chainsDone} of ${c.quests.chainsTotal} listed chains finished`);
    for (const q of c.quests.closest) lines.push(`  ${q.name}: ${q.done} of ${q.total} quests`);
    const extra = c.achievements.unlisted + c.reputation.unlisted + c.titles.unlisted;
    if (extra > 0) lines.push(`Reported by this character and not yet on the agreed lists: ${extra}`);
  }
  return lines.join("\n");
}

export function handleCompletionProgress(
  args: { ownerInstallId: string; characterKey?: string },
  facts: CompletionFacts = EMPTY_FACTS,
): string {
  if (!args.ownerInstallId.trim()) return "Name the install.";
  return formatCompletionProgress(completionProgress(args.ownerInstallId, args.characterKey, facts));
}
