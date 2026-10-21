/**
 * The name gap report: for each kind the database pages name from the game files and the wiki, how many ids
 * the rules name and why each of the others prints as "Item N", "Quest N" and so on. Every blank gets one
 * reason and the route that would fill it, so the next step for each is a decision, a mining wave or the addon.
 *
 * It reads the same sources and applies the same rules as item-names.ts and game-names.ts, in memory: it writes
 * no ledger and no name file. Names players agree on (3 installs) come first on the pages, but they live in the
 * upload store, not on this machine, so a blank here may already be named by players on the site.
 *
 * The report lists ids, never names: it holds every id of the build, released or not, and stays local.
 */
import { readClientMeta, readClientRows } from "./client-snapshot.js";
import type { Edge } from "./edges.js";
import { relationIds, shownQuestNames, wikiQuestTitles } from "./game-names.js";
import { looksInternalGameName, mayShowSetName, mayShowSpellName, SHOWN_MAX_QUEST_ID, SHOWN_MAX_SET_ID, SHOWN_MAX_SPELL_ID } from "./game-name-rule.js";
import { emptyLedger, fileNames, mergeLedger, tierOf, wikiNames, type Ledger } from "./item-names.js";
import { looksInternal, SHOWN_MAX_ITEM_ID } from "./item-name-rule.js";
import type { TableReader } from "./talents/build-catalog.js";

export const NAME_GAPS_SCHEMA = "everloot.name-gaps/1";

/**
 * What fills a blank. shown: the rule names it. decision: a source names it, the rule holds it back, and only
 * the maintainer can change the rule. players: no file or wiki name; the addon's uploads name it after 3 installs.
 * none: no source names it yet. never: a placeholder or internal name, hidden on purpose.
 */
export type Route = "shown" | "decision" | "players" | "none" | "never";
export const ROUTES: Route[] = ["shown", "decision", "players", "none", "never"];

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

/** Items: every row of the build's Item table, by the ledger tier the item name rule reads. */
export function itemGaps(ledger: Ledger, build: string, ids: Iterable<number>): KindGaps {
  return tally("item", "Items", ids, (id) => {
    const { tier, file } = tierOf(ledger.items[String(id)], build);
    if (tier === "match") {
      if (looksInternal(file!.name)) return ["placeholder or internal name", "never"];
      if (id >= SHOWN_MAX_ITEM_ID) return [`files and wiki agree, id ${SHOWN_MAX_ITEM_ID} or above`, "decision"];
      return ["files and wiki agree", "shown"];
    }
    if (tier === "mismatch") return ["files and wiki give different names", "decision"];
    if (tier === "files") return ["name in the game files only", "decision"];
    if (tier === "wiki") return ["name in the wiki only", "decision"];
    return ["no name in the files or the wiki", "players"];
  });
}

/** Quests: every id of the build's QuestV2 table, which holds no titles; the wiki's quest infoboxes give them. */
export function questGaps(build: string, questIds: number[], titles: Parameters<typeof shownQuestNames>[2]): KindGaps {
  const wiki = { name: "", url: "", licence: "" };
  const { file, mismatches } = shownQuestNames(build, questIds, titles, wiki);
  const disagree = new Set(mismatches.map((m) => m.id));
  return tally("quest", "Quests", questIds, (id) => {
    if (file.names[String(id)]) return ["wiki title for an id the build lists", "shown"];
    if (disagree.has(id)) return ["wiki pages give different titles", "decision"];
    if (titles.has(id)) return [`wiki title, id ${SHOWN_MAX_QUEST_ID} or above`, "decision"];
    return ["no wiki title (the game files hold none)", "players"];
  });
}

/**
 * Item sets or spells: every row of the name table. The rule names only the ids the client layer's relations
 * point to, so a named id outside them is held back by the rule, not by a missing name.
 */
export function fileNameGaps(
  kind: "item_set" | "spell", label: string, rows: ReadonlyMap<number, Record<string, unknown>>, referenced: Iterable<number>,
  may: (id: number, name: string) => boolean, cap: number,
): KindGaps {
  const used = new Set(referenced);
  return tally(kind, label, [...rows.keys(), ...used], (id) => {
    const raw = rows.get(id)?.Name_lang;
    const name = typeof raw === "string" ? raw.trim() : "";
    if (!name) return ["no name in the game files", "none"];
    if (looksInternalGameName(name)) return ["placeholder or internal name", "never"];
    if (!used.has(id)) return ["named in the files, no item relation points to it", "decision"];
    if (may(id, name)) return ["named in the files, used by a relation", "shown"];
    return [`named in the files, id ${cap} or above`, "decision"];
  });
}

/** One report from a snapshot and a knowledge base file with the Warcraft Wiki dump. Reads only; writes nothing. */
export function runNameGaps(opts: { snapshotPath: string; kbPath: string; edges: readonly Edge[] }): NameGaps {
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
  const ids = relationIds(opts.edges);
  return {
    schema: NAME_GAPS_SCHEMA,
    build: meta.version,
    kinds: [
      itemGaps(ledger, meta.version, itemIds),
      questGaps(meta.version, questIds, wikiQuestTitles(opts.kbPath).titles),
      fileNameGaps("item_set", "Item sets", sets, ids.sets, mayShowSetName, SHOWN_MAX_SET_ID),
      fileNameGaps("spell", "Spells", spells, ids.spells, mayShowSpellName, SHOWN_MAX_SPELL_ID),
    ],
  };
}

const ROUTE_TEXT: Record<Route, string> = {
  shown: "named by the rule",
  decision: "a source names it; the rule holds it back (maintainer's call)",
  players: "addon uploads, after 3 installs agree",
  none: "no source yet",
  never: "hidden on purpose",
};

export function formatNameGaps(report: NameGaps): string {
  const lines = [
    `# Name gaps — build ${report.build}`,
    "",
    "Names the game files and the Warcraft Wiki give, under the rules in docs/DATA_POLICY.md. Names players agree on",
    "(3 installs) are not counted: they live in the upload store and come first on the pages.",
    "",
    "| Kind | Ids | Shown | Decision | Players | No source | Hidden |",
    "|---|---|---|---|---|---|---|",
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
