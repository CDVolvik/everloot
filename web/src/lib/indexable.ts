import { itemHasFacts, npcHasFacts, objectHasFacts, questHasFacts, vendorHasFacts } from "../../../kb/src/page-urls";
import type { ItemPage } from "../../../kb/src/item-page";
import type { ObjectPage } from "../../../kb/src/object-page";
import type { NpcPage, QuestPage, VendorPage } from "../../../kb/src/world-pages";
import type { ShownItemName } from "./items";

/**
 * Whether a database detail page is indexed. Each page's robots metadata and the database sitemap call the
 * same function, so the sitemap lists exactly the pages that ask to be indexed. With upload storage out of
 * reach a page has no player facts to show, so only an item named under the item name rule stays indexed.
 */

/** Players reported the item (an agreed name, a public drop or a pin), or its name shows from the game files and the wiki. */
export const itemIndexable = (page: ItemPage, unreachable: boolean, name: ShownItemName | null): boolean =>
  (!unreachable && itemHasFacts(page)) || name?.source === "wiki";

export const npcIndexable = (page: NpcPage, unreachable: boolean): boolean => !unreachable && npcHasFacts(page);

export const questIndexable = (page: QuestPage, unreachable: boolean): boolean => !unreachable && questHasFacts(page);

export const objectIndexable = (page: ObjectPage, unreachable: boolean): boolean => !unreachable && objectHasFacts(page);

export const vendorIndexable = (page: VendorPage, unreachable: boolean): boolean => !unreachable && vendorHasFacts(page);
