import { afterEach, expect, test, vi } from "vitest";
import { polestarLive } from "./polestar-github";

const release = { tag_name: "v0.2.3", published_at: "2026-10-14T16:50:15Z", html_url: "https://github.com/fitzforge/polestar/releases/tag/v0.2.3" };
const issue = (number: number, title: string, labels: string[], pr = false) => ({
  number, title, html_url: `https://github.com/fitzforge/polestar/issues/${number}`,
  labels: labels.map((name) => ({ name })), ...(pr ? { pull_request: {} } : {}),
});
const issues = [
  issue(10, "Navigation: help us map caves", ["help wanted", "good first issue", "navigation"]),
  issue(57, "Issue forms: a Feature request form", ["good first issue"]),
  issue(80, "Wrong trainer", ["bug", "guide:01-elwynn-forest"]),
  issue(84, "Guides: Teldrassil says Shanda is up the ramp", ["guide:01-teldrassil"], true),
  issue(51, "Forever quests have no prerequisites", []),
];

function stubFetch(answer: (url: string) => Response | Promise<Response>) {
  const fetch = vi.fn((url: string) => Promise.resolve(answer(url)));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

test("reads the latest release and the open issues, leaving pull requests out", async () => {
  const fetch = stubFetch((url) => Response.json(url.includes("/releases/latest") ? release : issues));
  const live = await polestarLive();
  expect(live).toEqual({
    release: { tag: "v0.2.3", date: "2026-10-14", url: release.html_url },
    openIssues: 4,
    guideReports: 1,
    capped: false,
    helpWanted: [
      { number: 10, title: "Navigation: help us map caves", url: "https://github.com/fitzforge/polestar/issues/10" },
      { number: 57, title: "Issue forms: a Feature request form", url: "https://github.com/fitzforge/polestar/issues/57" },
    ],
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  for (const [url, init] of fetch.mock.calls as unknown as [string, RequestInit & { next?: { revalidate?: number } }][]) {
    expect(url).toMatch(/^https:\/\/api\.github\.com\/repos\/fitzforge\/polestar\//);
    expect(init.next?.revalidate).toBe(3600);
  }
});

test("any failure gives null: network error, non-200, or JSON of the wrong shape", async () => {
  stubFetch(() => { throw new Error("offline"); });
  expect(await polestarLive()).toBeNull();
  stubFetch(() => new Response("rate limited", { status: 403 }));
  expect(await polestarLive()).toBeNull();
  stubFetch((url) => Response.json(url.includes("/releases/latest") ? release : { message: "nope" }));
  expect(await polestarLive()).toBeNull();
  stubFetch(() => new Response("not json"));
  expect(await polestarLive()).toBeNull();
});
