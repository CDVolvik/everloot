import { describe, expect, test } from "vitest";
import { parseRegistry, type Snapshot } from "../src/ecosystem.js";
import { countFromLink, fetchProject, refreshSnapshot, type ApiResponse, type Fetcher, type RefreshOptions } from "../src/ecosystem-fetch.js";

const NOW = new Date("2026-10-20T12:00:00.000Z");
const registry = parseRegistry({
  schema: 1, foreverInterfaces: [16001],
  projects: [
    { id: "a", name: "A", kind: "addon", summary: "An addon.", repo: "o/a", toc: "addon/A/A.toc", addonNames: ["A"], verifiedAt: "2026-10-18", evidence: "https://github.com/o/a" },
    { id: "b", name: "B", kind: "tool", summary: "A tool.", repo: "o/b", addonNames: [], verifiedAt: "2026-10-18", evidence: "https://github.com/o/b" },
  ],
});

const reply = (status: number, body: unknown = null, headers: Record<string, string> = {}): ApiResponse => ({
  status,
  headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
  text: async () => (body === null ? "" : typeof body === "string" ? body : JSON.stringify(body)),
});

/** Routes by path prefix; every call is logged so tests can count requests and read headers. */
function server(routes: Record<string, () => ApiResponse>) {
  const calls: { path: string; headers: Record<string, string> }[] = [];
  const fetcher: Fetcher = async (url, init) => {
    const path = url.replace("https://api.github.com", "");
    calls.push({ path, headers: init.headers });
    const key = Object.keys(routes).find((k) => path.startsWith(k));
    return key ? routes[key]() : reply(404);
  };
  return { fetcher, calls };
}

const happy = (repo: string) => ({
  [`/repos/${repo}/issues`]: () => reply(200, []),
  [`/repos/${repo}/contents/`]: () => reply(200, { encoding: "base64", content: Buffer.from("## Interface: 16001\n").toString("base64") }),
  [`/repos/${repo}/contributors`]: () => reply(200, [{}], { link: `<https://api.github.com/repositories/1/contributors?per_page=1&anon=false&page=7>; rel="next", <https://api.github.com/repositories/1/contributors?per_page=1&anon=false&page=7>; rel="last"` }),
  [`/repos/${repo}/commits?per_page=1&since`]: () => reply(200, [{}], { link: `<https://x/commits?per_page=1&since=z&page=42>; rel="last"` }),
  [`/repos/${repo}/commits?per_page=1`]: () => reply(200, [{ commit: { committer: { date: "2026-10-19T00:00:00Z" } } }]),
  [`/repos/${repo}/releases/latest`]: () => reply(200, { tag_name: "v1", published_at: "2026-10-01T00:00:00Z", html_url: `https://github.com/${repo}/releases/tag/v1` }),
  "/search/issues": () => reply(200, { total_count: 4 }),
  [`/repos/${repo}`]: () => reply(200, { stargazers_count: 12, archived: false, license: { spdx_id: "MIT" } }),
});

function options(s: ReturnType<typeof server>, extra: Partial<RefreshOptions> = {}): RefreshOptions & { slept: number[] } {
  const slept: number[] = [];
  return { fetcher: s.fetcher, now: () => NOW, sleep: async (ms) => { slept.push(ms); }, slept, ...extra };
}

describe("reading one project", () => {
  test("fills every field from GitHub's answers, without a token", async () => {
    const s = server(happy("o/a"));
    const o = options(s);
    const m = await fetchProject(registry.projects[0], o);
    expect(m).toMatchObject({
      status: "ok", stars: 12, license: "MIT", archived: false, lastCommit: "2026-10-19T00:00:00Z",
      release: { tag: "v1", date: "2026-10-01T00:00:00Z" }, commits4w: 42, contributors: 7,
      openIssues: 4, closedIssues: 4, interfaces: [16001], medianFirstResponseHours: null, responseSample: 0,
    });
    expect(s.calls.every((c) => !("Authorization" in c.headers))).toBe(true);
    expect(s.calls.some((c) => c.path.includes("/issues?state=all"))).toBe(false); // first-reply lookups need a token
    expect(s.calls.length).toBe(8);
  });
  test("a token is sent as a bearer header and turns on the first-reply lookup", async () => {
    const s = server(happy("o/a"));
    await fetchProject(registry.projects[0], options(s, { token: "t0k" }));
    expect(s.calls[0].headers.Authorization).toBe("Bearer t0k");
    expect(s.calls.some((c) => c.path.includes("/issues?state=all"))).toBe(true);
  });
  test("a missing repository is an answer, not an error", async () => {
    const m = await fetchProject(registry.projects[0], options(server({ "/repos/o/a": () => reply(404) })));
    expect(m.status).toBe("missing");
  });
  test("NOASSERTION is no licence", async () => {
    const s = server({ ...happy("o/b"), "/repos/o/b": () => reply(200, { stargazers_count: 1, license: { spdx_id: "NOASSERTION" } }) });
    expect((await fetchProject(registry.projects[1], options(s))).license).toBeNull();
  });
  test("countFromLink reads the last page", () => {
    expect(countFromLink('<https://a/b?per_page=1&page=3>; rel="last"')).toBe(3);
    expect(countFromLink(null)).toBeNull();
  });
});

describe("backoff", () => {
  test("a 429 with retry-after waits that long, then succeeds", async () => {
    let n = 0;
    const s = server({ ...happy("o/b"), "/repos/o/b": () => (n++ === 0 ? reply(429, "slow down", { "retry-after": "5" }) : reply(200, { stargazers_count: 1 })) });
    const o = options(s);
    const m = await fetchProject(registry.projects[1], o);
    expect(m.status).toBe("ok");
    expect(o.slept[0]).toBe(5000);
  });
  test("an exhausted primary limit waits for the reset time", async () => {
    let n = 0;
    const reset = String(Math.floor(NOW.getTime() / 1000) + 30);
    const s = server({ ...happy("o/b"), "/repos/o/b": () => (n++ === 0 ? reply(403, "", { "x-ratelimit-remaining": "0", "x-ratelimit-reset": reset }) : reply(200, { stargazers_count: 1 })) });
    const o = options(s);
    await fetchProject(registry.projects[1], o);
    expect(o.slept[0]).toBe(30_000);
  });
  test("with no hint it waits a minute and doubles", async () => {
    let n = 0;
    const s = server({ ...happy("o/b"), "/repos/o/b": () => (n++ < 2 ? reply(403, "You have exceeded a secondary rate limit") : reply(200, { stargazers_count: 1 })) });
    const o = options(s, { maxWaitMs: 600_000 });
    await fetchProject(registry.projects[1], o);
    expect(o.slept.slice(0, 2)).toEqual([60_000, 120_000]);
  });
  test("a wait longer than the cap stops the run instead of sleeping", async () => {
    const s = server({ "/repos/o/a": () => reply(429, "", { "retry-after": "3600" }) });
    const o = options(s);
    await expect(fetchProject(registry.projects[0], o)).rejects.toThrow(/rate limit/);
    expect(o.slept).toEqual([]);
  });
  test("a plain 403 is not a rate limit", async () => {
    const s = server({ ...happy("o/b"), "/repos/o/b": () => reply(403, "Resource not accessible") });
    await expect(fetchProject(registry.projects[1], options(s))).rejects.toThrow("HTTP 403");
  });
  test("a server error is retried a few times with short waits, then reported", async () => {
    const s = server({ "/repos/o/a": () => reply(502) });
    const o = options(s);
    await expect(fetchProject(registry.projects[0], o)).rejects.toThrow("HTTP 502");
    expect(o.slept).toEqual([1000, 2000, 4000]);
  });
});

describe("refreshing the snapshot", () => {
  const empty: Snapshot = { schema: 1, refreshedAt: null, projects: {}, history: {} };

  test("reads every project, stamps the time and records one star point", async () => {
    const s = server({ ...happy("o/a"), ...happy("o/b") });
    const r = await refreshSnapshot(registry, empty, options(s));
    expect(r.refreshed).toEqual(["a", "b"]);
    expect(r.snapshot.refreshedAt).toBe(NOW.toISOString());
    expect(r.snapshot.history.a).toEqual([{ at: NOW.toISOString(), stars: 12 }]);
  });
  test("a project read less than three hours ago is skipped, and --force reads it anyway", async () => {
    const first = await refreshSnapshot(registry, empty, options(server({ ...happy("o/a"), ...happy("o/b") })));
    const s = server({ ...happy("o/a"), ...happy("o/b") });
    const again = await refreshSnapshot(registry, first.snapshot, options(s));
    expect(again.skipped).toEqual(["a", "b"]);
    expect(s.calls).toHaveLength(0);
    const forced = await refreshSnapshot(registry, first.snapshot, options(s, { force: true }));
    expect(forced.refreshed).toEqual(["a", "b"]);
  });
  test("a second read the same day replaces that day's star point", async () => {
    const first = await refreshSnapshot(registry, empty, options(server({ ...happy("o/a"), ...happy("o/b") })));
    const later = await refreshSnapshot(registry, first.snapshot, options(server({ ...happy("o/a"), ...happy("o/b") }), { force: true }));
    expect(later.snapshot.history.a).toHaveLength(1);
  });
  test("a failing project keeps its last answer and its old time; the others still refresh", async () => {
    const old = { ...(await refreshSnapshot(registry, empty, options(server({ ...happy("o/a"), ...happy("o/b") })))).snapshot };
    const later = new Date(NOW.getTime() + 4 * 3_600_000);
    const s = server({ ...happy("o/b"), "/repos/o/a": () => reply(500) });
    const r = await refreshSnapshot(registry, old, options(s, { now: () => later }));
    expect(r.errors.map((e) => e.id)).toEqual(["a"]);
    expect(r.snapshot.projects.a).toEqual(old.projects.a);
    expect(r.snapshot.projects.b.fetchedAt).toBe(later.toISOString());
  });
  test("a rate limit stops the run: nothing after it is requested, and what was known stays", async () => {
    const s = server({ "/repos/o/a": () => reply(429, "", { "retry-after": "7200" }), ...happy("o/b") });
    const r = await refreshSnapshot(registry, empty, options(s));
    expect(r.stoppedBy).not.toBeNull();
    expect(r.skipped).toEqual(["b"]);
    expect(s.calls.every((c) => !c.path.startsWith("/repos/o/b"))).toBe(true);
    expect(r.snapshot.refreshedAt).toBeNull();
  });
  test("a project removed from the registry drops out of the snapshot", async () => {
    const first = await refreshSnapshot(registry, empty, options(server({ ...happy("o/a"), ...happy("o/b") })));
    const onlyA = parseRegistry({ schema: 1, foreverInterfaces: [16001], projects: [{ id: "a", name: "A", kind: "addon", summary: "x", repo: "o/a", verifiedAt: "2026-10-18", evidence: "https://github.com/o/a" }] });
    const r = await refreshSnapshot(onlyA, first.snapshot, options(server({})));
    expect(Object.keys(r.snapshot.projects)).toEqual(["a"]);
    expect(Object.keys(r.snapshot.history)).toEqual(["a"]);
  });
  test("star history older than 35 days is pruned", async () => {
    const stale = { ...empty, history: { a: [{ at: "2026-08-01T00:00:00.000Z", stars: 1 }] } };
    const r = await refreshSnapshot(registry, stale, options(server({ ...happy("o/a"), ...happy("o/b") })));
    expect(r.snapshot.history.a).toEqual([{ at: NOW.toISOString(), stars: 12 }]);
  });
});
