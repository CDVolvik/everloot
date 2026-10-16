// Live details for the Polestar page from GitHub's REST API: no token, cached for an hour, so at most
// two requests an hour. Any failure is null and the page falls back to its static facts.

const API = "https://api.github.com/repos/fitzforge/polestar";

export interface PolestarLive {
  release: { tag: string; date: string; url: string };
  openIssues: number;
  guideReports: number;
  /** One page of 100 came back full: the counts are lower bounds. */
  capped: boolean;
  helpWanted: { number: number; title: string; url: string }[];
}

interface GitHubIssue {
  number: number;
  title: string;
  html_url: string;
  labels: { name: string }[];
  pull_request?: unknown;
}

async function get(path: string): Promise<unknown> {
  const response = await fetch(`${API}${path}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "everloot.app" },
    signal: AbortSignal.timeout(5000),
    next: { revalidate: 3600 },
  } as RequestInit);
  if (!response.ok) throw new Error(`GitHub ${response.status}`);
  return response.json();
}

export async function polestarLive(): Promise<PolestarLive | null> {
  try {
    const [release, issues] = (await Promise.all([get("/releases/latest"), get("/issues?state=open&per_page=100")])) as [
      { tag_name: string; published_at: string; html_url: string },
      GitHubIssue[],
    ];
    if (!Array.isArray(issues) || typeof release?.tag_name !== "string") return null;
    // The issues endpoint returns pull requests too.
    const open = issues.filter((issue) => !issue.pull_request);
    const labelled = (issue: GitHubIssue, test: (name: string) => boolean) => issue.labels.some((label) => test(label.name));
    return {
      release: { tag: release.tag_name, date: release.published_at.slice(0, 10), url: release.html_url },
      openIssues: open.length,
      guideReports: open.filter((issue) => labelled(issue, (name) => name.startsWith("guide:"))).length,
      capped: issues.length >= 100,
      helpWanted: open
        .filter((issue) => labelled(issue, (name) => name === "help wanted" || name === "good first issue"))
        .map((issue) => ({ number: issue.number, title: issue.title, url: issue.html_url })),
    };
  } catch {
    return null;
  }
}
