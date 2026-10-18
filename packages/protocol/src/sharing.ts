import { COMPLETION_OWNED_KINDS, type IntakeRecord } from "./records.js";

/** The named-data categories a player chooses to share, each needing a verified grant. */
export type SharingCategory = "guild" | "gear" | "gold" | "collection";

/** The sharing category a record falls under, or null for anonymous records that need no choice. */
export function sharingCategory(row: IntakeRecord): SharingCategory | null {
  if ("guildName" in row) return "guild";
  if (row.kind === "gear_snapshot") return "gear";
  if (row.kind === "gold_snapshot" || row.kind === "money_event") return "gold";
  if (row.kind === "collection_owned" || COMPLETION_OWNED_KINDS.includes(row.kind)) return "collection";
  return null;
}
