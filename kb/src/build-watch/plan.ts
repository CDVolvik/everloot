/**
 * What the build watch does about a build it sees, decided from three facts: the build now on
 * Blizzard's service, the build the base branch's data is from, and the pull requests that already
 * exist for it. Pure, so the "never open a second PR" rule is tested without GitHub.
 */

export interface BuildIdent { buildConfig: string; buildId: number }
export type PrState = "OPEN" | "MERGED" | "CLOSED";
export interface PrRef { number: number; state: PrState; headRefName: string }

export type Action =
  /** The base branch already has this build's data. */
  | { kind: "up-to-date" }
  /** A pull request for this build was merged; this checkout of the base branch may just not have it yet. */
  | { kind: "already-merged"; number: number }
  /** Someone closed the pull request without merging. We do not reopen it unless asked. */
  | { kind: "declined"; number: number }
  /** A pull request for this build is open and has its data: nothing to do. */
  | { kind: "open"; number: number }
  /** A pull request is open and a refresh was asked for: regenerate its branch and body. */
  | { kind: "update"; number: number }
  | { kind: "create" };

const SAFE_PRODUCT = /^[a-z0-9_]+$/;
export const BRANCH_PREFIX = "game-build/";

/**
 * One branch per product and build, so a rerun finds the same branch and the same pull request. The
 * build's config hash is part of the name: Blizzard sometimes ships two builds under one build number.
 */
export function branchFor(product: string, build: BuildIdent): string {
  if (!SAFE_PRODUCT.test(product)) throw new Error(`unsafe product id: ${product}`);
  if (!Number.isInteger(build.buildId) || build.buildId <= 0) throw new Error(`bad build id: ${build.buildId}`);
  if (!/^[0-9a-f]{32}$/.test(build.buildConfig)) throw new Error(`bad build config: ${build.buildConfig}`);
  return `${BRANCH_PREFIX}${product}-${build.buildId}-${build.buildConfig.slice(0, 8)}`;
}

export const titleFor = (version: string) => `data(game-data): build ${version}`;

export function decide(product: string, committed: BuildIdent | null, latest: BuildIdent, prs: PrRef[], opts: { redo?: boolean; force?: boolean } = {}): Action {
  if (!opts.force && committed && committed.buildConfig === latest.buildConfig) return { kind: "up-to-date" };
  const branch = branchFor(product, latest);
  const newestFirst = prs.filter((p) => p.headRefName === branch).sort((a, b) => b.number - a.number);
  const open = newestFirst.find((p) => p.state === "OPEN");
  if (open) return opts.redo ? { kind: "update", number: open.number } : { kind: "open", number: open.number };
  const merged = newestFirst.find((p) => p.state === "MERGED");
  if (merged) return { kind: "already-merged", number: merged.number };
  const closed = newestFirst.find((p) => p.state === "CLOSED");
  if (closed && !opts.redo) return { kind: "declined", number: closed.number };
  return { kind: "create" };
}

/** Open pull requests for other builds of the same product. */
export function olderOpen(product: string, build: BuildIdent, prs: PrRef[]): number[] {
  const mine = branchFor(product, build);
  return prs
    .filter((p) => p.state === "OPEN" && p.headRefName !== mine && p.headRefName.startsWith(`${BRANCH_PREFIX}${product}-`))
    .map((p) => p.number)
    .sort((a, b) => a - b);
}
