/**
 * The name gap report: for each kind the database pages name from the game files and the wiki, where each id's
 * name comes from, and why the rest still print as "Item N", "Quest N" and so on. Every id gets one reason and
 * the route that fills it, so the remaining blanks point at the addon or at a source we do not have yet.
 *
 * It reads the same sources and applies the same rules as item-names.ts and game-names.ts, in memory: it writes
 * no ledger and no name file. Names players agree on (3 installs) come first on the pages, but they live in the
 * upload store, not on this machine, so a blank here may already be named by players on the site.
 *
 * The report lists ids, never names: it holds every id of the build, released or not, and stays local.
 */
import { readClientMeta, readClientRows } from "./client-snapshot.js";
import { shownQuestNames, wikiQuestTitles } from "./game-names.js";
import { emptyLedger, fileNames, mergeLedger, tierOf, wikiNames, type Ledger } from "./item-names.js";
import type { TableReader } from "./talents/build-catalog.js";

export const NAME_GAPS_SCHEMA = "everloot.name-gaps/1";

/** What fills a blank. shown: a source names it. players: the addon's uploads, after 3 installs. none: no source yet. */
export type Route = "shown" | "players" | "none";
export const ROUTES: Route[] = ["shown", "players", "none"];

export interface Bucket { reason: string; route: Route; count: number; sample: number[] }
export interface KindGaps { kind: "item" | "quest" | "item_set" | "spell"; label: string; total: number; buckets: Bucket[] }
export interface NameGaps { schema: typeof NAME_GAPS_SCHEMA; build: string; kinds: KindGaps[] }

const SAMPLE = 5;

/** Counts ids into buckets, listed by route and then size; each bucket keeps its lowest ids as a sample. */
function tally(kind: KindGaps["kind"], label: string, ids: Iterable<number>, classify: (id: number) => [string, Route]): KindGaps {
  const buckets = new Map<string, Bucket>();
  let total = 0;
  for (const id of [...new Set(ids)].sort((a, b) => a - b)) {
    total += 1;
    const [reason, route] = classify(id);
    const b = buckets.get(reason) ?? buckets.set(reason, { reason, route, count: 0, sample: [] }).get(reason)!;
    b.count += 1;
    if (b.sample.length < SAMPLE) b.sample.push(id);
  }
  const order = (b: Bucket) => ROUTES.indexOf(b.route);
  return { kind, label, total, buckets: [...buckets.values()].sort((a, b) => order(a) - order(b) || b.count - a.count) };
}

/** Items: every row of the build's Item table, by the ledger tier the item names file is written from. */
export function itemGaps(ledger: Ledger, build: string, ids: Iterable<number>): KindGaps {
  return tally("item", "Items", ids, (id) => {
    const { tier } = tierOf(ledger.items[String(id)], build);
    if (tier === "match") return ["files and wiki agree", "shown"];
    if (tier === "mismatch") return ["files and wiki differ (the files' name shows)", "shown"];
    if (tier === "files") return ["game files only", "shown"];
    if (tier === "wiki") return ["wiki only", "shown"];
    return ["no name in the files or the wiki", "players"];
  });
}

/** Quests: every id of the build's QuestV2 table, which holds no titles; the wiki's quest infoboxes give them. */
export function questGaps(build: string, questIds: number[], titles: Parameters<typeof shownQuestNames>[2]): KindGaps {
  const { file, mismatches } = shownQuestNames(build, questIds, titles, { name: "", url: "", licence: "" });
  const disagree = new Set(mismatches.map((m) => m.id));
  return tally("quest", "Quests", questIds, (id) => {
    if (disagree.has(id)) return ["wiki pages differ (the first one's title shows)", "shown"];
    if (file.names[String(id)]) return ["wiki title", "shown"];
    if (titles.has(id)) return ["wiki title a Forever source contradicts", "players"];
    return ["no wiki title (the game files hold none)", "players"];
  });
}

/** Item sets or spells: every row of the name table. */
export function fileNameGaps(kind: "item_set" | "spell", label: string, rows: ReadonlyMap<number, Record<string, unknown>>): KindGaps {
  return tally(kind, label, rows.keys(), (id) => {
    const raw = rows.get(id)?.Name_lang;
    return typeof raw === "string" && raw.trim() ? ["named in the game files", "shown"] : ["no name in the game files", "none"];
  });
}

/** One report from a snapshot and a knowledge base file with the Warcraft Wiki dump. Reads only; writes nothing. */
export function runNameGaps(opts: { snapshotPath: string; kbPath: string }): NameGaps {
  const meta = readClientMeta(opts.snapshotPath);
  const get: TableReader = (t) => {
    const rows = readClientRows(opts.snapshotPath, t);
    return rows.size ? rows : undefined;
  };
  const itemIds = [...(get("Item")?.keys() ?? [])];
  const questIds = [...readClientRows(opts.snapshotPath, "QuestV2").keys()];
  const sets = readClientRows(opts.snapshotPath, "ItemSet");
  const spells = readClientRows(opts.snapshotPath, "SpellName");
  if (!itemIds.length || !questIds.length || !sets.size || !spells.size) {
    throw new Error("the snapshot lacks Item, QuestV2, ItemSet or SpellName; run `client-extract --refresh` first");
  }
  const wiki = wikiNames(opts.kbPath);
  const ledger = mergeLedger(emptyLedger(), { at: meta.extractedAt, build: meta.version, files: fileNames(get), wikiDump: wiki.dump, wiki: wiki.names });
  return {
    schema: NAME_GAPS_SCHEMA,
    build: meta.version,
    kinds: [
      itemGaps(ledger, meta.version, itemIds),
      questGaps(meta.version, questIds, wikiQuestTitles(opts.kbPath).titles),
      fileNameGaps("item_set", "Item sets", sets),
      fileNameGaps("spell", "Spells", spells),
    ],
  };
}

const ROUTE_TEXT: Record<Route, string> = {
  shown: "a source names it",
  players: "addon uploads, after 3 installs agree",
  none: "no source yet",
};

export function formatNameGaps(report: NameGaps): string {
  const lines = [
    `# Name gaps — build ${report.build}`,
    "",
    "Names the game files and the Warcraft Wiki give, under the rules in docs/DATA_POLICY.md. Names players agree on",
    "(3 installs) are not counted: they live in the upload store and come first on the pages.",
    "",
    "| Kind | Ids | Shown | Players | No source |",
    "|---|---|---|---|---|",
  ];
  for (const k of report.kinds) {
    const n = (r: Route) => k.buckets.filter((b) => b.route === r).reduce((s, b) => s + b.count, 0);
    lines.push(`| ${k.label} | ${k.total} | ${ROUTES.map(n).join(" | ")} |`);
  }
  lines.push("", "Routes: " + ROUTES.map((r) => `${r} — ${ROUTE_TEXT[r]}`).join("; ") + ".");
  for (const k of report.kinds) {
    lines.push("", `## ${k.label}`, "", "| Reason | Route | Ids | Lowest ids |", "|---|---|---|---|");
    for (const b of k.buckets) lines.push(`| ${b.reason} | ${b.route} | ${b.count} | ${b.sample.join(", ")} |`);
  }
  return `${lines.join("\n")}\n`;
}
