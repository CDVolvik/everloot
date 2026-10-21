import postsFile from "../../../kb/changes/blue-posts.json";
import buildsFile from "../../../kb/changes/builds.json";
import writeupsFile from "../../../kb/curated/blue-writeups.json";
import type { BlueStore } from "../../../kb/src/blue-posts";
import { writeupsById, type BlueWriteup } from "../../../kb/src/blue-writeups";
import { buildTimeline, groupAnnouncements, type BuildLike, type ChangeEntry } from "../../../kb/src/changes";

export {
  CHANGE_FILTERS, GAME_LABEL, TYPE_LABEL, blueThreads, buildTimeline, filterTimeline, forumRegions, groupAnnouncements, parseFilter, postIdOfSegment,
  postPath, renderFeed, type BlueThread, type ChangeEntry, type ChangeFilter,
} from "../../../kb/src/changes";
export type { BlueWriteup } from "../../../kb/src/blue-writeups";

/**
 * The files the scheduled `blue-check` and `builds-check` runs commit under kb/changes. They are bundled
 * with the site, so a new run reaches visitors with the next deploy.
 */
const store = postsFile as unknown as BlueStore;
const builds = (buildsFile as unknown as { builds: BuildLike[] }).builds;

/** One entry per announcement: a post Blizzard made on both forums is one entry, the other copies under `copies`. */
export function loadTimeline(): ChangeEntry[] {
  return groupAnnouncements(buildTimeline(store.posts, builds));
}

/** Our reviewed write-ups of blue posts (kb/curated/blue-writeups), by post id; bundled like the posts. */
export function loadWriteups(): Map<string, BlueWriteup> {
  return writeupsById(writeupsFile);
}

/** An announcement's write-up, whichever of its copies it was written for. */
export function writeupFor(entry: ChangeEntry, writeups: Map<string, BlueWriteup>): BlueWriteup | null {
  return [entry, ...(entry.copies ?? [])].map((c) => writeups.get(c.id)).find(Boolean) ?? null;
}
