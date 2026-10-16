// Live details for the Polestar page from GitHub's REST API, cached for an hour: five requests an
// hour at most. GITHUB_TOKEN is optional; without it GitHub allows 60 requests an hour per IP, which
// a shared host can exhaust. Any failure is null.

const REPO = "fitzforge/polestar";
const API = "https://api.github.com";

export interface PolestarLive {
  release: { tag: string; date: string; url: string };
  openIssues: number;
  bugReports: number;
  helpWanted: { number: number; title: string; url: string }[];
}

interface GitHubIssue {
  number: number;
  title: string;
  html_url: string;
  pull_request?: unknown;
}

async function get(path: string): Promise<unknown> {
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(`${API}${path}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "everloot.app", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(5000),
    next: { revalidate: 3600 },
  } as RequestInit);
  if (!response.ok) throw new Error(`GitHub ${response.status}`);
  return response.json();
}

const count = async (query: string) => {
  const result = (await get(`/search/issues?per_page=1&q=${encodeURIComponent(`repo:${REPO} is:issue is:open ${query}`.trim())}`)) as { total_count: number };
  if (typeof result?.total_count !== "number") throw new Error("GitHub search shape");
  return result.total_count;
};

// One request per label, so the oldest help-wanted issue never falls off a page of newer pull requests.
const labelled = async (label: string) => {
  const issues = await get(`/repos/${REPO}/issues?state=open&per_page=100&labels=${encodeURIComponent(label)}`);
  if (!Array.isArray(issues)) throw new Error("GitHub issues shape");
  return (issues as GitHubIssue[]).filter((issue) => !issue.pull_request);
};

export async function polestarLive(): Promise<PolestarLive | null> {
  try {
    const [release, openIssues, bugReports, helpWanted, goodFirst] = await Promise.all([
      get(`/repos/${REPO}/releases/latest`) as Promise<{ tag_name: string; published_at: string; html_url: string }>,
      count(""),
      count("label:bug"),
      labelled("help wanted"),
      labelled("good first issue"),
    ]);
    if (typeof release?.tag_name !== "string") return null;
    const seen = new Set<number>();
    return {
      release: { tag: release.tag_name, date: release.published_at.slice(0, 10), url: release.html_url },
      openIssues,
      bugReports,
      helpWanted: [...helpWanted, ...goodFirst]
        .filter((issue) => !seen.has(issue.number) && seen.add(issue.number))
        .sort((a, b) => a.number - b.number)
        .map((issue) => ({ number: issue.number, title: issue.title, url: issue.html_url })),
    };
  } catch {
    return null;
  }
}
