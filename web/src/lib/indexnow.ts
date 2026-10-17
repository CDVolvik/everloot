import type { ChangeEntry } from "./changes";
import { SITE_URL } from "./seo";

/**
 * IndexNow (Bing, Yandex and others): tell search engines which URLs changed instead of waiting to be crawled.
 * The key is the env var INDEXNOW_KEY; no key is committed. /indexnow.txt serves it, and every ping names that
 * file as `keyLocation`.
 */
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
export const KEY_PATH = "/indexnow.txt";

/** IndexNow keys are 8 to 128 characters: letters, digits and dashes. Anything else counts as no key. */
export function indexNowKey(env: Record<string, string | undefined> = process.env): string | null {
  const key = env.INDEXNOW_KEY?.trim();
  return key && /^[A-Za-z0-9-]{8,128}$/.test(key) ? key : null;
}

export type PingResult = { sent: false; reason: "no-key" | "no-urls" | "failed"; status?: number } | { sent: true; status: number; count: number };

/**
 * Submit URLs. It sends nothing for an empty list, and never pings a URL off this site. Callers decide whether
 * there is anything new from their own content count; a 200 from a page is not evidence of new content.
 */
export async function pingIndexNow(urls: string[], options: { key?: string | null; fetch?: typeof fetch; siteUrl?: string } = {}): Promise<PingResult> {
  const key = options.key === undefined ? indexNowKey() : options.key;
  if (!key) return { sent: false, reason: "no-key" };
  const site = (options.siteUrl ?? SITE_URL).replace(/\/$/, "");
  const host = new URL(site).host;
  const list = [...new Set(urls)].filter((u) => {
    try {
      return new URL(u).host === host;
    } catch {
      return false;
    }
  });
  if (list.length === 0) return { sent: false, reason: "no-urls" };
  try {
    const res = await (options.fetch ?? fetch)(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key, keyLocation: `${site}${KEY_PATH}`, urlList: list }),
    });
    // 200 and 202 both mean the submission was accepted.
    return res.status === 200 || res.status === 202 ? { sent: true, status: res.status, count: list.length } : { sent: false, reason: "failed", status: res.status };
  } catch {
    return { sent: false, reason: "failed" };
  }
}

/** Entries from the last `windowMs` count as new. Posts carry Blizzard's time and builds the time Everloot first saw them. */
export function recentChanges(entries: ChangeEntry[], now: Date, windowMs: number): ChangeEntry[] {
  return entries.filter((e) => {
    const age = now.getTime() - new Date(e.at).getTime();
    return age >= 0 && age <= windowMs;
  });
}

/**
 * The URLs to submit after the changes data updates. An empty change list, or no recent entry, gives none:
 * the decision rests on how many entries there are, never on the page answering 200.
 */
export function changeUrlsToPing(entries: ChangeEntry[], now: Date, windowMs: number, site = SITE_URL): string[] {
  if (entries.length === 0) return [];
  if (recentChanges(entries, now, windowMs).length === 0) return [];
  return [`${site}/changes`, `${site}/changes/feed.xml`, `${site}/wow-forever`];
}
