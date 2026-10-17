/**
 * Reads GitHub's public REST API for every project in the ecosystem registry and keeps the answers in a
 * committed snapshot. Serial requests, an optional token from the environment, and the backoff GitHub's
 * documentation asks for: retry-after, then the reset time, then a minute doubling, and a stop (never a
 * hammer) when the wait is long. A project that cannot be read keeps its last answer and its old timestamp.
 * Node only (file access): the site reads through ecosystem.ts instead.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  EMPTY_SNAPSHOT, medianFirstResponse, parseSnapshot, parseTocInterfaces,
  type IssueSample, type ProjectMetrics, type Registry, type RegistryProject, type Snapshot,
} from "./ecosystem.js";

const API = "https://api.github.com";
export const USER_AGENT = "Everloot/1.0 (+https://everloot.app; hello@everloot.app)";
const DAY = 86_400_000;

export interface ApiResponse { status: number; headers: { get(name: string): string | null }; text(): Promise<string> }
export type Fetcher = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<ApiResponse>;

export interface RefreshOptions {
  fetcher: Fetcher;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  /** Optional. With a token the limit is 5,000 an hour and the first-response lookups run. */
  token?: string;
  /** A project read less than this long ago is left alone. Default 3 hours. */
  minIntervalMs?: number;
  force?: boolean;
  /** Longest single wait for a rate limit before the run stops. Default 2 minutes. */
  maxWaitMs?: number;
  /** Search has its own, lower limit: 10 a minute without a token, 30 with one. */
  searchGapMs?: number;
}

/** A run that must stop: GitHub says to wait longer than we are willing to. */
export class RateLimited extends Error {
  constructor(readonly waitMs: number) { super(`GitHub rate limit: wait ${Math.ceil(waitMs / 1000)} s`); }
}
class Unavailable extends Error {}

interface Answer { status: number; json: unknown; headers: ApiResponse["headers"] }

async function request(path: string, o: RefreshOptions, tries = 4): Promise<Answer> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": USER_AGENT, "X-GitHub-Api-Version": "2022-11-28" };
  if (o.token) headers.Authorization = `Bearer ${o.token}`;
  const maxWait = o.maxWaitMs ?? 120_000;
  for (let attempt = 0; ; attempt++) {
    let res: ApiResponse;
    try {
      res = await o.fetcher(`${API}${path}`, { headers, signal: AbortSignal.timeout(15_000) });
    } catch {
      if (attempt + 1 >= tries) throw new Unavailable("network");
      await o.sleep(1000 * 2 ** attempt);
      continue;
    }
    const body = await res.text();
    const remaining = res.headers.get("x-ratelimit-remaining");
    const limited = res.status === 429 || (res.status === 403 && (remaining === "0" || res.headers.get("retry-after") !== null || /rate limit/i.test(body)));
    if (limited) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      let wait: number;
      if (Number.isFinite(retryAfter) && retryAfter > 0) wait = retryAfter * 1000;
      else if (remaining === "0" && Number.isFinite(reset) && reset > 0) wait = Math.max(reset * 1000 - o.now().getTime(), 1000);
      else wait = 60_000 * 2 ** attempt;
      if (wait > maxWait || attempt + 1 >= tries) throw new RateLimited(wait);
      await o.sleep(wait);
      continue;
    }
    if (res.status >= 500) {
      if (attempt + 1 >= tries) throw new Unavailable(`HTTP ${res.status}`);
      await o.sleep(1000 * 2 ** attempt);
      continue;
    }
    let json: unknown = null;
    if (body) { try { json = JSON.parse(body); } catch { json = null; } }
    return { status: res.status, json, headers: res.headers };
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === "string" ? v : null);

/** The total number of pages of a `per_page=1` list, which is the number of items. */
export function countFromLink(link: string | null): number | null {
  const m = link ? /[?&]page=(\d+)[^>]*>;\s*rel="last"/.exec(link) : null;
  return m ? Number(m[1]) : null;
}

async function ok(path: string, o: RefreshOptions): Promise<unknown | null> {
  const a = await request(path, o);
  if (a.status === 404 || a.status === 204 || a.status === 409 || a.status === 451) return null;
  if (a.status >= 400) return null;
  return a.json;
}

async function searchCount(repo: string, state: "open" | "closed", o: RefreshOptions): Promise<number | null> {
  await o.sleep(o.searchGapMs ?? (o.token ? 2200 : 6500));
  const q = encodeURIComponent(`repo:${repo} is:issue is:${state}`);
  const json = await ok(`/search/issues?per_page=1&q=${q}`, o);
  return isRecord(json) ? num(json.total_count) : null;
}

/** Up to 15 recent issues (no pull requests, none opened by the owner) with the time of the first outside reply. */
async function issueSamples(repo: string, o: RefreshOptions): Promise<IssueSample[] | null> {
  const owner = repo.split("/")[0].toLowerCase();
  const list = await ok(`/repos/${repo}/issues?state=all&sort=created&direction=desc&per_page=40`, o);
  if (!Array.isArray(list)) return null;
  const cutoff = o.now().getTime() - 180 * DAY;
  const picked = list
    .filter(isRecord)
    .filter((i) => !i.pull_request && isRecord(i.user) && str(i.user.login)?.toLowerCase() !== owner && Date.parse(str(i.created_at) ?? "") >= cutoff)
    .slice(0, 15);
  const out: IssueSample[] = [];
  for (const issue of picked) {
    const comments = await ok(`/repos/${repo}/issues/${num(issue.number)}/comments?per_page=10`, o);
    const author = isRecord(issue.user) ? str(issue.user.login) : null;
    const first = Array.isArray(comments)
      ? comments.filter(isRecord).find((c) => isRecord(c.user) && str(c.user.login) !== author && c.user.type !== "Bot")
      : undefined;
    out.push({ createdAt: str(issue.created_at)!, firstResponseAt: first ? str(first.created_at) : null });
  }
  return out;
}

/** Everything for one project. Throws RateLimited or Unavailable; a missing repo is an answer, not an error. */
export async function fetchProject(project: RegistryProject, o: RefreshOptions): Promise<ProjectMetrics> {
  const now = o.now();
  const base = (status: "ok" | "missing"): ProjectMetrics => ({
    status, fetchedAt: now.toISOString(), stars: null, archived: false, license: null, lastCommit: null, release: null,
    commits4w: null, contributors: null, openIssues: null, closedIssues: null,
    medianFirstResponseHours: null, responseSample: 0, interfaces: null,
  });
  const repo = project.repo;
  const info = await request(`/repos/${repo}`, o);
  if (info.status === 404 || info.status === 410 || info.status === 451) return base("missing");
  if (info.status !== 200 || !isRecord(info.json)) throw new Unavailable(`HTTP ${info.status}`);
  const m = base("ok");
  m.stars = num(info.json.stargazers_count);
  m.archived = info.json.archived === true;
  const spdx = isRecord(info.json.license) ? str(info.json.license.spdx_id) : null;
  m.license = spdx && spdx !== "NOASSERTION" ? spdx : null;

  const release = await ok(`/repos/${repo}/releases/latest`, o);
  if (isRecord(release) && str(release.tag_name) && str(release.published_at)) {
    m.release = { tag: str(release.tag_name)!, date: str(release.published_at)!, url: str(release.html_url) ?? `https://github.com/${repo}/releases` };
  }
  const commits = await ok(`/repos/${repo}/commits?per_page=1`, o);
  if (Array.isArray(commits) && isRecord(commits[0]) && isRecord(commits[0].commit) && isRecord(commits[0].commit.committer)) {
    m.lastCommit = str(commits[0].commit.committer.date);
  }
  // The statistics endpoint answers 202 for minutes on a cold cache, so commits are counted from a list
  // with per_page=1: the number of pages is the number of commits (merge commits included).
  const since = new Date(now.getTime() - 28 * DAY).toISOString();
  const recent = await request(`/repos/${repo}/commits?per_page=1&since=${encodeURIComponent(since)}`, o);
  if (recent.status === 200 && Array.isArray(recent.json)) m.commits4w = countFromLink(recent.headers.get("link")) ?? recent.json.length;
  const contributors = await request(`/repos/${repo}/contributors?per_page=1&anon=false`, o);
  if (contributors.status === 200) {
    m.contributors = countFromLink(contributors.headers.get("link")) ?? (Array.isArray(contributors.json) ? contributors.json.length : null);
  } else if (contributors.status === 204) {
    m.contributors = 0;
  }
  m.openIssues = await searchCount(repo, "open", o);
  m.closedIssues = await searchCount(repo, "closed", o);

  // First-reply time costs a request per issue, so it only runs with a token.
  if (o.token) {
    const samples = await issueSamples(repo, o);
    if (samples) {
      const r = medianFirstResponse(samples, now);
      m.medianFirstResponseHours = r.hours;
      m.responseSample = r.sample;
    }
  }
  if (project.toc) {
    const file = await ok(`/repos/${repo}/contents/${project.toc.split("/").map(encodeURIComponent).join("/")}`, o);
    if (isRecord(file) && file.encoding === "base64" && typeof file.content === "string") {
      m.interfaces = parseTocInterfaces(Buffer.from(file.content, "base64").toString("utf8"));
    }
  }
  return m;
}

export interface RefreshReport { snapshot: Snapshot; refreshed: string[]; skipped: string[]; errors: { id: string; error: string }[]; stoppedBy: RateLimited | null }

const dayStamp = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Refreshes what is due, one project at a time, in registry order. On a rate limit the run stops and what
 * was not reached keeps its last answer. Projects removed from the registry drop out of the snapshot.
 */
export async function refreshSnapshot(registry: Registry, previous: Snapshot, o: RefreshOptions): Promise<RefreshReport> {
  const minInterval = o.minIntervalMs ?? 3 * 3_600_000;
  const now = o.now();
  const ids = new Set(registry.projects.map((p) => p.id));
  const projects: Snapshot["projects"] = {};
  const history: Snapshot["history"] = {};
  for (const id of ids) {
    if (previous.projects[id]) projects[id] = previous.projects[id];
    if (previous.history[id]) history[id] = [...previous.history[id]];
  }
  const report: RefreshReport = { snapshot: previous, refreshed: [], skipped: [], errors: [], stoppedBy: null };
  for (const project of registry.projects) {
    const last = projects[project.id];
    if (!o.force && last && now.getTime() - Date.parse(last.fetchedAt) < minInterval) { report.skipped.push(project.id); continue; }
    if (report.stoppedBy) { report.skipped.push(project.id); continue; }
    try {
      const metrics = await fetchProject(project, o);
      projects[project.id] = metrics;
      report.refreshed.push(project.id);
      if (metrics.status === "ok" && metrics.stars !== null) {
        const today = dayStamp(now);
        const points = (history[project.id] ?? []).filter((p) => p.at.slice(0, 10) !== today);
        points.push({ at: now.toISOString(), stars: metrics.stars });
        history[project.id] = points.filter((p) => now.getTime() - Date.parse(p.at) <= 35 * DAY);
      }
    } catch (error) {
      if (error instanceof RateLimited) { report.stoppedBy = error; report.errors.push({ id: project.id, error: error.message }); continue; }
      report.errors.push({ id: project.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  report.snapshot = { schema: 1, refreshedAt: report.refreshed.length ? now.toISOString() : previous.refreshedAt, projects, history };
  return report;
}

export function loadSnapshotFile(path: string): Snapshot {
  if (!existsSync(path)) return EMPTY_SNAPSHOT;
  return parseSnapshot(JSON.parse(readFileSync(path, "utf8")));
}

export function saveSnapshotFile(path: string, snapshot: Snapshot): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`);
}
