import { afterEach, expect, test, vi } from "vitest";
import { polestarLive } from "./polestar-github";

const release = { tag_name: "v0.2.3", published_at: "2026-10-14T16:50:15Z", html_url: "https://github.com/fitzforge/polestar/releases/tag/v0.2.3" };
const issue = (number: number, title: string, pr = false) => ({
  number, title, html_url: `https://github.com/fitzforge/polestar/issues/${number}`, ...(pr ? { pull_request: {} } : {}),
});

function answer(url: string): unknown {
  const u = new URL(url);
  if (u.pathname.endsWith("/releases/latest")) return release;
  if (u.pathname === "/search/issues") return { total_count: u.searchParams.get("q")!.includes("label:bug") ? 12 : 34 };
  if (u.searchParams.get("labels") === "help wanted") return [issue(10, "Navigation: help us map caves")];
  if (u.searchParams.get("labels") === "good first issue") return [issue(57, "Issue forms"), issue(10, "Navigation: help us map caves"), issue(90, "A pull request", true)];
  throw new Error(`unexpected ${url}`);
}

function stubFetch(respond: (url: string) => Response | Promise<Response>) {
  const fetch = vi.fn((url: string) => Promise.resolve(respond(url)));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test("reads the release, issue counts and help-wanted issues, without pull requests or duplicates", async () => {
  const fetch = stubFetch((url) => Response.json(answer(url)));
  expect(await polestarLive()).toEqual({
    release: { tag: "v0.2.3", date: "2026-10-14", url: release.html_url },
    openIssues: 34,
    bugReports: 12,
    helpWanted: [
      { number: 10, title: "Navigation: help us map caves", url: "https://github.com/fitzforge/polestar/issues/10" },
      { number: 57, title: "Issue forms", url: "https://github.com/fitzforge/polestar/issues/57" },
    ],
  });
  expect(fetch).toHaveBeenCalledTimes(5);
  for (const [url, init] of fetch.mock.calls as unknown as [string, RequestInit & { next?: { revalidate?: number } }][]) {
    expect(url).toMatch(/^https:\/\/api\.github\.com\//);
    expect(init.next?.revalidate).toBe(3600);
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  }
});

test("sends GITHUB_TOKEN when it is set", async () => {
  vi.stubEnv("GITHUB_TOKEN", "t0ken");
  const fetch = stubFetch((url) => Response.json(answer(url)));
  await polestarLive();
  expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ Authorization: "Bearer t0ken" });
});

test("any failure gives null: network error, non-200, or JSON of the wrong shape", async () => {
  stubFetch(() => { throw new Error("offline"); });
  expect(await polestarLive()).toBeNull();
  stubFetch(() => new Response("rate limited", { status: 403 }));
  expect(await polestarLive()).toBeNull();
  stubFetch((url) => Response.json(url.includes("/search/") ? { message: "nope" } : answer(url)));
  expect(await polestarLive()).toBeNull();
  stubFetch(() => new Response("not json"));
  expect(await polestarLive()).toBeNull();
});
