import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { checkBuilds, loadRegistry, parseVersions, recordBuilds, saveRegistry, type BuildRegistry } from "../src/builds.js";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/versions/${name}`, import.meta.url), "utf8");
const BETA = "84bea4233331e390fda8724c6f91ffa5";
const empty = (): BuildRegistry => ({ builds: [] });
const t0 = new Date("2026-10-17T06:00:00Z");
const t1 = new Date("2026-10-17T12:00:00Z");

test("parses Blizzard's version list: one row per region, with the build's identity", () => {
  const parsed = parseVersions(fixture("wow_classic_beta-70450.txt"));
  expect(parsed.seqn).toBe(4083216);
  expect(parsed.rows.map((r) => r.region)).toEqual(["us", "eu", "kr", "tw"]);
  expect(parsed.rows[0]).toEqual({
    region: "us",
    buildConfig: BETA,
    cdnConfig: "f065eade5276a5ac05606e60a4c5a1f7",
    buildId: 70450,
    version: "1.60.1.70450",
    productConfig: "fcfd1bc39031f5921d00aee2d869adb5",
  });
});

test("Windows line endings parse the same", () => {
  const lf = parseVersions(fixture("wow_classic_beta-70450.txt"));
  expect(parseVersions(fixture("wow_classic_beta-70450.txt").replace(/\r?\n/g, "\r\n"))).toEqual(lf);
});

test("a new build is recorded once, queued, with its regions collapsed", () => {
  const { registry, added } = recordBuilds(empty(), "wow_classic_beta", parseVersions(fixture("wow_classic_beta-70450.txt")), t0);
  expect(added).toHaveLength(1);
  expect(registry.builds).toEqual([{
    key: `wow_classic_beta:${BETA}`,
    product: "wow_classic_beta",
    buildConfig: BETA,
    buildId: 70450,
    version: "1.60.1.70450",
    regions: ["eu", "kr", "tw", "us"],
    firstSeen: t0.toISOString(),
    lastSeen: t0.toISOString(),
    status: "queued",
  }]);
});

test("seeing the same build again adds nothing and keeps when it was first seen", () => {
  const first = recordBuilds(empty(), "wow_classic_beta", parseVersions(fixture("wow_classic_beta-70450.txt")), t0);
  const again = recordBuilds(first.registry, "wow_classic_beta", parseVersions(fixture("wow_classic_beta-70450.txt")), t1);
  expect(again.added).toEqual([]);
  expect(again.registry.builds).toHaveLength(1);
  expect(again.registry.builds[0]).toMatchObject({ firstSeen: t0.toISOString(), lastSeen: t1.toISOString(), status: "queued" });
});

test("a later build is added beside the earlier one", () => {
  const first = recordBuilds(empty(), "wow_classic_beta", parseVersions(fixture("wow_classic_beta-70450.txt")), t0);
  const next = recordBuilds(first.registry, "wow_classic_beta", parseVersions(fixture("wow_classic_beta-70460.txt")), t1);
  expect(next.added.map((b) => b.version)).toEqual(["1.60.1.70460"]);
  expect(next.registry.builds.map((b) => b.buildId)).toEqual([70450, 70460]);
});

test("the same version label with a different BuildConfig is a different build", () => {
  const first = recordBuilds(empty(), "wow_classic_beta", parseVersions(fixture("wow_classic_beta-70450.txt")), t0);
  const relabelled = fixture("wow_classic_beta-70450.txt").replaceAll(BETA, "fedcba9876543210fedcba9876543210");
  expect(recordBuilds(first.registry, "wow_classic_beta", parseVersions(relabelled), t1).added).toHaveLength(1);
});

test("products are tracked separately", () => {
  const beta = recordBuilds(empty(), "wow_classic_beta", parseVersions(fixture("wow_classic_beta-70450.txt")), t0);
  const era = recordBuilds(beta.registry, "wow_classic_era", parseVersions(fixture("wow_classic_era-70003.txt")), t0);
  expect(era.registry.builds.map((b) => `${b.product} ${b.version}`)).toEqual([
    "wow_classic_beta 1.60.1.70450",
    "wow_classic_era 1.15.9.70003",
  ]);
});

test("a malformed response is refused rather than recorded as no builds", () => {
  expect(() => parseVersions("")).toThrow(/version list/);
  expect(() => parseVersions("<html>Service Unavailable</html>")).toThrow(/version list/);
  expect(() => parseVersions("Region!STRING:0|BuildId!DEC:4\nus|1\n")).toThrow(/BuildConfig/);
  expect(() => parseVersions(fixture("wow_classic_beta-70450.txt").replace("|70450|", "|not-a-number|"))).toThrow(/BuildId/);
});

test("checking several products records each, and one failing product does not stop the rest", async () => {
  const fetchText = async (product: string) => {
    if (product === "wow_classic_beta") return fixture("wow_classic_beta-70450.txt");
    throw new Error("connect ETIMEDOUT");
  };
  const result = await checkBuilds(empty(), ["wow_classic_beta", "wow_classic_era"], fetchText, t0);
  expect(result.added.map((b) => b.key)).toEqual([`wow_classic_beta:${BETA}`]);
  expect(result.errors).toEqual([{ product: "wow_classic_era", error: "connect ETIMEDOUT" }]);
  expect(result.registry.builds).toHaveLength(1);
});

test("a malformed answer for one product is reported as that product's error", async () => {
  const result = await checkBuilds(empty(), ["wow_classic_beta"], async () => "<html>busy</html>", t0);
  expect(result.added).toEqual([]);
  expect(result.errors[0]).toMatchObject({ product: "wow_classic_beta" });
  expect(result.errors[0].error).toMatch(/version list/);
});

test("a registry is saved and loaded back unchanged; a missing file is an empty registry", () => {
  const dir = mkdtempSync(join(tmpdir(), "kb-builds-"));
  expect(loadRegistry(join(dir, "none.json"))).toEqual({ builds: [] });
  const { registry } = recordBuilds(empty(), "wow_classic_beta", parseVersions(fixture("wow_classic_beta-70450.txt")), t0);
  saveRegistry(join(dir, "builds.json"), registry);
  expect(loadRegistry(join(dir, "builds.json"))).toEqual(registry);
});

test("a file that is not a registry is refused", () => {
  const path = join(mkdtempSync(join(tmpdir(), "kb-builds-")), "builds.json");
  writeFileSync(path, JSON.stringify({ something: "else" }));
  expect(() => loadRegistry(path)).toThrow(/not a build registry/);
});
