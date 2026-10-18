import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { readJsonFile } from "./json-file";

export interface Bounds { x: number; y: number; width: number; height: number }
export interface Area { x: number; y: number; width: number; height: number }

export const DEFAULT_SIZE = { width: 1040, height: 720 };
export const MIN_SIZE = { width: 760, height: 540 };
/** How much of a remembered window must still lie on a connected display for its position to count. */
const VISIBLE = { width: 120, height: 40 };

/** The window's last bounds from window.json; null when there is none or it does not parse. */
export function readWindowState(path: string): Partial<Bounds> | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readJsonFile(path) as Record<string, unknown>;
    const out: Partial<Bounds> = {};
    for (const k of ["x", "y", "width", "height"] as const) {
      const v = raw[k];
      if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.round(v);
    }
    return out;
  } catch { return null; }
}

export function writeWindowState(path: string, bounds: Bounds): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify(bounds));
  renameSync(`${path}.tmp`, path);
}

/**
 * The bounds to open with: the remembered size clamped to the minimum and to the largest work
 * area, and the remembered position only when enough of the window would still be on a display
 * (a monitor unplugged since must not leave the window off screen). Without a usable position
 * Electron centers the window.
 */
export function fitWindow(saved: Partial<Bounds> | null, areas: Area[]): { width: number; height: number; x?: number; y?: number } {
  const maxW = Math.max(MIN_SIZE.width, ...areas.map((a) => a.width));
  const maxH = Math.max(MIN_SIZE.height, ...areas.map((a) => a.height));
  const width = Math.min(maxW, Math.max(MIN_SIZE.width, saved?.width ?? DEFAULT_SIZE.width));
  const height = Math.min(maxH, Math.max(MIN_SIZE.height, saved?.height ?? DEFAULT_SIZE.height));
  if (saved?.x === undefined || saved.y === undefined) return { width, height };
  const { x, y } = saved;
  const onScreen = areas.some((a) =>
    Math.min(x + width, a.x + a.width) - Math.max(x, a.x) >= VISIBLE.width
    && Math.min(y + height, a.y + a.height) - Math.max(y, a.y) >= VISIBLE.height);
  return onScreen ? { width, height, x, y } : { width, height };
}
