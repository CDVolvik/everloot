import { SITE, TOOLTIP_TYPES, type TooltipResponse, type TooltipType } from "@everloot/protocol";
import { itemPage } from "../../../kb/src/item-page";
import { objectPage } from "../../../kb/src/object-page";
import { npcPage, questPage } from "../../../kb/src/world-pages";
import { attribution } from "./data-guard";
import { loadItemTips, loadSiteAssets } from "./game-assets";
import { loadWorldFacts, loadItemFacts } from "./rollup-compute";
import { PLACEHOLDER } from "./item-names";
import { loadObjectFacts } from "./objects";
import { CREDIT } from "./talents/assets";

/**
 * The hover card behind GET /api/tooltip/<type>/<id>, for the embeddable script (public/tooltips.js).
 * It says what the page says, and under the same rules: a fact appears once 3 installs reported it, an
 * entity nobody reported is not answered (an id typed into a URL may be unreleased content), and what the
 * game files give is labelled unconfirmed with its build. Plain text only.
 */

export type TooltipResult = { status: 200; body: TooltipResponse } | { status: 404 | 503; error: string };

const PAGE: Record<TooltipType, string> = { item: "items", npc: "npcs", quest: "quests", object: "objects" };
const NO_NAME = "No agreed name yet. A name needs 3 installs reporting the same one.";
const UNREACHABLE = "Storage is unavailable. The card is unrecorded, not empty.";
const NOT_FOUND = "Nothing to show: no such page, or players have not reported it yet.";

export function tooltipType(value: string): TooltipType | null {
  return (TOOLTIP_TYPES as readonly string[]).includes(value) ? (value as TooltipType) : null;
}

/** A positive whole number as written in a URL, or null. Ids past 2^31 are not game ids. */
export function tooltipId(value: string): number | null {
  return /^[1-9]\d{0,9}$/.test(value) && Number(value) <= 2_147_483_647 ? Number(value) : null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export async function loadTooltip(type: TooltipType, id: number): Promise<TooltipResult> {
  const url = `${SITE}/database/${PAGE[type]}/${id}`;
  const card = (c: { title: string; lines: string[]; color?: string | null; icon?: string | null; partial?: boolean; gameData?: TooltipResponse["gameData"] }): TooltipResult => ({
    status: 200,
    body: {
      ok: true, type, id, title: c.title, color: c.color && /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : null, icon: c.icon ?? null,
      lines: c.lines, partial: c.partial ?? false, url, attribution: attribution(`/database/${PAGE[type]}/${id}`), gameData: c.gameData ?? null,
    },
  });
  const unreachable: TooltipResult = { status: 503, error: UNREACHABLE };
  const notFound: TooltipResult = { status: 404, error: NOT_FOUND };

  if (type === "item") {
    const facts = await loadItemFacts();
    if (facts.unreachable) return unreachable;
    const page = itemPage(id, facts);
    // The same test as the item page: the game file tooltip only for an item players have reported.
    if (!(page.name || page.drops.length || page.pins.length)) return notFound;
    // The game's icon and tooltip text are Blizzard's; docs/DATA_POLICY.md ("Third extension") lets one item's
    // into a card, under the same rules as its page.
    const assets = await loadSiteAssets();
    const tip = assets ? (await loadItemTips(assets, [id])).get(id) : undefined;
    const lines = [...(tip?.lines ?? [])];
    if (tip?.partial) lines.push(`${PLACEHOLDER} marks a value the game files do not give us yet.`);
    if (!page.name && !tip) lines.push(NO_NAME);
    if (page.drops.length) lines.push(`Dropped by ${plural(page.drops.length, "source", "sources")} players looted (3 or more installs).`);
    return card({
      title: page.name ?? tip?.name ?? `Item ${id}`, lines, color: tip?.color, icon: tip?.icon, partial: tip?.partial,
      gameData: tip && assets ? { label: assets.label, build: assets.version, credit: CREDIT } : null,
    });
  }

  if (type === "object") {
    const facts = await loadObjectFacts();
    if (facts.unreachable) return unreachable;
    const page = objectPage(id, facts);
    if (!(page.drops.length || page.zero)) return notFound;
    return card({
      title: `Object ${id}`,
      lines: page.zero
        ? [`No items in ${plural(page.zero.kills, "loot window", "loot windows")} players opened.`]
        : [`${plural(page.drops.length, "item", "items")} players looted from it (3 or more installs).`],
    });
  }

  const facts = await loadWorldFacts();
  if (facts.unreachable) return unreachable;
  if (type === "npc") {
    const page = npcPage(id, facts);
    if (!(page.name || page.pins.length)) return notFound;
    return card({
      title: page.name ?? `NPC ${id}`,
      lines: [
        ...(page.name ? [] : [NO_NAME]),
        page.pins.length ? `Seen on ${plural(page.pins.length, "map", "maps")}, agreed by 3 or more installs.` : "No agreed position. A pin needs 3 installs on the same map.",
      ],
    });
  }

  const page = questPage(id, facts);
  if (!(page.title || page.level !== null || page.giverNpcId !== null || page.turnInNpcId !== null || page.rewards.length)) return notFound;
  const npc = (npcId: number) => npcPage(npcId, facts).name ?? `NPC ${npcId}`;
  return card({
    title: page.title ?? `Quest ${id}`,
    lines: [
      ...(page.title ? [] : ["No agreed title yet. A title needs 3 installs reporting the same one."]),
      ...(page.level === null ? [] : [`Level ${page.level}`]),
      ...(page.giverNpcId === null ? [] : [`Starts with ${npc(page.giverNpcId)}`]),
      ...(page.turnInNpcId === null ? [] : [`Ends with ${npc(page.turnInNpcId)}`]),
      ...(page.rewards.length ? [`${plural(page.rewards.length, "reward item", "reward items")} players saw (3 or more installs).`] : []),
    ],
  });
}
