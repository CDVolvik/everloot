import { normalizeCatalog } from "./adapter";
import type { TalentCatalog } from "./types";

// One catalog per class, loaded on demand so a class page ships only its own tree.
const loaders = {
  warrior: () => import("@/data/talents/warrior.json"),
  paladin: () => import("@/data/talents/paladin.json"),
  hunter: () => import("@/data/talents/hunter.json"),
  rogue: () => import("@/data/talents/rogue.json"),
  priest: () => import("@/data/talents/priest.json"),
  shaman: () => import("@/data/talents/shaman.json"),
  mage: () => import("@/data/talents/mage.json"),
  warlock: () => import("@/data/talents/warlock.json"),
  druid: () => import("@/data/talents/druid.json"),
} as const;

export type TalentClassSlug = keyof typeof loaders;

export const TALENT_CLASSES = Object.keys(loaders) as TalentClassSlug[];

export const isTalentClass = (slug: string): slug is TalentClassSlug => slug in loaders;

export async function loadCatalog(slug: TalentClassSlug): Promise<TalentCatalog> {
  const data = await loaders[slug]();
  return normalizeCatalog(data.default);
}
