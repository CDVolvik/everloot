import { type IntakeRecord } from "./records.js";
/** The named-data categories a player chooses to share, each needing a verified grant. */
export type SharingCategory = "guild" | "gear" | "gold" | "collection";
/** The sharing category a record falls under, or null for anonymous records that need no choice. */
export declare function sharingCategory(row: IntakeRecord): SharingCategory | null;
