/** The `build-watch` command: reads the config and flags, wires the real network and GitHub lookups, prints the result. */
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { versionsUrl } from "../builds.js";
import { extractFromCdn } from "./cdn-extract.js";
import { BRANCH_PREFIX, type PrRef } from "./plan.js";
import { PRODUCT_ID, runWatch, WatchConfig, type WatchDeps } from "./watch.js";

/** Pull requests of build branches, any state. Needs the `gh` CLI signed in (in Actions it is). */
export function listPrsWithGh(): PrRef[] {
  const out = execFileSync("gh", ["pr", "list", "--state", "all", "--limit", "200", "--search", `head:${BRANCH_PREFIX}`, "--json", "number,state,headRefName"], { encoding: "utf8", timeout: 60_000 });
  return (JSON.parse(out) as PrRef[]).filter((p) => p.headRefName.startsWith(BRANCH_PREFIX));
}

/** Without `gh` (a local dry run on a machine that is not signed in) there is nothing to look up. */
function listPrs(): PrRef[] {
  try {
    return listPrsWithGh();
  } catch (err) {
    if (process.env.GITHUB_ACTIONS) throw err;
    console.error(`could not list pull requests (${err instanceof Error ? err.message.split("\n")[0] : err}); assuming none`);
    return [];
  }
}

export async function buildWatchCommand(flags: Map<string, string>): Promise<number> {
  const configPath = flags.get("config") || "lists/build-watch.yaml";
  const config = WatchConfig.parse(parse(readFileSync(configPath, "utf8")));
  const only = flags.get("product")?.split(",").map((p) => p.trim()).filter(Boolean);
  for (const p of only ?? []) {
    if (!PRODUCT_ID.test(p)) {
      console.error(`--product ${JSON.stringify(p.slice(0, 40))} is not a Blizzard product id (lowercase letters, digits and underscores)`);
      return 1;
    }
  }
  if (only?.length) {
    // A product named on the command line but missing from the config is treated as not live.
    config.products = only.map((product) => config.products.find((p) => p.product === product) ?? { product, label: product, live: false });
  }
  const dryRun = flags.has("dry-run");
  const checkOnly = flags.has("check");
  const outDir = flags.get("out") || "data/build-watch/out";
  const deps: WatchDeps = {
    async fetchVersions(product) {
      const res = await fetch(versionsUrl(product), { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`${product}: version service answered HTTP ${res.status}`);
      return res.text();
    },
    listPrs: async () => listPrs(),
    extract: (product) => extractFromCdn(product, config.region, flags.get("list") || "lists/raid-buffs.yaml"),
    now: () => new Date(),
  };
  const runUrl = process.env.GITHUB_RUN_ID && process.env.GITHUB_REPOSITORY
    ? `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : undefined;
  const results = await runWatch({
    config, gameDataDir: flags.get("game-data") || "../game-data",
    outDir, dryRun, checkOnly, redo: flags.has("redo"), runUrl,
  }, deps);

  for (const r of results) {
    if (r.error) console.error(`${r.product}: ${r.error}`);
    else if (r.summary) console.log(`${dryRun ? "[dry run] " : ""}${r.action === "update" ? "would update" : "would open"} ${r.title}${r.pr ? ` (PR #${r.pr})` : ""} on branch ${r.branch}\n${r.summary}\n`);
    else console.log(`${r.product} ${r.version ?? ""}: ${r.action}${r.pr ? ` (PR #${r.pr})` : ""}`);
  }
  if (process.env.GITHUB_OUTPUT) {
    const work = results.some((r) => r.action === "create" || r.action === "update");
    appendFileSync(process.env.GITHUB_OUTPUT, `needed=${work && !dryRun}\nextracted=${results.some((r) => r.summary)}\n`);
  }
  console.log(`plan: ${outDir}/plan.json`);
  return results.some((r) => r.error) ? 1 : 0;
}
