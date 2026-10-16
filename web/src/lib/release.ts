import { join } from "node:path";
import { openPublicSnapshot, type PublicSnapshot } from "../../../kb/src/public-snapshot";

/**
 * The approved knowledge release, opened once per instance and shared by the MCP mounts and the
 * lore pages. Every open runs the release checks (manifest, hash, no sidecars, non-empty); a
 * failure is logged and reported as null so callers answer "unavailable", never an empty archive.
 * The next call retries.
 */
export function releasePath(): string {
  return process.env.KB_SNAPSHOT_PATH?.trim() || join(process.cwd(), ".release", "2026-10-05-everloot-public.sqlite");
}

let handle: PublicSnapshot | null = null;

export function getRelease(): PublicSnapshot | null {
  if (handle) return handle;
  try {
    handle = openPublicSnapshot(releasePath());
  } catch (err) {
    console.error("[release] knowledge release unavailable", err);
    return null;
  }
  return handle;
}
