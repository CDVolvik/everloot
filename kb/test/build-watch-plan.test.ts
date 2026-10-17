import { describe, expect, it } from "vitest";
import { branchFor, decide, olderOpen, titleFor, type PrRef } from "../src/build-watch/plan.js";
import { CONFIG_A, CONFIG_B } from "./build-watch-fixtures.js";

const latest = { buildId: 70460, buildConfig: CONFIG_B };
const branch = branchFor("wow_classic_beta", latest);
const pr = (number: number, state: PrRef["state"], headRefName = branch): PrRef => ({ number, state, headRefName });

describe("branchFor", () => {
  it("names one branch per product, build and config", () => {
    expect(branchFor("wow_classic_beta", latest)).toBe("game-build/wow_classic_beta-70460-bbbbbbbb");
    expect(branchFor("wow_classic_beta", { buildId: 70460, buildConfig: CONFIG_A })).not.toBe(branch);
  });
  it("refuses values that could break out of a branch name", () => {
    expect(() => branchFor("beta; rm -rf", latest)).toThrow();
    expect(() => branchFor("wow", { buildId: 1, buildConfig: "xyz" })).toThrow();
    expect(() => branchFor("wow", { buildId: -1, buildConfig: CONFIG_A })).toThrow();
  });
  it("titles the pull request after the version", () => {
    expect(titleFor("1.60.1.70460")).toBe("Game build 1.60.1.70460: data update");
  });
});

describe("decide", () => {
  const known = { buildId: 70450, buildConfig: CONFIG_A };

  it("does nothing when the base branch already has the build", () => {
    expect(decide("wow_classic_beta", { buildId: 70460, buildConfig: CONFIG_B }, latest, [])).toEqual({ kind: "up-to-date" });
  });
  it("opens a pull request for a new build with none yet", () => {
    expect(decide("wow_classic_beta", known, latest, [])).toEqual({ kind: "create" });
    expect(decide("wow_classic_beta", null, latest, [])).toEqual({ kind: "create" });
  });
  it("never opens a second pull request while one is open", () => {
    expect(decide("wow_classic_beta", known, latest, [pr(40, "OPEN")])).toEqual({ kind: "open", number: 40 });
    expect(decide("wow_classic_beta", known, latest, [pr(40, "CLOSED"), pr(41, "OPEN")])).toEqual({ kind: "open", number: 41 });
  });
  it("updates the open pull request when a refresh is asked for", () => {
    expect(decide("wow_classic_beta", known, latest, [pr(40, "OPEN")], { redo: true })).toEqual({ kind: "update", number: 40 });
  });
  it("leaves a build alone once its pull request was merged", () => {
    expect(decide("wow_classic_beta", known, latest, [pr(40, "MERGED")])).toEqual({ kind: "already-merged", number: 40 });
  });
  it("does not reopen a pull request that was closed unmerged, unless asked", () => {
    expect(decide("wow_classic_beta", known, latest, [pr(40, "CLOSED")])).toEqual({ kind: "declined", number: 40 });
    expect(decide("wow_classic_beta", known, latest, [pr(40, "CLOSED")], { redo: true })).toEqual({ kind: "create" });
  });
  it("ignores pull requests of other builds and products", () => {
    const other = [pr(1, "OPEN", branchFor("wow_classic_beta", known)), pr(2, "OPEN", branchFor("wow_classic", latest))];
    expect(decide("wow_classic_beta", known, latest, other)).toEqual({ kind: "create" });
  });
  it("treats a second build under the same build number as a new build", () => {
    const sameNumber = { buildId: 70460, buildConfig: CONFIG_A };
    expect(decide("wow_classic_beta", sameNumber, latest, [])).toEqual({ kind: "create" });
  });
});

describe("olderOpen", () => {
  it("lists open pull requests of the same product's other builds", () => {
    const prs = [
      pr(5, "OPEN", branchFor("wow_classic_beta", { buildId: 70450, buildConfig: CONFIG_A })),
      pr(6, "CLOSED", branchFor("wow_classic_beta", { buildId: 70440, buildConfig: CONFIG_A })),
      pr(7, "OPEN", branch),
      pr(8, "OPEN", branchFor("wow_classic", latest)),
    ];
    expect(olderOpen("wow_classic_beta", latest, prs)).toEqual([5]);
  });
});
