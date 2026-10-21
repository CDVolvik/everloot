/**
 * Which quest titles, item set names and spell names may be shown (docs/DATA_POLICY.md, "Quest titles from the
 * game files and the Warcraft Wiki" and "Item set and spell names from the game files"). Pure, with no file or
 * database access, so the names command and the site's reader apply the same rule.
 *
 * Since 2026-10-21, as with items, every id with a name is named: no id range and no placeholder filter. The one
 * hold left is a wiki title a Forever source shows to be wrong.
 */
const mayShow = (id: number, name: string) => id > 0 && name.trim().length > 0;

/**
 * Quests whose 2023 wiki title a Forever-era source contradicts: Polestar's guides, built from Forever's quest data,
 * name them differently (compared 2026-10-21; 516 "Beren's Peril", 5641 and 5645 "Chastise", 5646 and 5679 "Dark
 * Sacrifice", 5762 "Hemet Nesingwary", 7383 "Crown of the Earth", 7647 "Judgment and Redemption", 8415 "Chillwind
 * Point"). Neither title is shown until players confirm one; the other source's title is never used.
 */
export const CONTESTED_QUEST_IDS: ReadonlySet<number> = new Set([516, 5641, 5645, 5646, 5679, 5762, 7383, 7647, 8415]);

/** A quest title the wiki gives. Only a contested id and an empty title hold one back. */
export const mayShowQuestTitle = (questId: number, title: string) => mayShow(questId, title) && !CONTESTED_QUEST_IDS.has(questId);
export const mayShowSetName = mayShow;
export const mayShowSpellName = mayShow;
