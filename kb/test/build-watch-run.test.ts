import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChangeEntry } from "../src/build-watch/changes.js";
import { readCommitted } from "../src/build-watch/game-data.js";
import { branchFor, type PrRef } from "../src/build-watch/plan.js";
import { runWatch, type Extracted, type WatchConfig, type WatchDeps, type WatchOptions } from "../src/build-watch/watch.js";
import { CONFIG_A, CONFIG_B, extracted, node, versionsText } from "./build-watch-fixtures.js";

const config: WatchConfig = { region: "us", products: [{ product: "wow_classic_beta", label: "beta", live: false }] };
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "everloot-watch-test-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const options = (over: Partial<WatchOptions> = {}): WatchOptions => ({
  config, gameDataDir: join(dir, "game-data"), outDir: join(dir, "out"),
  dryRun: false, checkOnly: false, redo: false, ...over,
});

function fakes(build: { id: number; config?: string }, got: () => Extracted, prs: PrRef[] = []) {
  const calls = { extract: 0, versions: 0 };
  const deps: WatchDeps = {
    fetchVersions: async () => { calls.versions++; return versionsText(build.id, build.config ?? CONFIG_A); },
    listPrs: async () => prs,
    extract: async () => { calls.extract++; return got(); },
    now: () => new Date("2026-10-17T12:00:00Z"),
  };
  return { deps, calls };
}

const v1 = () => extracted(70450, [node(1, "Mutilate"), node(2, "Evasion")], { scope: "party" });
const v2 = () => extracted(70460, [node(1, "Mutilate"), node(3, "Vigor")], { config: CONFIG_B, scope: "raid" });
const changeFile = (id: number) => join(dir, "game-data", "changes", `wow_classic_beta-${id}.json`);

describe("runWatch", () => {
  it("writes a baseline the first time and a plan for the workflow", async () => {
    const { deps } = fakes({ id: 70450 }, v1);
    const [r] = await runWatch(options(), deps);
    expect(r).toMatchObject({ action: "create", branch: "game-build/wow_classic_beta-70450-aaaaaaaa", title: "Game build 1.60.1.70450: data update" });
    expect(readCommitted(join(dir, "game-data"), "wow_classic_beta")!.classes).toHaveLength(1);
    const entry = ChangeEntry.parse(JSON.parse(readFileSync(changeFile(70450), "utf8")));
    expect(entry).toMatchObject({ initial: true, spoiler: true });
    expect(JSON.parse(readFileSync(join(dir, "out", "plan.json"), "utf8"))[0].branch).toBe(r.branch);
    expect(readFileSync(r.bodyFile!, "utf8")).toContain("First data for this product");
  });

  it("commits no tooltip text", async () => {
    await runWatch(options(), fakes({ id: 70450 }, v1).deps);
    const text = readdirSync(join(dir, "game-data", "wow_classic_beta", "talents")).map((f) => readFileSync(join(dir, "game-data", "wow_classic_beta", "talents", f), "utf8")).join("");
    expect(text).not.toContain("tooltip with");
    expect(text).not.toContain('"description"');
  });

  it("does nothing and reads no game files when the build is already committed", async () => {
    await runWatch(options(), fakes({ id: 70450 }, v1).deps);
    const { deps, calls } = fakes({ id: 70450 }, v1);
    const [r] = await runWatch(options(), deps);
    expect(r.action).toBe("up-to-date");
    expect(calls.extract).toBe(0);
  });

  it("describes what a new build changed against the committed data", async () => {
    await runWatch(options(), fakes({ id: 70450 }, v1).deps);
    const [r] = await runWatch(options(), fakes({ id: 70460, config: CONFIG_B }, v2).deps);
    expect(r.action).toBe("create");
    const entry = ChangeEntry.parse(JSON.parse(readFileSync(changeFile(70460), "utf8")));
    expect(entry.previous).toMatchObject({ buildId: 70450 });
    expect(entry.talents!.added.map((a) => a.name)).toEqual(["Vigor"]);
    expect(entry.talents!.removed.map((a) => a.name)).toEqual(["Evasion"]);
    expect(entry.raidBuffs).toMatchObject({ comparedTo: { buildId: 70450 }, scopeChanges: [{ id: "battle-shout", before: "party", after: "raid" }] });
    expect(readCommitted(join(dir, "game-data"), "wow_classic_beta")!.manifest.build.buildId).toBe(70460);
  });

  it("opens no second pull request while one is open, and extracts nothing", async () => {
    const open: PrRef = { number: 40, state: "OPEN", headRefName: branchFor("wow_classic_beta", { buildId: 70450, buildConfig: CONFIG_A }) };
    const { deps, calls } = fakes({ id: 70450 }, v1, [open]);
    const [r] = await runWatch(options(), deps);
    expect(r).toMatchObject({ action: "open", pr: 40 });
    expect(calls.extract).toBe(0);
    expect(existsSync(join(dir, "game-data"))).toBe(false);
  });

  it("refreshes the open pull request when asked", async () => {
    const open: PrRef = { number: 40, state: "OPEN", headRefName: branchFor("wow_classic_beta", { buildId: 70450, buildConfig: CONFIG_A }) };
    const [r] = await runWatch(options({ redo: true }), fakes({ id: 70450 }, v1, [open]).deps);
    expect(r).toMatchObject({ action: "update", pr: 40, branch: open.headRefName });
  });

  it("leaves a declined build alone", async () => {
    const closed: PrRef = { number: 41, state: "CLOSED", headRefName: branchFor("wow_classic_beta", { buildId: 70450, buildConfig: CONFIG_A }) };
    const { deps, calls } = fakes({ id: 70450 }, v1, [closed]);
    expect((await runWatch(options(), deps))[0]).toMatchObject({ action: "declined", pr: 41 });
    expect(calls.extract).toBe(0);
  });

  it("lists older open pull requests in the body of the newer one", async () => {
    const old: PrRef = { number: 40, state: "OPEN", headRefName: branchFor("wow_classic_beta", { buildId: 70450, buildConfig: CONFIG_A }) };
    const [r] = await runWatch(options(), fakes({ id: 70460, config: CONFIG_B }, v2, [old]).deps);
    expect(readFileSync(r.bodyFile!, "utf8")).toContain("#40");
  });

  it("in check mode only decides", async () => {
    const { deps, calls } = fakes({ id: 70450 }, v1);
    const [r] = await runWatch(options({ checkOnly: true }), deps);
    expect(r.action).toBe("create");
    expect(calls.extract).toBe(0);
    expect(existsSync(join(dir, "game-data"))).toBe(false);
  });

  it("in a dry run writes only under the out directory", async () => {
    const [r] = await runWatch(options({ dryRun: true }), fakes({ id: 70450 }, v1).deps);
    expect(r.summary).toContain("first data for this product");
    expect(existsSync(join(dir, "game-data"))).toBe(false);
    expect(existsSync(join(dir, "out", "dry-run", "game-data", "wow_classic_beta", "manifest.json"))).toBe(true);
  });

  it("trusts the files when the CDN is a build ahead of the version service", async () => {
    const [r] = await runWatch(options(), fakes({ id: 70450 }, v2).deps);
    expect(r).toMatchObject({ buildId: 70460, branch: "game-build/wow_classic_beta-70460-bbbbbbbb" });
  });

  it("reports a failing product and still handles the next", async () => {
    const two: WatchConfig = { region: "us", products: [{ product: "broken", label: "x", live: false }, ...config.products] };
    const { deps } = fakes({ id: 70450 }, v1);
    const fetchVersions = deps.fetchVersions;
    deps.fetchVersions = async (p) => { if (p === "broken") throw new Error("HTTP 503"); return fetchVersions(p); };
    const results = await runWatch(options({ config: two }), deps);
    expect(results[0]).toMatchObject({ product: "broken", error: "HTTP 503" });
    expect(results[1].action).toBe("create");
  });

  it("fails on an extraction error and writes nothing", async () => {
    const { deps } = fakes({ id: 70450 }, () => { throw new Error("could not read TraitNode (no layout)"); });
    const [r] = await runWatch(options(), deps);
    expect(r.error).toContain("TraitNode");
    expect(existsSync(join(dir, "game-data"))).toBe(false);
  });

  it("refuses an odd version name from the service", async () => {
    const { deps } = fakes({ id: 70450 }, v1);
    deps.fetchVersions = async () => versionsText(70450, CONFIG_A, "1.0; $(evil)");
    expect((await runWatch(options(), deps))[0].error).toContain("odd version");
  });

  it("compares the raid buff table with the committed one, and commits the new one", async () => {
    await runWatch(options(), fakes({ id: 70450 }, v1).deps);
    expect(readCommitted(join(dir, "game-data"), "wow_classic_beta")!.raidBuffs!.build.buildId).toBe(70450);
    await runWatch(options(), fakes({ id: 70460, config: CONFIG_B }, v2).deps);
    expect(readCommitted(join(dir, "game-data"), "wow_classic_beta")!.raidBuffs!.build.buildId).toBe(70460);
  });

  it("a rerun of a build whose pull request was not merged gives the same comparison", async () => {
    await runWatch(options(), fakes({ id: 70450 }, v1).deps);
    await runWatch(options(), fakes({ id: 70460, config: CONFIG_B }, v2).deps);
    const first = readFileSync(changeFile(70460), "utf8");
    // Main still has build 70450's data: put it back, then run the new build again.
    rmSync(join(dir, "game-data"), { recursive: true });
    await runWatch(options(), fakes({ id: 70450 }, v1).deps);
    await runWatch(options(), fakes({ id: 70460, config: CONFIG_B }, v2).deps);
    expect(readFileSync(changeFile(70460), "utf8")).toBe(first);
  });
});
