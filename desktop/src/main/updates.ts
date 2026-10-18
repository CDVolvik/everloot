import type { UpdateCheck } from "../shared/types";

export const RELEASES_API = "https://api.github.com/repos/Everloot/everloot/releases?per_page=30";
export const RELEASES_PAGE = "https://github.com/Everloot/everloot/releases";

interface Release { tag_name?: unknown; html_url?: unknown; draft?: unknown; prerelease?: unknown }

const parse = (v: string): number[] | null => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

/** Positive when a is newer than b. Non-numeric versions (a dev build) count as older than anything. */
export function compareVersions(a: string, b: string): number {
  const pa = parse(a), pb = parse(b);
  if (!pa || !pb) return pa ? 1 : pb ? -1 : 0;
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/** The newest published `desktop-vX.Y.Z` release among the list GitHub returns. Addon tags, drafts and pre-releases are skipped. */
export function newestDesktopRelease(releases: unknown): { version: string; url: string } | null {
  if (!Array.isArray(releases)) return null;
  let best: { version: string; url: string } | null = null;
  for (const r of releases as Release[]) {
    if (r.draft || r.prerelease || typeof r.tag_name !== "string") continue;
    const m = /^desktop-v(\d+\.\d+\.\d+)$/.exec(r.tag_name);
    if (!m) continue;
    const url = typeof r.html_url === "string" ? r.html_url : `${RELEASES_PAGE}/tag/${r.tag_name}`;
    if (!best || compareVersions(m[1], best.version) > 0) best = { version: m[1], url };
  }
  return best;
}

/** Reads the release list and says whether a newer app exists. It never downloads anything. */
export async function checkForUpdates(current: string, send: typeof fetch = fetch): Promise<UpdateCheck> {
  const res = await send(RELEASES_API, { headers: { accept: "application/vnd.github+json", "user-agent": `everloot-desktop/${current}` } });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  const newest = newestDesktopRelease(await res.json());
  if (!newest) return { current, latest: null, url: RELEASES_PAGE, newer: false };
  return { current, latest: newest.version, url: newest.url, newer: compareVersions(newest.version, current) > 0 };
}
