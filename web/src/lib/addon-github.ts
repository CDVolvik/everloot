// What GitHub's public REST API says about an addon's repository, cached for an hour per request.
// GITHUB_TOKEN is optional; without it GitHub allows 60 requests an hour per IP, which a shared host
// can exhaust, so a profile costs six requests and the answer says when the limit was the reason.
// Nothing here throws: a missing repo and an unreachable GitHub are different answers, and a page
// that cannot be filled in still renders.

const API = "https://api.github.com";
const REPO_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const NOTES_LIMIT = 1200;
const TREE_LIMIT = 40;

export interface AddonGithub {
  repo: string;
  url: string;
  /** SPDX id, or null when GitHub has none ("NOASSERTION" counts as none). */
  license: string | null;
  archived: boolean;
  /** Open issues without pull requests, or null when the count could not be read. */
  openIssues: number | null;
  /** Newest release, or null when the repository has none. */
  release: { tag: string; name: string | null; date: string; url: string; notes: string | null } | null;
  lastCommit: string | null;
  /** Contributors counted up to GitHub's page of 100. */
  contributors: { count: number; capped: boolean } | null;
  tree: { name: string; kind: "dir" | "file" }[];
}

export type AddonGithubResult =
  | { status: "ok"; data: AddonGithub }
  | { status: "missing" }
  | { status: "unavailable"; rateLimited: boolean };

class GithubError extends Error {
  constructor(readonly code: number, readonly rateLimited = false) { super(`GitHub ${code}`); }
}

async function get(path: string): Promise<unknown> {
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(`${API}${path}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "everloot.app", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(5000),
    next: { revalidate: 3600 },
  } as RequestInit);
  if (!response.ok) {
    const limited = response.status === 429 || (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0");
    throw new GithubError(response.status, limited);
  }
  return response.json();
}

/** A part that can fail without spoiling the page: null means unknown. */
async function optional<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

const day = (iso: unknown) => (typeof iso === "string" && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null);
const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);

export async function addonGithub(repo: string): Promise<AddonGithubResult> {
  if (!REPO_NAME.test(repo)) return { status: "missing" };
  let info: { html_url?: string; license?: { spdx_id?: string } | null; archived?: boolean };
  try {
    info = (await get(`/repos/${repo}`)) as typeof info;
  } catch (error) {
    if (error instanceof GithubError && (error.code === 404 || error.code === 410)) return { status: "missing" };
    return { status: "unavailable", rateLimited: error instanceof GithubError && error.rateLimited };
  }
  if (!info || typeof info.html_url !== "string") return { status: "unavailable", rateLimited: false };

  const [release, commits, contributors, contents, issues] = await Promise.all([
    optional(async () => {
      try {
        return (await get(`/repos/${repo}/releases/latest`)) as Record<string, unknown>;
      } catch (error) {
        if (error instanceof GithubError && error.code === 404) return null; // no release yet
        throw error;
      }
    }),
    optional(() => get(`/repos/${repo}/commits?per_page=1`) as Promise<{ commit?: { committer?: { date?: string } } }[]>),
    optional(() => get(`/repos/${repo}/contributors?per_page=100`) as Promise<unknown[]>),
    optional(() => get(`/repos/${repo}/contents/`) as Promise<{ name?: string; type?: string }[]>),
    optional(() => get(`/search/issues?per_page=1&q=${encodeURIComponent(`repo:${repo} is:issue is:open`)}`) as Promise<{ total_count?: number }>),
  ]);

  const tag = text(release?.tag_name, 100);
  const published = day(release?.published_at);
  const spdx = info.license?.spdx_id;
  return {
    status: "ok",
    data: {
      repo,
      url: info.html_url,
      license: spdx && spdx !== "NOASSERTION" ? spdx : null,
      archived: info.archived === true,
      openIssues: typeof issues?.total_count === "number" ? issues.total_count : null,
      release: release && tag && published
        ? {
            tag,
            date: published,
            name: text(release.name, 120),
            url: text(release.html_url, 300) ?? `${info.html_url}/releases`,
            notes: text(release.body, NOTES_LIMIT),
          }
        : null,
      lastCommit: Array.isArray(commits) ? day(commits[0]?.commit?.committer?.date) : null,
      contributors: Array.isArray(contributors) ? { count: contributors.length, capped: contributors.length >= 100 } : null,
      tree: Array.isArray(contents)
        ? contents
            .filter((entry) => typeof entry?.name === "string")
            .map((entry) => ({ name: entry.name as string, kind: entry.type === "dir" ? ("dir" as const) : ("file" as const) }))
            .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1))
            .slice(0, TREE_LIMIT)
        : [],
    },
  };
}
