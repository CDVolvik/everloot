/**
 * Which item names may be shown (docs/DATA_POLICY.md, "Item names from the game files and the Warcraft
 * Wiki"). Pure, with no file or database access, so the ledger command and the site's reader apply the same rule.
 *
 * Since 2026-10-21 every item the build lists is named when a source names it: there is no id range and no
 * placeholder filter. The page says where each name comes from instead.
 */

/** Whether a name may be shown for this item id: any id, any name that is not empty. */
export const mayShowName = (itemId: number, name: string) => itemId > 0 && name.trim().length > 0;
