/**
 * Which matched item names may be shown (docs/DATA_POLICY.md, "Item names from the game files and the Warcraft
 * Wiki"). Pure, with no file or database access, so the ledger command and the site's reader apply the same rule.
 */

/**
 * Only items below this id are named. It is the original game's id range: ids above it belong to later
 * versions (Wrath Classic's Scourge event, holiday and shop items), the lowest spoiler risk being the point.
 */
export const SHOWN_MAX_ITEM_ID = 25_000;

/** A name that reads like a placeholder or an internal entry: never shown, even when both sources agree. */
const INTERNAL_NAME = /^(deprecated|dep\b|\[ph\]|ph |test\b|qa\b|monster -|old\b)|unused|zzold|\(old\)/i;

export const looksInternal = (name: string) => INTERNAL_NAME.test(name.trim());

/** Whether a matched name may be shown for this item id. */
export const mayShowName = (itemId: number, name: string) => itemId > 0 && itemId < SHOWN_MAX_ITEM_ID && !looksInternal(name);
