/**
 * Which quest titles, item set names and spell names may be shown (docs/DATA_POLICY.md, "Quest titles from the
 * game files and the Warcraft Wiki" and "Item set and spell names from the game files"). Pure, with no file or
 * database access, so the names command and the site's reader apply the same rule.
 *
 * Since 2026-10-21, as with items, every id with a name is named: no id range and no placeholder filter.
 */
const mayShow = (id: number, name: string) => id > 0 && name.trim().length > 0;

export const mayShowQuestTitle = mayShow;
export const mayShowSetName = mayShow;
export const mayShowSpellName = mayShow;
