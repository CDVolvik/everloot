/**
 * The map page's layer rules, search, links and label placement, kept apart from the component so they can
 * be tested. Everything is in yards on the stitched map (x east, y south), the frame world-map.ts builds.
 */

export interface Box { x: number; y: number; width: number; height: number }
/** A camera over a base box: zoom 1 shows the whole box, a view is the box divided by zoom, centred on (cx, cy). */
export interface Camera { zoom: number; cx: number; cy: number }

/** The view a camera shows over a base box. */
export function cameraBox(base: Box, camera: Camera): Box {
  const width = base.width / camera.zoom, height = base.height / camera.zoom;
  return { x: camera.cx - width / 2, y: camera.cy - height / 2, width, height };
}

// --- Layers ---

export const LAYER_IDS = ["zones", "entrances", "flightMasters", "flightPaths", "npcs", "vendors"] as const;
export type LayerId = (typeof LAYER_IDS)[number];
export type LayerState = Record<LayerId, boolean>;

/** Every layer on, or every layer off: the sidebar's Show all and Hide all. */
export const allLayers = (on: boolean): LayerState => Object.fromEntries(LAYER_IDS.map((id) => [id, on])) as LayerState;

/** Every layer starts on; the spoiler switch is separate and starts off. */
export const DEFAULT_LAYERS: LayerState = allLayers(true);
/** Held-back zones, and anything in them, stay hidden until the reader turns this on. */
export const DEFAULT_SPOILERS = false;

export interface MapZone { mapId: number; name: string; x: number; y: number; width: number; height: number; heldBack: boolean }
export interface MapEntrance { id: string; names: string[]; raid: boolean; x: number; y: number; worldX: number; worldY: number }
export interface MapFlightMaster { id: string; name: string; x: number; y: number; heldBack: boolean }
export interface MapFlightLine { id: string; from: string; to: string; points: [number, number][]; heldBack: boolean }
export interface MapPin {
  id: string; kind: "npc" | "vendor"; npcId: number; name: string | null; mapId: number; zoneName: string;
  x: number; y: number; zoneX: number; zoneY: number; reporters: number; heldBack: boolean;
}
export interface MapItems {
  zones: MapZone[]; entrances: MapEntrance[]; pins: MapPin[];
  flightMasters: MapFlightMaster[]; flightLines: MapFlightLine[];
}

/** What the layers and the spoiler switch let through. Pure: the same inputs always give the same list. */
export function visibleItems(items: MapItems, layers: LayerState, spoilers: boolean): MapItems {
  return {
    zones: layers.zones ? items.zones.filter((z) => spoilers || !z.heldBack) : [],
    entrances: layers.entrances ? items.entrances : [],
    pins: items.pins.filter((p) => (p.kind === "npc" ? layers.npcs : layers.vendors) && (spoilers || !p.heldBack)),
    flightMasters: layers.flightMasters ? items.flightMasters.filter((f) => spoilers || !f.heldBack) : [],
    flightLines: layers.flightPaths ? items.flightLines.filter((l) => spoilers || !l.heldBack) : [],
  };
}

/**
 * How many items each layer holds on the continent, whether or not it is switched on, counting only what the
 * spoiler switch lets through. Flight masters count by name, as the list and search show them: a few names have
 * two nodes on one spot.
 */
export function layerCounts(items: MapItems, spoilers: boolean): Record<LayerId, number> {
  const all = visibleItems(items, DEFAULT_LAYERS, spoilers);
  return {
    zones: all.zones.length,
    entrances: all.entrances.length,
    flightMasters: new Set(all.flightMasters.map((f) => f.name)).size,
    flightPaths: all.flightLines.length,
    npcs: all.pins.filter((p) => p.kind === "npc").length,
    vendors: all.pins.filter((p) => p.kind === "vendor").length,
  };
}

// --- Zone coordinates ---

export interface ZoneSpot { zone: MapZone; x: number; y: number }

/**
 * The zone a point on the map lies in, and where in it, on the game's 0 to 100 scale (one decimal, (0, 0) at
 * the top-left corner). Where zones overlap (a city inside its zone) the smallest wins. Null outside every zone.
 */
export function zoneSpot(zones: readonly MapZone[], x: number, y: number): ZoneSpot | null {
  let best: MapZone | null = null;
  for (const z of zones) {
    if (x < z.x || x > z.x + z.width || y < z.y || y > z.y + z.height) continue;
    if (!best || z.width * z.height < best.width * best.height) best = z;
  }
  if (!best) return null;
  const r = (n: number) => Math.round(n * 10) / 10;
  return { zone: best, x: r(((x - best.x) / best.width) * 100), y: r(((y - best.y) / best.height) * 100) };
}

/** The line a player pastes into the game chat to put a waypoint on a spot (the zone's 0 to 100 scale). */
export const wayCommand = (x: number, y: number, name: string) => `/way ${x} ${y} ${name}`.trim();

// --- Search ---

export type SearchKind = "zone" | "entrance" | "flight" | "npc" | "vendor";
export interface SearchHit { kind: SearchKind; id: string; label: string; detail: string; x: number; y: number }

const RANK_LIMIT = 8;

/**
 * Zones, entrances, flight masters and player-observed NPCs whose name has every word of the query, names that
 * start with the query first. Only what the layers let through is searched, so a held-back zone never turns up.
 */
export function searchMap(items: MapItems, query: string, limit = RANK_LIMIT): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/);
  const hits: (SearchHit & { rank: number })[] = [];
  const add = (hit: SearchHit, names: string[]) => {
    const lower = names.map((n) => n.toLowerCase());
    if (!words.every((w) => lower.some((n) => n.includes(w)))) return;
    hits.push({ ...hit, rank: lower.some((n) => n.startsWith(q)) ? 0 : 1 });
  };
  const centre = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
  for (const z of items.zones) add({ kind: "zone", id: `z${z.mapId}`, label: z.name, detail: z.heldBack ? "Zone, unconfirmed" : "Zone", ...centre(z) }, [z.name]);
  for (const e of items.entrances) add({ kind: "entrance", id: `e${e.id}`, label: e.names.join(", "), detail: e.raid ? "Raid entrance" : "Dungeon entrance", x: e.x, y: e.y }, e.names);
  const seen = new Set<string>();
  for (const f of items.flightMasters) {
    if (seen.has(f.name)) continue;
    seen.add(f.name);
    add({ kind: "flight", id: f.id, label: f.name, detail: "Flight master", x: f.x, y: f.y }, [f.name]);
  }
  for (const p of items.pins) add({ kind: p.kind, id: p.id, label: p.name ?? `NPC ${p.npcId}`, detail: `${p.kind === "vendor" ? "Vendor" : "NPC"} in ${p.zoneName}`, x: p.x, y: p.y }, [p.name ?? `NPC ${p.npcId}`]);
  return hits.sort((a, b) => a.rank - b.rank || a.label.length - b.label.length || a.label.localeCompare(b.label) || a.id.localeCompare(b.id)).slice(0, limit).map(({ rank: _rank, ...hit }) => hit);
}

// --- Map pictures ---

/** A picture placed in the same yards as the zones: the game's own continent or zone map. */
export interface ArtImage { uiMapId: number; name: string; url: string; smallUrl: string | null; x: number; y: number; width: number; height: number }
export interface MapArtLayer { continent: ArtImage | null; zones: ArtImage[] }

/** From this zoom in, zone pictures are drawn at full size. */
export const ZONE_ART_ZOOM = 2.5;

const intersects = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Which zone pictures to draw, and at which size. Only pictures that reach into the view are drawn.
 * With a continent picture, a zone's own picture is laid over it only once the reader has zoomed in to
 * ZONE_ART_ZOOM, and only for the smallest zone under the middle of the view. Without one, every zone in
 * view shows, largest first so the smaller sit on top, from its small copy until zoomed in. Pure, so the
 * choice is tested without a browser.
 */
export function zoneArtShown(art: MapArtLayer, camera: Camera, view: Box): ArtImage[] {
  const bySize = [...art.zones].filter((z) => intersects(view, z)).sort((a, b) => b.width * b.height - a.width * a.height);
  if (!art.continent) return camera.zoom < ZONE_ART_ZOOM ? bySize.map((z) => ({ ...z, url: z.smallUrl ?? z.url })) : bySize;
  if (camera.zoom < ZONE_ART_ZOOM) return [];
  const under = bySize.filter((z) => camera.cx >= z.x && camera.cx <= z.x + z.width && camera.cy >= z.y && camera.cy <= z.y + z.height);
  return under.length ? [under[under.length - 1]!] : [];
}

// --- Links ---

export interface DeepLink { mapId: number; x: number; y: number }

/** `/map?zone=<UiMap id>&x=<0..100>&y=<0..100>`, as the NPC, vendor, quest and item pages link it. */
export function mapHref(link: DeepLink): string {
  const r = (n: number) => Math.round(n * 10) / 10;
  return `/map?zone=${link.mapId}&x=${r(link.x)}&y=${r(link.y)}`;
}

/** `/map?zone=<UiMap id>`: the zone fitted to the view, as the zone pages link it. */
export const zoneHref = (mapId: number, spoilers = false) => `/map?zone=${mapId}${spoilers ? "&spoilers=1" : ""}`;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const numeric = (v: string | undefined) => (v !== undefined && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN);

/** Reads the query. Anything missing, not a number or outside 0..100 gives null: a bad link opens the plain map. */
export function parseDeepLink(query: { zone?: string | string[]; x?: string | string[]; y?: string | string[] }): DeepLink | null {
  const mapId = numeric(first(query.zone)), x = numeric(first(query.x)), y = numeric(first(query.y));
  if (!Number.isInteger(mapId) || mapId < 1 || !(x >= 0 && x <= 100) || !(y >= 0 && y <= 100)) return null;
  return { mapId, x, y };
}

/** `?zone=<UiMap id>` with no spot: the id of the zone to fit to the view, or null. */
export function parseZoneLink(query: { zone?: string | string[]; x?: string | string[]; y?: string | string[] }): number | null {
  if (parseDeepLink(query)) return null;
  const mapId = numeric(first(query.zone));
  return Number.isInteger(mapId) && mapId >= 1 ? mapId : null;
}

/** Where the reader was last: the centre in yards, the zoom, the selected item. The address carries it so a link opens the same view. */
export interface ViewState { x: number; y: number; zoom: number; pin: string | null }

/** Reads `at=<x>,<y>`, `z=<zoom>` and `pin=<id>`; a part that is missing or malformed is left out. */
export function parseViewState(query: { at?: string | string[]; z?: string | string[]; pin?: string | string[] }): { at: [number, number] | null; zoom: number | null; pin: string | null } {
  const [ax, ay] = (first(query.at) ?? "").split(",").map((s) => numeric(s));
  const zoom = numeric(first(query.z));
  const pin = first(query.pin);
  return {
    at: Number.isFinite(ax) && Number.isFinite(ay) && Math.abs(ax!) < 1e6 && Math.abs(ay!) < 1e6 ? [ax!, ay!] : null,
    zoom: Number.isFinite(zoom) && zoom >= -12 && zoom <= 8 ? zoom : null,
    pin: pin && /^[a-z][A-Za-z0-9_.-]{0,40}$/.test(pin) ? pin : null,
  };
}

/** How many yards across the view is when it opens on a spot or a pin. */
export const SPOT_SPAN = 1200;
export const spotBox = (x: number, y: number): Box => ({ x: x - SPOT_SPAN / 2, y: y - SPOT_SPAN / 2, width: SPOT_SPAN, height: SPOT_SPAN });

/** Where the map opens: a box to fit, or a centre and a zoom. */
export type InitialView = { fit: Box } | { x: number; y: number; zoom: number };

/**
 * Where a link opens the map, first match wins: the camera in the address (`at` with `z`), the deep link's spot,
 * the pin in the address, the zone the link asked for, else the whole continent. A pin that is not on this
 * continent, or not shown, falls through.
 */
export function initialView(input: {
  base: Box; items: MapItems; view: { at: [number, number] | null; zoom: number | null; pin: string | null };
  marker: { x: number; y: number } | null; zoneId: number | null;
}): InitialView {
  const { base, items, view, marker, zoneId } = input;
  if (view.at && view.zoom !== null) return { x: view.at[0], y: view.at[1], zoom: view.zoom };
  if (marker) return { fit: spotBox(marker.x, marker.y) };
  const pinned = view.pin
    ? [...items.entrances.map((e) => ({ id: `e${e.id}`, x: e.x, y: e.y })), ...items.flightMasters, ...items.pins].find((p) => p.id === view.pin)
    : undefined;
  if (pinned) return { fit: spotBox(pinned.x, pinned.y) };
  const zone = zoneId !== null ? items.zones.find((z) => z.mapId === zoneId) : undefined;
  return { fit: zone ?? base };
}

/** The address for the reader's view: the fixed parts of the page's own address, then where the camera is. */
export function viewSearch(base: URLSearchParams, state: ViewState): string {
  const q = new URLSearchParams(base);
  for (const k of ["at", "z", "pin"]) q.delete(k);
  q.set("at", `${Math.round(state.x)},${Math.round(state.y)}`);
  q.set("z", String(Math.round(state.zoom * 100) / 100));
  if (state.pin) q.set("pin", state.pin);
  return q.toString();
}

// --- Labels ---

/** Label text size in pixels: 11 zoomed out, growing a little as the reader zooms in, never above 14. */
export function labelFontPx(zoom: number): number {
  return Math.min(14, Math.max(11, 11 + Math.log2(Math.max(zoom, 1)) * 0.6));
}

export interface LabelCandidate { id: string; text: string; x: number; y: number; priority: number; align: "middle" | "start" }

/**
 * Which labels to draw. Greedy by priority: a label is drawn when it lies wholly inside the view and does
 * not overlap one already drawn, so a lower-priority label gives way. (x, y) is the anchor in yards.
 */
export function placeLabels(candidates: LabelCandidate[], view: Box, widthPx: number, fontPx: number): LabelCandidate[] {
  const k = widthPx / view.width, heightPx = view.height * k, h = fontPx * 1.4, pad = 2;
  const taken: { l: number; r: number; t: number; b: number }[] = [];
  const placed: LabelCandidate[] = [];
  for (const c of [...candidates].sort((a, b) => b.priority - a.priority || a.text.length - b.text.length || a.id.localeCompare(b.id))) {
    const sx = (c.x - view.x) * k, sy = (c.y - view.y) * k, w = c.text.length * fontPx * 0.58 + 6;
    const l = c.align === "middle" ? sx - w / 2 : sx, r = l + w, t = sy - h / 2, b = sy + h / 2;
    if (l < 0 || t < 0 || r > widthPx || b > heightPx) continue;
    if (taken.some((o) => l < o.r + pad && o.l < r + pad && t < o.b + pad && o.t < b + pad)) continue;
    taken.push({ l, r, t, b });
    placed.push(c);
  }
  return placed;
}
