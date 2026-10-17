import { z } from "zod";
import { CLASSES } from "@/design/tokens";
import type { BuffTable } from "@/data/game-data/raid";
import { itemTipText, qualityColor } from "@/lib/item-names";
import { assetPath, assetsBaseUrl, MANIFEST_SCHEMA } from "@/lib/talents/assets";
import type { ItemRecord } from "../../../kb/src/assets/items";
import { worldToMap } from "../../../kb/src/world-coords";

// Blizzard's icons, item tooltip facts and map pictures across the site (docs/DATA_POLICY.md,
// "Blizzard's icons, tooltip text and window frame"; docs/ASSETS.md). It reads the same build-stamped
// manifest as the talent calculator (lib/talents/assets.ts), from the same NEXT_PUBLIC_GAME_ASSETS_URL.
// With the variable unset, or a manifest that cannot be read, every reader here returns null or an
// empty map without fetching anything, and each page keeps its text-only look. Pages call it while
// rendering on the server and pass ready URLs down. The API, MCP and data downloads never import it
// (talents/assets.test.ts checks that).

/** How long a page keeps a manifest or an item shard before reading it again. Each build has its own folder. */
export const REVALIDATE_SECONDS = 3600;

const Rect = z.object({ left: z.number(), top: z.number(), right: z.number(), bottom: z.number() });

// Every section is optional, so a manifest from before this reader (talent art only) still parses.
const site = z.object({
  schema: z.literal(MANIFEST_SCHEMA),
  label: z.string(),
  build: z.object({ version: z.string().min(1) }),
  classes: z.record(z.string(), z.object({
    name: z.string(), icon: assetPath.nullable(),
    trees: z.array(z.object({ name: z.string().nullable(), icon: assetPath.nullable() })),
  })).default({}),
  professions: z.record(z.string(), z.object({ name: z.string(), icon: assetPath.nullable() })).default({}),
  spellIcons: z.record(z.string(), assetPath).default({}),
  maps: z.record(z.string(), z.object({
    file: assetPath, kind: z.enum(["continent", "zone"]), name: z.string(), continentId: z.number().int(), heldBack: z.boolean(), rect: Rect,
  })).default({}),
  items: z.object({ shardSize: z.number().int().positive(), shards: z.record(z.string(), z.object({ file: assetPath })) }).nullable().default(null),
});

export interface MapArt { uiMapId: number; kind: "continent" | "zone"; name: string; continentId: number; heldBack: boolean; url: string; rect: z.infer<typeof Rect> }

export interface SiteAssets {
  base: string;
  /** The game build the files came from, and the label every game file fact carries. */
  version: string;
  label: string;
  /** By class slug ("warrior"): icon URL and the talent trees in the client's order with their icon URLs. */
  classes: Map<string, { name: string; icon: string | null; trees: { name: string | null; icon: string | null }[] }>;
  /** By profession name in lower case; only professions that have an icon. */
  professions: Map<string, { name: string; icon: string }>;
  /** Spell id -> icon URL. */
  spellIcons: Map<number, string>;
  maps: MapArt[];
  /** Item shard URLs by shard number; null when the upload has no items. */
  items: { shardSize: number; shards: Map<number, string> } | null;
}

/** A file inside the asset folder. */
export const assetUrl = (base: string, file: string) => `${base}/${file}`;
/** An icon by its name in the manifest ("123.webp"). */
export const iconUrl = (base: string, name: string) => assetUrl(base, `icons/${name}`);
/** An item's icon by the file data id its record carries. */
export const itemIconUrl = (base: string, fileId: number) => iconUrl(base, `${fileId}.webp`);
/** The shard that holds an item. */
export const itemShard = (itemId: number, shardSize: number) => Math.floor(itemId / shardSize);

/** Reads a manifest. Null for anything that is not a valid one, so a bad upload leaves the text-only pages. */
export function parseSiteManifest(json: unknown, base: string): SiteAssets | null {
  const parsed = site.safeParse(json);
  if (!parsed.success) return null;
  const m = parsed.data;
  const icon = (name: string | null) => (name ? iconUrl(base, name) : null);
  const professions = new Map<string, { name: string; icon: string }>();
  for (const [key, p] of Object.entries(m.professions)) if (p.icon) professions.set(key.toLowerCase(), { name: p.name, icon: iconUrl(base, p.icon) });
  const spellIcons = new Map<number, string>();
  for (const [id, name] of Object.entries(m.spellIcons)) if (/^\d+$/.test(id)) spellIcons.set(Number(id), iconUrl(base, name));
  const shards = new Map<number, string>();
  for (const [n, f] of Object.entries(m.items?.shards ?? {})) if (/^\d+$/.test(n)) shards.set(Number(n), assetUrl(base, f.file));
  return {
    base, version: m.build.version, label: m.label,
    classes: new Map(Object.entries(m.classes).map(([key, c]) => [key.toLowerCase(), { name: c.name, icon: icon(c.icon), trees: c.trees.map((t) => ({ name: t.name, icon: icon(t.icon) })) }])),
    professions, spellIcons,
    maps: Object.entries(m.maps).filter(([id]) => /^\d+$/.test(id)).map(([id, a]) => ({
      uiMapId: Number(id), kind: a.kind, name: a.name, continentId: a.continentId, heldBack: a.heldBack, url: assetUrl(base, a.file), rect: a.rect,
    })),
    items: m.items ? { shardSize: m.items.shardSize, shards } : null,
  };
}

const READ = { headers: { accept: "application/json" }, next: { revalidate: REVALIDATE_SECONDS } };

/** Fetches and reads the manifest. Never throws: any failure is null. Nothing is fetched when the URL is unset. */
export async function loadSiteAssets(base: string | null = assetsBaseUrl(), fetcher: typeof fetch = fetch): Promise<SiteAssets | null> {
  if (!base) return null;
  try {
    const res = await fetcher(`${base}/manifest.json`, READ);
    if (!res.ok) return null;
    return parseSiteManifest(await res.json(), base);
  } catch {
    return null;
  }
}

/* ---------- Items ---------- */

const ItemRecordSchema = z.object({
  n: z.string(), q: z.number().int(), l: z.number(), r: z.number(), b: z.number(), s: z.number(),
  c: z.number().nullable(), sc: z.number().nullable(), d: z.number(), st: z.array(z.number()), sp: z.number(), u: z.number(),
  t: z.string().optional(), i: z.number().int().positive().optional(),
});

/** What an item link shows: plain, serialisable data for the tooltip. */
export interface ItemTip {
  name: string;
  /** Name colour by quality. */
  color: string;
  quality: string;
  icon: string | null;
  lines: string[];
  partial: boolean;
  /** "found in game files, unconfirmed · build x". */
  label: string;
}

export function itemTip(r: ItemRecord, assets: Pick<SiteAssets, "base" | "version" | "label">): ItemTip {
  const text = itemTipText(r);
  return { ...text, color: qualityColor(r.q), icon: r.i ? itemIconUrl(assets.base, r.i) : null, label: `${assets.label} · build ${assets.version}` };
}

/** Tooltips for the given items, reading only the shards they are in. Never throws: an item whose shard fails is just left out. */
export async function loadItemTips(assets: SiteAssets | null, ids: readonly number[], fetcher: typeof fetch = fetch): Promise<Map<number, ItemTip>> {
  const out = new Map<number, ItemTip>();
  const items = assets?.items;
  if (!assets || !items) return out;
  const byShard = new Map<number, number[]>();
  for (const id of new Set(ids)) {
    if (!Number.isInteger(id) || id <= 0) continue;
    const s = itemShard(id, items.shardSize);
    byShard.set(s, [...(byShard.get(s) ?? []), id]);
  }
  await Promise.all([...byShard].map(async ([shard, wanted]) => {
    const url = items.shards.get(shard);
    if (!url) return;
    try {
      const res = await fetcher(url, READ);
      if (!res.ok) return;
      const body = z.record(z.string(), z.unknown()).safeParse(await res.json());
      if (!body.success) return;
      for (const id of wanted) {
        const r = ItemRecordSchema.safeParse(body.data[String(id)]);
        if (r.success) out.set(id, itemTip(r.data, assets));
      }
    } catch {
      // A shard that cannot be read leaves its items as plain links.
    }
  }));
  return out;
}

/* ---------- Classes, professions, raid builder ---------- */

/** The professions the site names, in the order the game lists them. */
export const PROFESSIONS = ["Alchemy", "Blacksmithing", "Enchanting", "Engineering", "Herbalism", "Leatherworking", "Mining", "Skinning", "Tailoring", "Cooking", "First Aid", "Fishing"] as const;

export interface IconLink { key: string; name: string; icon: string }

/** Class and profession icons with their names, only those the upload has. */
export function classAndProfessionIcons(assets: SiteAssets | null): { classes: IconLink[]; professions: IconLink[] } {
  if (!assets) return { classes: [], professions: [] };
  const classes = CLASSES.flatMap((slug) => {
    const c = assets.classes.get(slug);
    return c?.icon ? [{ key: slug, name: c.name, icon: c.icon }] : [];
  });
  const professions = PROFESSIONS.flatMap((name) => {
    const p = assets.professions.get(name.toLowerCase());
    return p ? [{ key: name, name: p.name, icon: p.icon }] : [];
  });
  return { classes, professions };
}

export interface RaidArt {
  /** Class slug -> icon URL. */
  classes: Partial<Record<string, string>>;
  /** Class slug -> icon URL per talent tree, in the buff table's tree order (null where there is none). */
  trees: Partial<Record<string, (string | null)[]>>;
  /** Buff family id -> the icon of the first of its spells that has one. */
  families: Partial<Record<string, string>>;
  version: string;
  label: string;
}

/** The raid builder's icons, matched to the buff table: trees by name, families by their spells. Null when there are none. */
export function raidArt(assets: SiteAssets | null, table: BuffTable): RaidArt | null {
  if (!assets) return null;
  const art: RaidArt = { classes: {}, trees: {}, families: {}, version: assets.version, label: assets.label };
  let any = false;
  for (const slug of CLASSES) {
    const c = assets.classes.get(slug);
    if (!c) continue;
    if (c.icon) { art.classes[slug] = c.icon; any = true; }
    const icons = (table.trees[slug] ?? []).map((name) => c.trees.find((t) => t.name?.toLowerCase() === name.toLowerCase())?.icon ?? null);
    if (icons.some(Boolean)) { art.trees[slug] = icons; any = true; }
  }
  for (const f of table.families) {
    const icon = table.entries.filter((e) => e.family === f.id).flatMap((e) => e.spellIds).map((id) => assets.spellIcons.get(id)).find(Boolean);
    if (icon) { art.families[f.id] = icon; any = true; }
  }
  return any ? art : null;
}

/* ---------- Map pictures ---------- */

/** A map picture placed on the stitched map (yards, x east, y south), the frame the map page draws in. */
export interface ArtBox { uiMapId: number; name: string; url: string; x: number; y: number; width: number; height: number }

/**
 * The pictures for one continent: the continent's own, and one per zone. A held-back zone's picture is
 * left out unless spoilers are on, like its outline. The continent's picture may show a held-back zone
 * painted in, so on a continent that has one it too waits for spoilers (`heldBackHere`); the zone
 * pictures still show. Null when there is none.
 */
export function continentArt(assets: SiteAssets | null, continentId: number, spoilers: boolean, heldBackHere: boolean): { continent: ArtBox | null; zones: ArtBox[] } | null {
  if (!assets) return null;
  const box = (m: MapArt): ArtBox => {
    const a = worldToMap({ continentId, worldX: m.rect.top, worldY: m.rect.left });
    const c = worldToMap({ continentId, worldX: m.rect.bottom, worldY: m.rect.right });
    return { uiMapId: m.uiMapId, name: m.name, url: m.url, x: a.x, y: a.y, width: c.x - a.x, height: c.y - a.y };
  };
  const here = assets.maps.filter((m) => m.continentId === continentId && (spoilers || !m.heldBack));
  const continent = spoilers || !heldBackHere ? here.find((m) => m.kind === "continent") : undefined;
  const zones = here.filter((m) => m.kind === "zone").map(box);
  if (!continent && !zones.length) return null;
  return { continent: continent ? box(continent) : null, zones };
}
