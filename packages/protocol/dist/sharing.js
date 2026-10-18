import { COMPLETION_OWNED_KINDS } from "./records.js";
/** The sharing category a record falls under, or null for anonymous records that need no choice. */
export function sharingCategory(row) {
    if ("guildName" in row)
        return "guild";
    if (row.kind === "gear_snapshot")
        return "gear";
    if (row.kind === "gold_snapshot" || row.kind === "money_event")
        return "gold";
    if (row.kind === "collection_owned" || COMPLETION_OWNED_KINDS.includes(row.kind))
        return "collection";
    return null;
}
