import postsFile from "../../../kb/changes/blue-posts.json";
import buildsFile from "../../../kb/changes/builds.json";
import writeupsFile from "../../../kb/curated/blue-writeups.json";
import type { BlueStore } from "../../../kb/src/blue-posts";
import { writeupsById, type BlueWriteup } from "../../../kb/src/blue-writeups";
import { buildTimeline, type BuildLike, type ChangeEntry } from "../../../kb/src/changes";

export {
  CHANGE_FILTERS, GAME_LABEL, TYPE_LABEL, blueThreads, buildTimeline, filterTimeline, parseFilter, postIdOfSegment, postPath, renderFeed,
  type BlueThread, type ChangeEntry, type ChangeFilter,
} from "../../../kb/src/changes";
export type { BlueWriteup } from "../../../kb/src/blue-writeups";

/**
 * The files the scheduled `blue-check` and `builds-check` runs commit under kb/changes. They are bundled
 * with the site, so a new run reaches visitors with the next deploy.
 */
const store = postsFile as unknown as BlueStore;
const builds = (buildsFile as unknown as { builds: BuildLike[] }).builds;

export function loadTimeline(): ChangeEntry[] {
  return buildTimeline(store.posts, builds);
}

/** Our reviewed write-ups of blue posts (kb/curated/blue-writeups), by post id; bundled like the posts. */
export function loadWriteups(): Map<string, BlueWriteup> {
  return writeupsById(writeupsFile);
}
