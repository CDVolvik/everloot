import { slugify } from "./lore-slug.js";

/**
 * Each blue post's own page on Everloot: `/changes/<page id>-<slug of the title>`. Kept apart from changes.ts
 * so the site's structured data can name the page without loading the rest of the timeline code.
 */

/**
 * The id in a blue post's Everloot address, from the stored id, so it never changes: `us-<post id>` and
 * `eu-<post id>` for the forums, `bsky-<record key>` for Bluesky. Null for builds and anything else.
 */
export function postPageId(postId: string): string | null {
  const forum = /^forum:(eu:)?(\d{1,15})$/.exec(postId);
  if (forum) return `${forum[1] ? "eu" : "us"}-${forum[2]}`;
  const sky = /^bluesky:([A-Za-z0-9]{1,64})$/.exec(postId);
  return sky ? `bsky-${sky[1]}` : null;
}

/** The stored post id an address segment names (`us-30553826-any-slug`), whatever its slug; null when it names none. */
export function postIdOfSegment(segment: string): string | null {
  const forum = /^(us|eu)-(\d{1,15})(?:-[^/]*)?$/.exec(segment);
  if (forum) return forum[1] === "eu" ? `forum:eu:${forum[2]}` : `forum:${forum[2]}`;
  const sky = /^bsky-([A-Za-z0-9]{1,64})(?:-[^/]*)?$/.exec(segment);
  return sky ? `bluesky:${sky[1]}` : null;
}

/** A blue post's own page. Null for a build, which has no page. */
export function postPath(entry: { id: string; title: string }): string | null {
  const id = postPageId(entry.id);
  if (!id) return null;
  const slug = slugify(entry.title);
  return `/changes/${slug ? `${id}-${slug}` : id}`;
}
