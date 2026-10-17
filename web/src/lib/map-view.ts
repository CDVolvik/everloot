/**
 * The map page's view maths and layer rules, kept apart from the component so they can be tested.
 * Everything is in yards on the stitched map (x east, y south), the frame world-map.ts builds.
 */

export interface Box { x: number; y: number; width: number; height: number }
/** The camera: zoom 1 shows the whole base box; a view is the base box divided by zoom, centred on (cx, cy). */
export interface Camera { zoom: number; cx: number; cy: number }

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 40;
/** One keyboard or button step of zoom, and of pan as a share of the visible width. */
export const ZOOM_STEP = 1.5;
export const PAN_STEP = 0.2;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** The base box and a camera, kept inside the base: the camera cannot leave the map. */
export function fitCamera(base: Box, camera: Camera): Camera {
  const zoom = clamp(Number.isFinite(camera.zoom) ? camera.zoom : MIN_ZOOM, MIN_ZOOM, MAX_ZOOM);
  const halfW = base.width / zoom / 2, halfH = base.height / zoom / 2;
  return {
    zoom,
    cx: clamp(Number.isFinite(camera.cx) ? camera.cx : base.x + base.width / 2, base.x + halfW, base.x + base.width - halfW),
    cy: clamp(Number.isFinite(camera.cy) ? camera.cy : base.y + base.height / 2, base.y + halfH, base.y + base.height - halfH),
  };
}

export function homeCamera(base: Box): Camera {
  return { zoom: MIN_ZOOM, cx: base.x + base.width / 2, cy: base.y + base.height / 2 };
}

/** The SVG viewBox for a camera. */
export function cameraBox(base: Box, camera: Camera): Box {
  const width = base.width / camera.zoom, height = base.height / camera.zoom;
  return { x: camera.cx - width / 2, y: camera.cy - height / 2, width, height };
}

/** Zooms by `factor` and keeps the map point under (fx, fy) where it was on screen: wheel and pinch. */
export function zoomAt(base: Box, camera: Camera, factor: number, fx: number, fy: number): Camera {
  const zoom = clamp(camera.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  const ratio = camera.zoom / zoom;
  return fitCamera(base, { zoom, cx: fx - (fx - camera.cx) * ratio, cy: fy - (fy - camera.cy) * ratio });
}

/** Moves the camera by yards. */
export function panBy(base: Box, camera: Camera, dx: number, dy: number): Camera {
  return fitCamera(base, { ...camera, cx: camera.cx + dx, cy: camera.cy + dy });
}

export type MapKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "+" | "=" | "-" | "_" | "0" | "Home";

/** What a key does to the camera, or null when the key is not a map key. */
export function cameraForKey(base: Box, camera: Camera, key: string): Camera | null {
  const view = cameraBox(base, camera);
  switch (key) {
    case "ArrowLeft": return panBy(base, camera, -view.width * PAN_STEP, 0);
    case "ArrowRight": return panBy(base, camera, view.width * PAN_STEP, 0);
    case "ArrowUp": return panBy(base, camera, 0, -view.height * PAN_STEP);
    case "ArrowDown": return panBy(base, camera, 0, view.height * PAN_STEP);
    case "+": case "=": return zoomAt(base, camera, ZOOM_STEP, camera.cx, camera.cy);
    case "-": case "_": return zoomAt(base, camera, 1 / ZOOM_STEP, camera.cx, camera.cy);
    case "0": case "Home": return homeCamera(base);
    default: return null;
  }
}

/** Pinch: the zoom factor is the ratio of finger distances; the focus is the midpoint. */
export function pinchFactor(before: number, after: number): number {
  return before > 0 && after > 0 ? after / before : 1;
}

/** A camera centred on a point with a zoom that shows about `span` yards across. */
export function cameraOn(base: Box, x: number, y: number, span: number): Camera {
  return fitCamera(base, { zoom: base.width / Math.max(span, 1), cx: x, cy: y });
}

// --- Layers ---

export const LAYER_IDS = ["zones", "entrances", "npcs", "vendors"] as const;
export type LayerId = (typeof LAYER_IDS)[number];
export type LayerState = Record<LayerId, boolean>;

/** Every layer starts on; the spoiler switch is separate and starts off. */
export const DEFAULT_LAYERS: LayerState = { zones: true, entrances: true, npcs: true, vendors: true };
/** Held-back zones, and anything in them, stay hidden until the reader turns this on. */
export const DEFAULT_SPOILERS = false;

export interface MapZone { mapId: number; name: string; x: number; y: number; width: number; height: number; heldBack: boolean }
export interface MapEntrance { id: string; names: string[]; raid: boolean; x: number; y: number; worldX: number; worldY: number }
export interface MapPin {
  id: string; kind: "npc" | "vendor"; npcId: number; name: string | null; mapId: number; zoneName: string;
  x: number; y: number; zoneX: number; zoneY: number; reporters: number; heldBack: boolean;
}
export interface MapItems { zones: MapZone[]; entrances: MapEntrance[]; pins: MapPin[] }

/** What the layers and the spoiler switch let through. Pure: the same inputs always give the same list. */
export function visibleItems(items: MapItems, layers: LayerState, spoilers: boolean): MapItems {
  return {
    zones: layers.zones ? items.zones.filter((z) => spoilers || !z.heldBack) : [],
    entrances: layers.entrances ? items.entrances : [],
    pins: items.pins.filter((p) => (p.kind === "npc" ? layers.npcs : layers.vendors) && (spoilers || !p.heldBack)),
  };
}

// --- Map pictures ---

/** A picture placed in the same yards as the zones: the game's own continent or zone map. */
export interface ArtImage { uiMapId: number; name: string; url: string; x: number; y: number; width: number; height: number }
export interface MapArtLayer { continent: ArtImage | null; zones: ArtImage[] }

/** From this zoom in, the zone under the middle of the view shows its own, sharper picture over the continent's. */
export const ZONE_ART_ZOOM = 2.5;

/**
 * The zone picture to lay over the continent: the smallest zone whose rectangle holds the middle of the
 * view, once the reader has zoomed in to ZONE_ART_ZOOM. Without a continent picture, every zone picture
 * shows at every zoom, smallest on top. Pure, so the choice is tested without a browser.
 */
export function zoneArtShown(art: MapArtLayer, camera: Camera): ArtImage[] {
  const bySize = [...art.zones].sort((a, b) => b.width * b.height - a.width * a.height);
  if (!art.continent) return bySize;
  if (camera.zoom < ZONE_ART_ZOOM) return [];
  const under = bySize.filter((z) => camera.cx >= z.x && camera.cx <= z.x + z.width && camera.cy >= z.y && camera.cy <= z.y + z.height);
  return under.length ? [under[under.length - 1]!] : [];
}

// --- Deep links ---

export interface DeepLink { mapId: number; x: number; y: number }

/** `/map?zone=<UiMap id>&x=<0..100>&y=<0..100>`, as the NPC, vendor, quest and item pages link it. */
export function mapHref(link: DeepLink): string {
  const r = (n: number) => Math.round(n * 10) / 10;
  return `/map?zone=${link.mapId}&x=${r(link.x)}&y=${r(link.y)}`;
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const numeric = (v: string | undefined) => (v !== undefined && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN);

/** Reads the query. Anything missing, not a number or outside 0..100 gives null: a bad link opens the plain map. */
export function parseDeepLink(query: { zone?: string | string[]; x?: string | string[]; y?: string | string[] }): DeepLink | null {
  const mapId = numeric(first(query.zone)), x = numeric(first(query.x)), y = numeric(first(query.y));
  if (!Number.isInteger(mapId) || mapId < 1 || !(x >= 0 && x <= 100) || !(y >= 0 && y <= 100)) return null;
  return { mapId, x, y };
}

// --- Frame, zone visibility and labels ---

/** The base box grown on one axis to the frame's aspect ratio (width / height), around the same centre: "fit the whole continent". */
export function frameBox(base: Box, aspect: number): Box {
  if (!(aspect > 0) || !Number.isFinite(aspect)) return base;
  const width = Math.max(base.width, base.height * aspect), height = width / aspect;
  return { x: base.x + base.width / 2 - width / 2, y: base.y + base.height / 2 - height / 2, width, height };
}

/** A camera that shows `box` with `margin` (1.2 is a fifth extra) inside the frame. */
export function cameraForBox(frame: Box, box: Box, margin = 1.2): Camera {
  const zoom = Math.min(frame.width / (box.width * margin), frame.height / (box.height * margin));
  return fitCamera(frame, { zoom, cx: box.x + box.width / 2, cy: box.y + box.height / 2 });
}

const intersects = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Keeps part of a zone on screen: when the view shows none of the given zones, the camera moves to the
 * nearest point of the nearest zone. Zoom is left alone.
 */
export function ensureZoneVisible(frame: Box, camera: Camera, zones: Box[]): Camera {
  if (!zones.length) return camera;
  const view = cameraBox(frame, camera);
  if (zones.some((z) => intersects(view, z))) return camera;
  let best: { x: number; y: number; d: number } | null = null;
  for (const z of zones) {
    const x = clamp(camera.cx, z.x, z.x + z.width), y = clamp(camera.cy, z.y, z.y + z.height);
    const d = Math.hypot(x - camera.cx, y - camera.cy);
    if (!best || d < best.d) best = { x, y, d };
  }
  return fitCamera(frame, { ...camera, cx: best!.x, cy: best!.y });
}

/** Label text size in pixels: 11 zoomed out, growing a little as the reader zooms in, never above 14. */
export function labelFontPx(zoom: number): number {
  return clamp(11 + Math.log2(Math.max(zoom, 1)) * 0.6, 11, 14);
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
