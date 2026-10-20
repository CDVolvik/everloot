/**
 * Quest titles, item set names and spell names for the /database pages, beside the item names (item-names.ts).
 *
 * - Quest titles: the game files list quest ids (`QuestV2`) but no titles, so a title is shown only where the
 *   quest id is in the build's QuestV2 table and the Warcraft Wiki dump of 2023-11-13 (CC BY-SA 4.0) has a quest
 *   infobox (`questbox`) with that id. The title is the infobox's `name` (else the page title), as the item
 *   names take theirs; nothing is stripped from it. Where wiki pages give the same id different titles, none is
 *   shown.
 * - Item set names: `ItemSet.Name_lang`, for the sets the committed client layer relates items to.
 * - Spell names: `SpellName.Name_lang`, for the spells the client layer says items are created by or used in.
 *
 * Every name is held to the id ranges and the placeholder check in game-name-rule.ts. What a run writes holds
 * only the names the site may show, for the private bucket beside item-names.json; it never goes to git, the
 * API, the MCP server or the bulk download (docs/DATA_POLICY.md).
 */
import Database from "better-sqlite3";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readClientMeta, readClientRows } from "./client-snapshot.js";
import type { Edge } from "./edges.js";
import { mayShowQuestTitle, mayShowSetName, mayShowSpellName } from "./game-name-rule.js";
import { infoboxItemIds, isWikiPage, normName, shownNamesDir, WIKI_PAGE_PREFIX, WIKI_SOURCE_ID, type ShownNames } from "./item-names.js";

export const QUEST_NAMES_SCHEMA = "everloot.quest-names/1";
export const SET_NAMES_SCHEMA = "everloot.item-set-names/1";
export const SPELL_NAMES_SCHEMA = "everloot.spell-names/1";

/** The quest titles the site may show: by quest id, the title and the wiki page that gives it (after WIKI_PAGE_PREFIX). */
export interface ShownQuestNames {
  schema: typeof QUEST_NAMES_SCHEMA;
  build: { version: string };
  wiki: ShownNames["wiki"];
  count: number;
  names: Record<string, { n: string; w: string }>;
}

/** Set or spell names the site may show, by id, from the game files alone. */
export interface ShownFileNames<S extends string> {
  schema: S;
  build: { version: string };
  count: number;
  names: Record<string, string>;
}

type WikiTitles = ReadonlyMap<number, { name: string; page: string }[]>;

/** The wiki's quest titles by quest id, from the quest infoboxes in a knowledge base file, with the dump's date. */
export function wikiQuestTitles(kbPath: string): { dump: string; wiki: ShownNames["wiki"]; titles: Map<number, { name: string; page: string }[]> } {
  const db = new Database(kbPath, { readonly: true, fileMustExist: true });
  try {
    const source = db.prepare("SELECT name, licence, homepage FROM sources WHERE id = ?").get(WIKI_SOURCE_ID) as { name: string; licence: string; homepage: string } | undefined;
    if (!source) throw new Error(`the knowledge base has no ${WIKI_SOURCE_ID} source`);
    if (source.licence !== "CC-BY-SA-4.0") throw new Error(`${WIKI_SOURCE_ID} is ${source.licence}, not CC-BY-SA-4.0; its titles cannot be shown`);
    const dates = db.prepare("SELECT DISTINCT retrieved_at AS d FROM entities WHERE source_id = ?").all(WIKI_SOURCE_ID) as { d: string }[];
    if (dates.length !== 1) throw new Error(`expected one dump date for ${WIKI_SOURCE_ID}, found ${dates.length}`);
    const titles = new Map<number, { name: string; page: string }[]>();
    const rows = db.prepare("SELECT name, data, source_url AS url FROM entities WHERE source_id = ? AND kind = 'lore_page' AND data LIKE '%questbox%'").iterate(WIKI_SOURCE_ID) as Iterable<{ name: string; data: string; url: string }>;
    for (const r of rows) {
      let data: { type?: string; infobox?: { template?: string; fields?: Record<string, string> } };
      try {
        data = JSON.parse(r.data);
      } catch {
        continue;
      }
      const fields = data.infobox?.fields;
      const name = (fields?.name ?? r.name).trim();
      if (data.type !== "quest" || data.infobox?.template !== "questbox" || !name || !isWikiPage(r.url)) continue;
      for (const id of infoboxItemIds(fields?.id)) titles.set(id, [...(titles.get(id) ?? []), { name, page: r.url }]);
    }
    return { dump: dates[0]!.d, wiki: { name: source.name, url: source.homepage, licence: source.licence }, titles };
  } finally {
    db.close();
  }
}

/**
 * The quest titles the site may show for a build: quest ids in the build (`questIds`) whose wiki pages agree on
 * one title, apart from case, spacing and the kind of apostrophe. Counts how many ids fall where.
 */
export function shownQuestNames(version: string, questIds: Iterable<number>, wikiTitles: WikiTitles, wiki: ShownNames["wiki"]) {
  const names: ShownQuestNames["names"] = {};
  const counts = { quests: 0, match: 0, mismatch: 0, files: 0, held: 0 };
  const mismatches: { id: number; wiki: string[] }[] = [];
  for (const id of [...questIds].sort((a, b) => a - b)) {
    counts.quests += 1;
    const pages = wikiTitles.get(id) ?? [];
    if (!pages.length) {
      counts.files += 1;
      continue;
    }
    if (new Set(pages.map((p) => normName(p.name))).size > 1) {
      counts.mismatch += 1;
      mismatches.push({ id, wiki: [...new Set(pages.map((p) => p.name))] });
      continue;
    }
    counts.match += 1;
    const page = pages[0]!;
    if (!mayShowQuestTitle(id, page.name)) {
      counts.held += 1;
      continue;
    }
    names[String(id)] = { n: page.name, w: page.page.slice(WIKI_PAGE_PREFIX.length) };
  }
  const file: ShownQuestNames = { schema: QUEST_NAMES_SCHEMA, build: { version }, wiki, count: Object.keys(names).length, names };
  return { file, counts, mismatches };
}

/** Names from one game file table (`Name_lang`) for the given ids, kept where `may` allows. */
export function shownFileNames<S extends string>(
  schema: S, version: string, rows: ReadonlyMap<number, Record<string, unknown>>, ids: Iterable<number>, may: (id: number, name: string) => boolean,
) {
  const names: Record<string, string> = {};
  const counts = { referenced: 0, named: 0, held: 0 };
  for (const id of [...new Set(ids)].sort((a, b) => a - b)) {
    counts.referenced += 1;
    const raw = rows.get(id)?.Name_lang;
    const name = typeof raw === "string" ? raw.trim() : "";
    if (!name) continue;
    counts.named += 1;
    if (may(id, name)) names[String(id)] = name;
    else counts.held += 1;
  }
  const file: ShownFileNames<S> = { schema, build: { version }, count: Object.keys(names).length, names };
  return { file, counts };
}

/** The item sets and spells the client layer's relations name: the targets of part of set, created by and reagent for, and spells taught by a profession. */
export function relationIds(edges: readonly Edge[]): { sets: number[]; spells: number[] } {
  const sets = new Set<number>(), spells = new Set<number>();
  for (const e of edges) {
    if (e.toKind === "item_set") sets.add(e.toId);
    if (e.toKind === "spell") spells.add(e.toId);
    if (e.fromKind === "spell") spells.add(e.fromId);
  }
  return { sets: [...sets], spells: [...spells] };
}

/**
 * One run: reads the snapshot's quest ids, item sets and spell names and the knowledge base's quest infoboxes,
 * and writes quest-names.json, item-set-names.json and spell-names.json for the snapshot's build into the same
 * folder as item-names.json. Returns the counts for the report.
 */
export function runGameNames(opts: { snapshotPath: string; kbPath: string; outDir: string; edges: readonly Edge[] }) {
  const meta = readClientMeta(opts.snapshotPath);
  const questIds = [...readClientRows(opts.snapshotPath, "QuestV2").keys()];
  if (!questIds.length) throw new Error("the snapshot has no QuestV2 table; run `client-extract --refresh` first");
  const sets = readClientRows(opts.snapshotPath, "ItemSet");
  const spells = readClientRows(opts.snapshotPath, "SpellName");
  if (!sets.size || !spells.size) throw new Error("the snapshot has no ItemSet or SpellName table; run `client-extract --refresh` first");
  const wiki = wikiQuestTitles(opts.kbPath);
  const ids = relationIds(opts.edges);
  const quests = shownQuestNames(meta.version, questIds, wiki.titles, wiki.wiki);
  const setNames = shownFileNames(SET_NAMES_SCHEMA, meta.version, sets, ids.sets, mayShowSetName);
  const spellNames = shownFileNames(SPELL_NAMES_SCHEMA, meta.version, spells, ids.spells, mayShowSpellName);
  const dir = shownNamesDir(opts.outDir, meta);
  mkdirSync(dir, { recursive: true });
  const write = (file: string, body: unknown) => {
    const path = join(dir, file);
    writeFileSync(path, `${JSON.stringify(body)}\n`);
    return path;
  };
  return {
    build: meta.version, wikiDump: wiki.dump, wikiQuestIds: wiki.titles.size,
    quests: { ...quests, path: write("quest-names.json", quests.file) },
    sets: { ...setNames, path: write("item-set-names.json", setNames.file) },
    spells: { ...spellNames, path: write("spell-names.json", spellNames.file) },
  };
}
