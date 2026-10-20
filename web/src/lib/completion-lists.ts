import { agreedCatalog } from "../../../kb/src/completion-rollup";
import type { AchievementEntry, ChainEntry, FactionEntry, TitleEntry } from "../../../kb/src/completion";
import { slugify } from "../../../kb/src/lore-slug";
import { uploadStore } from "./upload-store";

// The achievements, factions, titles and quest chains the database lists: the completion rollup's agreed catalog, the same
// three-reporter rule the collections tool and the MCP tool read (kb/src/completion-rollup.ts). Nothing
// here is read from the game files and no owned progress is touched.

export interface CompletionCatalog { achievements: AchievementEntry[]; factions: FactionEntry[]; titles: TitleEntry[]; chains: ChainEntry[]; dataAsOf: string | null }

/** The agreed lists, or null when the rollup could not be read (unrecorded, not empty). */
export async function loadCatalog(): Promise<CompletionCatalog | null> {
  const read = await uploadStore.loadCompletion();
  if (!read.state) return null;
  const agreed = agreedCatalog(read.state);
  return { achievements: [...agreed.achievements.values()], factions: [...agreed.factions.values()], titles: [...agreed.titles.values()], chains: [...agreed.chains.values()], dataAsOf: read.dataAsOf };
}

/** `4-ten-quests`: the id, then the name's words. A name with no letters or digits leaves the bare id. */
function segment(id: number, name: string): string {
  const words = slugify(name);
  return words ? `${id}-${words}` : String(id);
}
export const achievementHref = (id: number, name: string) => `/database/achievements/${segment(id, name)}`;
export const factionHref = (id: number, name: string) => `/database/factions/${segment(id, name)}`;
export const titleHref = (id: number, name: string) => `/database/titles/${segment(id, name)}`;
export const chainHref = (id: number, name: string) => `/database/quest-chains/${segment(id, name)}`;

/** The id in an `<id>-<slug>` segment, or null when the segment does not start with one. */
export function parseSegment(value: string): number | null {
  const m = /^([1-9]\d{0,8})(?:-[a-z0-9-]*)?$/.exec(value);
  return m ? Number(m[1]) : null;
}
