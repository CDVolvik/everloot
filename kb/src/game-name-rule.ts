/**
 * Which quest titles, item set names and spell names may be shown (docs/DATA_POLICY.md, "Quest titles from the
 * game files and the Warcraft Wiki" and "Item set and spell names from the game files"). Pure, with no file or
 * database access, so the names command and the site's reader apply the same rule.
 */
import { looksInternal } from "./item-name-rule.js";

/**
 * Only quests, sets and spells below these ids are named: the original game's ranges, as with items
 * (SHOWN_MAX_ITEM_ID). Higher ids in the client belong to later versions and seasons, or are new to Forever.
 */
export const SHOWN_MAX_QUEST_ID = 10_000;
export const SHOWN_MAX_SET_ID = 1_000;
export const SHOWN_MAX_SPELL_ID = 30_000;

/**
 * A game file name that reads like an internal entry: the item rule's placeholders, a bracketed tag ("[DNT] ..."),
 * "OLD" at the end, or the client's own do-not-display mark ("DND", "(DND)") and "NEWTEST", in capitals.
 */
export const looksInternalGameName = (name: string) => looksInternal(name) || /^\[|\sOLD$|\bDND\b|NEWTEST/.test(name.trim());

/**
 * Quests whose 2023 wiki title a Forever-era source contradicts: Polestar's guides, built from Forever's quest data,
 * name them differently (compared 2026-10-21; 516 "Beren's Peril", 5641 and 5645 "Chastise", 5646 and 5679 "Dark
 * Sacrifice", 5762 "Hemet Nesingwary", 7383 "Crown of the Earth", 7647 "Judgment and Redemption", 8415 "Chillwind
 * Point"). Neither title is shown until players confirm one; the other source's title is never used.
 */
export const CONTESTED_QUEST_IDS: ReadonlySet<number> = new Set([516, 5641, 5645, 5646, 5679, 5762, 7383, 7647, 8415]);

/** A quest title both sources give. The wiki's titles are written by people, so only the id range, a contested id and an empty title hold one back. */
export const mayShowQuestTitle = (questId: number, title: string) =>
  questId > 0 && questId < SHOWN_MAX_QUEST_ID && !CONTESTED_QUEST_IDS.has(questId) && title.trim().length > 0;
export const mayShowSetName = (setId: number, name: string) => setId > 0 && setId < SHOWN_MAX_SET_ID && Boolean(name.trim()) && !looksInternalGameName(name);
export const mayShowSpellName = (spellId: number, name: string) => spellId > 0 && spellId < SHOWN_MAX_SPELL_ID && Boolean(name.trim()) && !looksInternalGameName(name);
