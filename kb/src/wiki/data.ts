/**
 * What the page check reads from disk: the pages, the category list, the committed game data and the
 * repository's private path pattern. Kept apart from check.ts so the rules stay testable without files.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { buildTimeline } from "../changes.js";
import { CLIENT_LAYER } from "../client-layer-file.js";
import { slugify } from "../lore-slug.js";
import { zoneTable } from "../world-coords.js";
import { WORLD_MAP_DATA } from "../world-map-file.js";
import type { KnownData, WikiFile } from "./check.js";

export const WIKI_DIR = fileURLToPath(new URL("../../wiki/", import.meta.url));
const CHANGES_DIR = fileURLToPath(new URL("../../changes/", import.meta.url));
const INTERNAL_PATHS_GUARD = fileURLToPath(new URL("../../../scripts/check_internal_paths.py", import.meta.url));

export const CATEGORY_GROUPS = ["place", "kind", "theme"] as const;

/** Every `*.md` page in the folder except its README, with paths relative to kb/ for messages. */
export function readWikiPages(dir = WIKI_DIR): WikiFile[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .sort()
    .map((f) => ({ path: `wiki/${f}`, source: readFileSync(join(dir, f), "utf8") }));
}

/** The category slugs of categories.yaml: three groups (place, kind, theme), each a map of slug to display name. */
export function parseCategories(source: string): Set<string> {
  const doc = (parseYaml(source) ?? {}) as Record<string, unknown>;
  const extra = Object.keys(doc).filter((k) => !(CATEGORY_GROUPS as readonly string[]).includes(k));
  if (extra.length) throw new Error(`categories.yaml: unknown group(s) ${extra.join(", ")}; groups are ${CATEGORY_GROUPS.join(", ")}`);
  const slugs = new Set<string>();
  for (const group of CATEGORY_GROUPS) {
    const entries = doc[group] ?? {};
    if (typeof entries !== "object" || Array.isArray(entries)) throw new Error(`categories.yaml: ${group} must map each slug to its name`);
    for (const [slug, name] of Object.entries(entries as Record<string, unknown>)) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`categories.yaml: "${slug}" is not a slug`);
      if (typeof name !== "string" || !name.trim()) throw new Error(`categories.yaml: ${group}.${slug} needs a name`);
      if (slugs.has(slug)) throw new Error(`categories.yaml: "${slug}" is listed twice`);
      slugs.add(slug);
    }
  }
  return slugs;
}

export const loadCategories = (dir = WIKI_DIR) => parseCategories(readFileSync(join(dir, "categories.yaml"), "utf8"));

/** The pattern scripts/check_internal_paths.py guards with, so the page check and CI cannot disagree. */
export function loadPrivatePathPattern(path = INTERNAL_PATHS_GUARD): RegExp {
  const m = /PATTERN = re\.compile\(\s*r"((?:[^"\\]|\\.)*)"/.exec(readFileSync(path, "utf8"));
  if (!m) throw new Error(`no PATTERN found in ${path}`);
  return new RegExp(m[1], "i");
}

/** Ids the committed game data knows: the client layer's items and sets, the map's zones and entrances, the /changes timeline. */
export function loadKnownData(): KnownData {
  const itemSets = new Set<number>();
  for (const [fromKind, fromId, , toKind, toId] of CLIENT_LAYER.edges) {
    if (fromKind === "item_set") itemSets.add(fromId);
    if (toKind === "item_set") itemSets.add(toId);
  }
  const read = (file: string) => JSON.parse(readFileSync(join(CHANGES_DIR, file), "utf8")) as Record<string, unknown[]>;
  const timeline = buildTimeline(read("blue-posts.json").posts ?? [], read("builds.json").builds ?? []);
  return {
    items: new Set(CLIENT_LAYER.items.map(([id]) => id)),
    zones: new Set(zoneTable(WORLD_MAP_DATA).map((z) => z.mapId)),
    entrances: new Map(WORLD_MAP_DATA.entrances.map((e) => [slugify(e.name), { raid: e.raid }])),
    itemSets,
    changes: new Set(timeline.map((e) => e.id)),
  };
}
