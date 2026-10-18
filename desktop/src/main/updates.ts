import type { UpdateCheck } from "../shared/types";
import { compareVersions, newestRelease, RELEASES_API } from "./addon";

export { compareVersions };
export const RELEASES_PAGE = "https://github.com/Everloot/everloot/releases";

/** The newest published `desktop-vX.Y.Z` release among the list GitHub returns. */
export const newestDesktopRelease = (releases: unknown) => newestRelease(releases, "desktop-v");

/** Reads the release list once and says whether a newer app or addon exists. It never downloads anything. */
export async function fetchReleases(send: typeof fetch = fetch, userAgent = "everloot-desktop"): Promise<unknown> {
  const res = await send(RELEASES_API, { headers: { accept: "application/vnd.github+json", "user-agent": userAgent } });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  return res.json();
}

export async function checkForUpdates(current: string, send: typeof fetch = fetch): Promise<UpdateCheck> {
  const newest = newestDesktopRelease(await fetchReleases(send, `everloot-desktop/${current}`));
  if (!newest) return { current, latest: null, url: RELEASES_PAGE, newer: false };
  return { current, latest: newest.version, url: newest.url, newer: compareVersions(newest.version, current) > 0 };
}
