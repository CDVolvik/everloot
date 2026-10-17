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
