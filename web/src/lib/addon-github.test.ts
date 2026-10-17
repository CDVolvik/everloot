import { afterEach, expect, test, vi } from "vitest";
import { addonGithub } from "./addon-github";

const REPO = "someone/AwesomeAddon";
const info = { html_url: `https://github.com/${REPO}`, license: { spdx_id: "MIT" }, archived: false };
const release = { tag_name: "v1.2.0", name: "Spring update", published_at: "2026-10-14T16:50:15Z", html_url: `${info.html_url}/releases/tag/v1.2.0`, body: "Fixed the tooltip." };

function answer(url: string): Response {
  const u = new URL(url);
  if (u.pathname === `/repos/${REPO}`) return Response.json(info);
  if (u.pathname.endsWith("/releases/latest")) return Response.json(release);
  if (u.pathname.endsWith("/commits")) return Response.json([{ commit: { committer: { date: "2026-10-16T08:00:00Z" } } }]);
  if (u.pathname.endsWith("/contributors")) return Response.json([{ login: "a" }, { login: "b" }]);
  if (u.pathname.endsWith("/contents/")) return Response.json([{ name: "README.md", type: "file" }, { name: "Libs", type: "dir" }, { name: "Awesome.toc", type: "file" }]);
  if (u.pathname === "/search/issues") return Response.json({ total_count: 7 });
  throw new Error(`unexpected ${url}`);
}

function stubFetch(respond: (url: string) => Response) {
  const fetch = vi.fn((url: string) => Promise.resolve(respond(url)));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test("reads licence, release, last commit, contributors, open issues and the top-level files, folders first", async () => {
  const fetch = stubFetch(answer);
  const result = await addonGithub(REPO);
  expect(result).toEqual({
    status: "ok",
    data: {
      repo: REPO, url: info.html_url, license: "MIT", archived: false, openIssues: 7,
      release: { tag: "v1.2.0", name: "Spring update", date: "2026-10-14", url: release.html_url, notes: "Fixed the tooltip." },
      lastCommit: "2026-10-16",
      contributors: { count: 2, capped: false },
      tree: [{ name: "Libs", kind: "dir" }, { name: "Awesome.toc", kind: "file" }, { name: "README.md", kind: "file" }],
    },
  });
  for (const [url, init] of fetch.mock.calls as unknown as [string, RequestInit & { next?: { revalidate?: number } }][]) {
    expect(url).toMatch(/^https:\/\/api\.github\.com\//);
    expect(init.next?.revalidate).toBe(3600);
  }
});

test("sends the token only when one is set", async () => {
  const withoutToken = stubFetch(answer);
  await addonGithub(REPO);
  expect((withoutToken.mock.calls[0] as unknown as [string, RequestInit])[1].headers).not.toHaveProperty("Authorization");
  vi.stubEnv("GITHUB_TOKEN", "read-only-token");
  const withToken = stubFetch(answer);
  await addonGithub(REPO);
  expect((withToken.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ Authorization: "Bearer read-only-token" });
});

test("a repository that is gone is reported as missing, not as an outage", async () => {
  stubFetch(() => new Response("{}", { status: 404 }));
  expect(await addonGithub(REPO)).toEqual({ status: "missing" });
});

test("a rate limit is reported as unavailable with the reason", async () => {
  stubFetch(() => new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0" } }));
  expect(await addonGithub(REPO)).toEqual({ status: "unavailable", rateLimited: true });
});

test("a server error or a timeout is unavailable, never thrown", async () => {
  stubFetch(() => new Response("{}", { status: 502 }));
  expect(await addonGithub(REPO)).toEqual({ status: "unavailable", rateLimited: false });
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new DOMException("timeout", "TimeoutError"))));
  expect(await addonGithub(REPO)).toEqual({ status: "unavailable", rateLimited: false });
});

test("a repository with no release still returns the rest; a failed part is left unknown", async () => {
  stubFetch((url) => {
    const { pathname } = new URL(url);
    if (pathname.endsWith("/releases/latest")) return new Response("{}", { status: 404 });
    if (pathname === "/search/issues" || pathname.endsWith("/contributors")) return new Response("{}", { status: 500 });
    return answer(url);
  });
  const result = await addonGithub(REPO);
  expect(result.status).toBe("ok");
  if (result.status !== "ok") return;
  expect(result.data).toMatchObject({ release: null, openIssues: null, contributors: null, license: "MIT", lastCommit: "2026-10-16" });
});

test("no stated licence is null, and a name that is not owner/name never reaches GitHub", async () => {
  stubFetch((url) => (new URL(url).pathname === `/repos/${REPO}` ? Response.json({ ...info, license: { spdx_id: "NOASSERTION" } }) : answer(url)));
  const result = await addonGithub(REPO);
  expect(result.status === "ok" && result.data.license).toBeNull();
  const fetch = stubFetch(answer);
  expect(await addonGithub("../../orgs/x")).toEqual({ status: "missing" });
  expect(fetch).not.toHaveBeenCalled();
});
