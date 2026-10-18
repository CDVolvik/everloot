import { TALENT_CLASSES, type TalentClass } from "@everloot/protocol";
import { normalizeCatalog } from "../../../web/src/lib/talents/adapter";
import type { TalentCatalog } from "../../../web/src/lib/talents/types";
import warrior from "../../../web/src/data/game-data/talents/warrior.json" with { type: "json" };
import paladin from "../../../web/src/data/game-data/talents/paladin.json" with { type: "json" };
import hunter from "../../../web/src/data/game-data/talents/hunter.json" with { type: "json" };
import rogue from "../../../web/src/data/game-data/talents/rogue.json" with { type: "json" };
import priest from "../../../web/src/data/game-data/talents/priest.json" with { type: "json" };
import shaman from "../../../web/src/data/game-data/talents/shaman.json" with { type: "json" };
import mage from "../../../web/src/data/game-data/talents/mage.json" with { type: "json" };
import warlock from "../../../web/src/data/game-data/talents/warlock.json" with { type: "json" };
import druid from "../../../web/src/data/game-data/talents/druid.json" with { type: "json" };

/**
 * The trimmed talent catalogs the site's calculator reads (web/src/data/game-data/talents, one file per
 * class), read through the calculator's own adapter so the MCP tools and the page agree on every node,
 * rank and gate. Game-file data: Blizzard's, labelled found in game files, unconfirmed, with the build.
 */
const FILES: Record<TalentClass, unknown> = { warrior, paladin, hunter, rogue, priest, shaman, mage, warlock, druid };

const parsed = new Map<TalentClass, TalentCatalog>();

/** One class's catalog, parsed once. Throws CatalogError on a broken file, which the tests catch first. */
export function siteCatalog(slug: TalentClass): TalentCatalog {
  let catalog = parsed.get(slug);
  if (!catalog) {
    catalog = normalizeCatalog(FILES[slug]);
    parsed.set(slug, catalog);
  }
  return catalog;
}

/** Every class's catalog, in the protocol's order. */
export function siteCatalogs(): TalentCatalog[] {
  return TALENT_CLASSES.map(siteCatalog);
}
