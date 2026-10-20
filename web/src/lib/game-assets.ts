import { AwsClient } from "aws4fetch";
import { z } from "zod";
import { CLASSES } from "@/design/tokens";
import type { BuffTable } from "@/data/game-data/raid";
import { itemTipText, qualityColor } from "@/lib/item-names";
import { assetPath, assetsBaseUrl, MANIFEST_SCHEMA } from "@/lib/talents/assets";
import type { ItemRecord } from "../../../kb/src/assets/items";
import { worldToMap } from "../../../kb/src/world-coords";

// Blizzard's icons, item tooltip facts and map pictures across the site (docs/DATA_POLICY.md,
// "Blizzard's icons, tooltip text and window frame"; docs/ASSETS.md). Server-side only: pages call it
// while rendering and pass ready URLs down. The API, MCP and data downloads never import it
// (talents/assets.test.ts checks that).
//
// Two sources:
// - The public asset folder at NEXT_PUBLIC_GAME_ASSETS_URL (the talent calculator's): manifest.json,
//   icons and map pictures.
// - A private bucket, read with a read-only key (GAME_DATA_*, server-only), for the item tooltip facts.
//   They hold every named item in the build, released or not, so they are never public; a page asks for
//   the items players have reported and nothing else.
// With either unset, or anything that cannot be read in time, the readers here return null or an empty
// map, and each page keeps its text-only look.

/** How long a page keeps a manifest or an item file before reading it again. Each build has its own folder. */
export const REVALIDATE_SECONDS = 3600;
/** A slow bucket must not hold a page up: past this, the page renders without the art. */
export const FETCH_TIMEOUT_MS = 2500;

const Rect = z.object({ left: z.number(), top: z.number(), right: z.number(), bottom: z.number() });
const Pic = z.object({ file: assetPath, width: z.number().int().positive(), height: z.number().int().positive() });
const Text = z.object({ text: z.string(), unresolved: z.array(z.string()) });

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
  familyIcons: z.record(z.string(), assetPath).default({}),
  maps: z.record(z.string(), z.object({
    file: assetPath, small: z.object({ file: assetPath }).nullable().default(null),
    kind: z.enum(["continent", "zone"]), name: z.string(), continentId: z.number().int(), heldBack: z.boolean(), rect: Rect,
  })).default({}),
  // Talent entries by trait definition id: their names, icons and tooltip text (the talent calculator's).
  spells: z.record(z.string(), z.object({ name: z.string().nullable(), icon: assetPath.nullable(), description: Text.nullable() })).default({}),
  spellTips: z.record(z.string(), z.object({ name: z.string().nullable(), description: Text.nullable() })).default({}),
  loadingScreens: z.record(z.string(), Pic.extend({
    small: Pic.nullable().default(null), kind: z.enum(["continent", "dungeon", "raid"]), name: z.string(), heldBack: z.boolean(),
  })).default({}),
  races: z.record(z.string(), z.object({ name: z.string(), female: Pic.nullable(), male: Pic.nullable() })).default({}),
  factions: z.record(z.string(), Pic).default({}),
  logo: Pic.nullable().default(null),
});

export interface MapArt {
  uiMapId: number; kind: "continent" | "zone"; name: string; continentId: number; heldBack: boolean;
  url: string;
  /** A small copy for the zoomed-out view; null in an upload that has none. */
  smallUrl: string | null;
  rect: z.infer<typeof Rect>;
}

export interface SiteAssets {
  base: string;
  /** The game build the files came from, and the label every game file fact carries. */
  version: string;
  label: string;
  /** By class slug ("warrior"): icon URL and the talent trees in the client's order with their icon URLs. */
  classes: Map<string, { name: string; icon: string | null; trees: { name: string | null; icon: string | null }[] }>;
  /** By profession name in lower case; only professions that have an icon. */
  professions: Map<string, { name: string; icon: string }>;
  /** Spell id -> icon URL: raid buff spells, and the spells items are created by or used in. */
  spellIcons: Map<number, string>;
  /** Pet family id -> icon URL. */
  familyIcons: Map<number, string>;
  maps: MapArt[];
  /** Raid buff spell id -> name and tooltip text. */
  spellTips: Map<number, SpellText>;
  /** Talent trait definition id -> name, icon URL and tooltip text. */
  talents: Map<number, SpellText & { icon: string | null }>;
  /** By game map id: the loading screen of a continent, dungeon or raid. */
  loadingScreens: Map<number, LoadingArt>;
  /** By race name in lower case: the race icons. */
  races: Map<string, { name: string; female: string | null; male: string | null }>;
  /** "alliance", "horde" -> emblem URL. */
  factions: Map<string, string>;
  /** The game's own WoW: Forever logo, from its interface files; null when the upload has none. */
  logo: { url: string; width: number; height: number } | null;
}

export interface SpellText { name: string | null; text: string | null; partial: boolean }

export interface LoadingArt {
  mapId: number; name: string; kind: "continent" | "dungeon" | "raid"; heldBack: boolean;
  url: string; width: number;
  /** A small copy for phones and thumbnails; null in an upload that has none. */
  small: { url: string; width: number } | null;
}

/** A file inside the asset folder. */
export const assetUrl = (base: string, file: string) => `${base}/${file}`;
/** An icon by its name in the manifest ("123.webp"). */
export const iconUrl = (base: string, name: string) => assetUrl(base, `icons/${name}`);
/** An item's icon by the file data id its record carries. */
export const itemIconUrl = (base: string, fileId: number) => iconUrl(base, `${fileId}.webp`);
/** The shard that holds an item. */
export const itemShard = (itemId: number, shardSize: number) => Math.floor(itemId / shardSize);
/** The build folder, the last part of the asset URL ("wow_classic_beta-70450-84bea423"); the private bucket uses the same name. */
export function buildFolder(base: string): string | null {
  try {
    const last = new URL(base).pathname.split("/").filter(Boolean).pop();
    return last && /^[A-Za-z0-9_.-]+$/.test(last) && last !== ".." ? last : null;
  } catch {
    return null;
  }
}

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
  const familyIcons = new Map<number, string>();
  for (const [id, name] of Object.entries(m.familyIcons)) if (/^\d+$/.test(id)) familyIcons.set(Number(id), iconUrl(base, name));
  const byId = <T, U>(record: Record<string, T>, f: (v: T, id: number) => U) =>
    new Map(Object.entries(record).filter(([id]) => /^\d+$/.test(id)).map(([id, v]) => [Number(id), f(v, Number(id))] as const));
  const tip = (s: { name: string | null; description: z.infer<typeof Text> | null }): SpellText =>
    ({ name: s.name, text: s.description?.text ?? null, partial: (s.description?.unresolved.length ?? 0) > 0 });
  const url = (p: z.infer<typeof Pic> | null) => (p ? assetUrl(base, p.file) : null);
  return {
    base, version: m.build.version, label: m.label,
    classes: new Map(Object.entries(m.classes).map(([key, c]) => [key.toLowerCase(), { name: c.name, icon: icon(c.icon), trees: c.trees.map((t) => ({ name: t.name, icon: icon(t.icon) })) }])),
    professions, spellIcons, familyIcons,
    maps: Object.entries(m.maps).filter(([id]) => /^\d+$/.test(id)).map(([id, a]) => ({
      uiMapId: Number(id), kind: a.kind, name: a.name, continentId: a.continentId, heldBack: a.heldBack,
      url: assetUrl(base, a.file), smallUrl: a.small ? assetUrl(base, a.small.file) : null, rect: a.rect,
    })),
    spellTips: byId(m.spellTips, tip),
    talents: byId(m.spells, (s) => ({ ...tip(s), icon: icon(s.icon) })),
    loadingScreens: byId(m.loadingScreens, (l, mapId) => ({
      mapId, name: l.name, kind: l.kind, heldBack: l.heldBack, url: assetUrl(base, l.file), width: l.width,
      small: l.small ? { url: assetUrl(base, l.small.file), width: l.small.width } : null,
    })),
    races: new Map(Object.entries(m.races).map(([key, r]) => [key.toLowerCase(), { name: r.name, female: url(r.female), male: url(r.male) }])),
    factions: new Map(Object.entries(m.factions).map(([key, f]) => [key.toLowerCase(), assetUrl(base, f.file)])),
    logo: m.logo ? { url: assetUrl(base, m.logo.file), width: m.logo.width, height: m.logo.height } : null,
  };
}

/** Fetches and reads the manifest. Never throws: any failure or a timeout is null. Nothing is fetched when the URL is unset. */
export async function loadSiteAssets(base: string | null = assetsBaseUrl(), fetcher: typeof fetch = fetch): Promise<SiteAssets | null> {
  if (!base) return null;
  try {
    const res = await fetcher(`${base}/manifest.json`, {
      headers: { accept: "application/json" }, next: { revalidate: REVALIDATE_SECONDS }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return parseSiteManifest(await res.json(), base);
  } catch {
    return null;
  }
}

/* ---------- Items, from the private bucket ---------- */

/** Reads one JSON file from the private bucket by its path, or null. */
export interface PrivateStore { read(path: string): Promise<unknown | null> }

// Signed requests differ every time, so the fetch cache cannot keep them; this does, per server instance.
const kept = new Map<string, { at: number; value: unknown | null }>();
/** For tests: forget what the private bucket returned. */
export const forgetPrivateReads = () => kept.clear();

/**
 * The private bucket from GAME_DATA_S3_ENDPOINT, GAME_DATA_BUCKET, GAME_DATA_ACCESS_KEY_ID and
 * GAME_DATA_SECRET_ACCESS_KEY (GAME_DATA_REGION optional). Null when any is unset: item tooltips then do not show.
 */
export function privateStoreFromEnv(env: Record<string, string | undefined> = process.env, fetcher?: typeof fetch): PrivateStore | null {
  const endpoint = env.GAME_DATA_S3_ENDPOINT?.trim(), bucket = env.GAME_DATA_BUCKET?.trim();
  const accessKeyId = env.GAME_DATA_ACCESS_KEY_ID?.trim(), secretAccessKey = env.GAME_DATA_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || !/^https?:\/\//.test(endpoint)) return null;
  const client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: env.GAME_DATA_REGION?.trim() || "auto" });
  const root = `${endpoint.replace(/\/+$/, "")}/${encodeURIComponent(bucket)}`;
  return {
    async read(path) {
      const url = `${root}/${path}`;
      const hit = kept.get(url);
      // A miss is kept a minute, so a missing file is not asked for on every page view.
      if (hit && Date.now() - hit.at < (hit.value === null ? 60_000 : REVALIDATE_SECONDS * 1000)) return hit.value;
      let value: unknown | null = null;
      try {
        const signed = await client.sign(url, { method: "GET", headers: { accept: "application/json" } });
        const res = await (fetcher ?? fetch)(signed, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
        value = res.ok ? await res.json() : null;
      } catch {
        value = null;
      }
      kept.set(url, { at: Date.now(), value });
      return value;
    },
  };
}

const ItemIndexSchema = z.object({
  schema: z.literal("everloot.game-items/1"),
  build: z.object({ version: z.string() }),
  shardSize: z.number().int().positive(),
  shards: z.record(z.string(), z.object({ file: assetPath })),
});

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

/**
 * Tooltips for the given items: the caller passes only items players have reported (the 3-install rule),
 * and only the shards they are in are read. Nothing is read without the public manifest (its build and
 * icons) and the private bucket, and the private files must be for the same build. Never throws.
 */
export async function loadItemTips(assets: SiteAssets | null, ids: readonly number[], store: PrivateStore | null = privateStoreFromEnv()): Promise<Map<number, ItemTip>> {
  const out = new Map<number, ItemTip>();
  const wanted = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
  const folder = assets ? buildFolder(assets.base) : null;
  if (!assets || !store || !folder || !wanted.length) return out;
  const index = ItemIndexSchema.safeParse(await store.read(`${folder}/items.json`));
  if (!index.success || index.data.build.version !== assets.version) return out;
  const byShard = new Map<number, number[]>();
  for (const id of wanted) {
    const s = itemShard(id, index.data.shardSize);
    byShard.set(s, [...(byShard.get(s) ?? []), id]);
  }
  await Promise.all([...byShard].map(async ([shard, ids]) => {
    const file = index.data.shards[String(shard)]?.file;
    if (!file) return;
    const body = z.record(z.string(), z.unknown()).safeParse(await store.read(`${folder}/${file}`));
    if (!body.success) return;
    for (const id of ids) {
      const r = ItemRecordSchema.safeParse(body.data[String(id)]);
      if (r.success) out.set(id, itemTip(r.data, assets));
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
  /** Buff family id -> the tooltip of the first of its spells that has text. */
  familyTips: Partial<Record<string, SpellTip>>;
  version: string;
  label: string;
}

/** What a spell name shows on hover and focus: plain, serialisable data for the tooltip. */
export interface SpellTip {
  name: string;
  icon: string | null;
  text: string | null;
  /** The text holds a placeholder for a value the tables do not give. */
  partial: boolean;
  /** "found in game files, unconfirmed · build x". */
  label: string;
}

export const tipLabel = (assets: Pick<SiteAssets, "label" | "version">) => `${assets.label} · build ${assets.version}`;

/** The raid builder's icons, matched to the buff table: trees by name, families by their spells. Null when there are none. */
export function raidArt(assets: SiteAssets | null, table: BuffTable): RaidArt | null {
  if (!assets) return null;
  const art: RaidArt = { classes: {}, trees: {}, families: {}, familyTips: {}, version: assets.version, label: assets.label };
  let any = false;
  for (const slug of CLASSES) {
    const c = assets.classes.get(slug);
    if (!c) continue;
    if (c.icon) { art.classes[slug] = c.icon; any = true; }
    const icons = (table.trees[slug] ?? []).map((name) => c.trees.find((t) => t.name?.toLowerCase() === name.toLowerCase())?.icon ?? null);
    if (icons.some(Boolean)) { art.trees[slug] = icons; any = true; }
  }
  for (const f of table.families) {
    const spellIds = table.entries.filter((e) => e.family === f.id).flatMap((e) => e.spellIds);
    const icon = spellIds.map((id) => assets.spellIcons.get(id)).find(Boolean);
    if (icon) { art.families[f.id] = icon; any = true; }
    const withText = spellIds.find((id) => assets.spellTips.get(id)?.text);
    if (withText !== undefined) {
      const s = assets.spellTips.get(withText)!;
      art.familyTips[f.id] = { name: s.name ?? f.label, icon: assets.spellIcons.get(withText) ?? icon ?? null, text: s.text, partial: s.partial, label: tipLabel(assets) };
      any = true;
    }
  }
  return any ? art : null;
}

/* ---------- Map pictures ---------- */

/** A map picture placed on the stitched map (yards, x east, y south), the frame the map page draws in. */
export interface ArtBox { uiMapId: number; name: string; url: string; smallUrl: string | null; x: number; y: number; width: number; height: number }

/**
 * The pictures for one continent: the continent's own, and one per zone. A held-back zone's picture is
 * left out unless spoilers are on, like its outline. The continent's picture always shows: it is the
 * original world's parchment map, with no names and no new land painted in. Null when there is none.
 */
export function continentArt(assets: SiteAssets | null, continentId: number, spoilers: boolean): { continent: ArtBox | null; zones: ArtBox[] } | null {
  if (!assets) return null;
  const box = (m: MapArt): ArtBox => {
    const a = worldToMap({ continentId, worldX: m.rect.top, worldY: m.rect.left });
    const c = worldToMap({ continentId, worldX: m.rect.bottom, worldY: m.rect.right });
    return { uiMapId: m.uiMapId, name: m.name, url: m.url, smallUrl: m.smallUrl, x: a.x, y: a.y, width: c.x - a.x, height: c.y - a.y };
  };
  const here = assets.maps.filter((m) => m.continentId === continentId && (spoilers || !m.heldBack));
  const continent = here.find((m) => m.kind === "continent");
  const zones = here.filter((m) => m.kind === "zone").map(box);
  if (!continent && !zones.length) return null;
  return { continent: continent ? box(continent) : null, zones };
}

/* ---------- Loading screens, emblems and the launch banner ---------- */

/**
 * Which game map's loading screen a page shows as its banner: Eastern Kingdoms on the home page, Kalimdor
 * on the patch notes, Scarlet Monastery on the lore archive, Molten Core on the raid builder. All are maps of the original world, so no banner
 * can spoil anything. The world map shows the continent on view.
 */
export const BANNER_MAP = { home: 0, changes: 1, lore: 189, raid: 409 } as const;

/** A map's loading screen, or null: none in the upload, or held back with spoilers off. */
export function loadingArt(assets: SiteAssets | null, mapId: number, spoilers = false): LoadingArt | null {
  const art = assets?.loadingScreens.get(mapId);
  return art && (spoilers || !art.heldBack) ? art : null;
}

/**
 * Small loading screens by dungeon or raid name, for the world map's entrance list. A held-back map's
 * picture is left out unless spoilers are on; when two maps share a name, the released one is used.
 */
export function instanceThumbs(assets: SiteAssets | null, spoilers: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  for (const art of [...(assets?.loadingScreens.values() ?? [])].sort((a, b) => Number(a.heldBack) - Number(b.heldBack) || a.mapId - b.mapId)) {
    if (art.kind === "continent" || (art.heldBack && !spoilers) || out[art.name]) continue;
    out[art.name] = art.small?.url ?? art.url;
  }
  return out;
}

export interface LaunchArt {
  logo: { url: string; width: number; height: number };
  background: LoadingArt | null;
  version: string;
  label: string;
}

/** The home page's launch banner: only with the game's own logo. No logo in the upload, no banner, and nothing stands in for it. */
export function launchArt(assets: SiteAssets | null): LaunchArt | null {
  if (!assets?.logo) return null;
  return { logo: assets.logo, background: loadingArt(assets, BANNER_MAP.home), version: assets.version, label: assets.label };
}

/** Which of the client's two race icons the site shows. */
export const RACE_ICON_SEX: "female" | "male" = "female";

/**
 * Race emblems by race name as the site writes it ("Night Elf"), and faction emblems by faction name
 * ("Alliance", "Horde"), for the race and class table. Only those the upload has.
 */
export function emblems(assets: SiteAssets | null): { races: Map<string, string>; factions: Map<string, string> } {
  const races = new Map<string, string>();
  const factions = new Map<string, string>();
  if (!assets) return { races, factions };
  for (const r of assets.races.values()) {
    const icon = r[RACE_ICON_SEX] ?? r.female ?? r.male;
    if (icon) races.set(r.name, icon);
  }
  for (const [key, icon] of assets.factions) factions.set(key.charAt(0).toUpperCase() + key.slice(1), icon);
  return { races, factions };
}

/** What a credit line names, from the kinds of art a page shows: ("icons", false, "loading screen art") -> "Icons and loading screen art". */
export function creditWhat(...parts: (string | false | null | undefined)[]): string {
  const shown = parts.filter((p): p is string => Boolean(p));
  const text = shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}` : shown[0] ?? "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}
