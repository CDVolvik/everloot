import type { TokenKind } from "../../../kb/src/wiki/page";
import { entityHref } from "@/components/EntityLink";
import { factionHref, loadCatalog } from "@/lib/completion-lists";
import { loadQuestNames } from "@/lib/game-assets";
import { CLIENT_LAYER, shownItemName } from "@/lib/items";
import { npcNames, questTitles } from "@/lib/names";
import { loadWorldFacts } from "@/lib/rollup-compute";
import { loadShownNames } from "@/lib/shown-item-names";
import { inlinesOf, type WikiPage } from "@/lib/wiki";
import { zoneByMapId, zoneHref } from "@/lib/zones";

/** What a token renders: the name the site may show and its database page; no link when the page does not exist. */
export interface TokenTarget { name: string; href: string | null }

const WORD: Record<TokenKind, string> = { item: "Item", npc: "NPC", quest: "Quest", zone: "Zone", faction: "Faction" };

export const tokenKey = (kind: TokenKind, id: number) => `${kind}:${id}`;

/**
 * The name and link of every entity token on a page, by the rules the database pages use: an item's shown name
 * (players' agreed name, else the game files where the Warcraft Wiki agrees), an NPC's agreed name, a quest's
 * agreed title else the wiki's, a released zone's name, an agreed faction. Anything without one reads "Item N".
 * Only the sources a page's tokens need are read.
 */
export async function resolveTokens(page: Pick<WikiPage, "blocks">): Promise<Map<string, TokenTarget>> {
  const ids: Record<TokenKind, Set<number>> = { item: new Set(), npc: new Set(), quest: new Set(), zone: new Set(), faction: new Set() };
  for (const b of page.blocks) for (const run of inlinesOf(b)) for (const t of run) if (t.kind === "entity") ids[t.entity].add(t.id);

  const [shown, world, questWiki, catalog] = await Promise.all([
    ids.item.size ? loadShownNames() : null,
    ids.npc.size || ids.quest.size ? loadWorldFacts() : null,
    ids.quest.size ? loadQuestNames(CLIENT_LAYER.build.version) : null,
    ids.faction.size ? loadCatalog() : null,
  ]);
  const npcs = world && !world.unreachable ? npcNames(world) : new Map<number, string>();
  const quests = world && !world.unreachable ? questTitles(world) : new Map<number, string>();

  const out = new Map<string, TokenTarget>();
  const fallback = (kind: TokenKind, id: number) => `${WORD[kind]} ${id}`;
  for (const id of ids.item) {
    const name = shown ? shownItemName(id, shown.agreed, shown.matched?.names)?.name : undefined;
    out.set(tokenKey("item", id), { name: name ?? fallback("item", id), href: entityHref("item", id) });
  }
  for (const id of ids.npc) out.set(tokenKey("npc", id), { name: npcs.get(id) ?? fallback("npc", id), href: entityHref("npc", id) });
  for (const id of ids.quest) {
    const name = quests.get(id) ?? questWiki?.names.get(id)?.name;
    out.set(tokenKey("quest", id), { name: name ?? fallback("quest", id), href: entityHref("quest", id) });
  }
  for (const id of ids.zone) {
    const zone = zoneByMapId(id);
    out.set(tokenKey("zone", id), zone ? { name: zone.name, href: zoneHref(zone.mapId, zone.name) } : { name: fallback("zone", id), href: null });
  }
  for (const id of ids.faction) {
    const faction = catalog?.factions.find((f) => f.factionId === id);
    out.set(tokenKey("faction", id), faction ? { name: faction.name, href: factionHref(faction.factionId, faction.name) } : { name: fallback("faction", id), href: null });
  }
  return out;
}
