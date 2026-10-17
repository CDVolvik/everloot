/**
 * Zone rectangles in world coordinates, from map_bounds records, for drawing one continuous map.
 * Bounds are exact game data, so honest reports match: a zone's bounds are used once 2 installs
 * agree within one world unit on the continent and every edge. Each install counts with its
 * newest report, and when a build moves a zone the newest agreed bounds win. No install ids out.
 */

export const AGREEING_INSTALLS = 2;
export const WORLD_UNIT_TOLERANCE = 1;

export interface MapBoundsRow {
  installId: string;
  capturedAt: string;
  mapId: number;
  continentId: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ZoneBounds {
  mapId: number;
  continentId: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** Installs whose newest report matches these bounds. */
  installs: number;
  agreed: boolean;
}

function matches(a: MapBoundsRow, b: MapBoundsRow): boolean {
  return a.continentId === b.continentId &&
    (["left", "top", "right", "bottom"] as const).every((edge) => Math.abs(a[edge] - b[edge]) <= WORLD_UNIT_TOLERANCE);
}

export function rollupMapBounds(rows: MapBoundsRow[]): ZoneBounds[] {
  const newest = new Map<number, Map<string, MapBoundsRow>>();
  for (const row of rows) {
    if (!Number.isFinite(Date.parse(row.capturedAt))) continue;
    const zone = newest.get(row.mapId) ?? new Map<string, MapBoundsRow>();
    const old = zone.get(row.installId);
    if (!old || Date.parse(row.capturedAt) > Date.parse(old.capturedAt)) zone.set(row.installId, row);
    newest.set(row.mapId, zone);
  }
  const result: ZoneBounds[] = [];
  for (const [mapId, zone] of newest) {
    const reports = [...zone.values()].sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
    let best: { report: MapBoundsRow; installs: number } | null = null;
    for (const candidate of reports) {
      const installs = reports.filter((r) => matches(candidate, r)).length;
      if (!best || installs > best.installs) best = { report: candidate, installs };
      if (installs >= AGREEING_INSTALLS) break;
    }
    const { continentId, left, top, right, bottom } = best!.report;
    result.push({ mapId, continentId, left, top, right, bottom, installs: best!.installs, agreed: best!.installs >= AGREEING_INSTALLS });
  }
  return result.sort((a, b) => a.mapId - b.mapId);
}

export function mapBoundsFromRecords(records: unknown[]): MapBoundsRow[] {
  const rows: MapBoundsRow[] = [];
  for (const raw of records) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (row.kind !== "map_bounds" || typeof row.installId !== "string" || typeof row.capturedAt !== "string") continue;
    const numbers = [row.mapId, row.continentId, row.left, row.top, row.right, row.bottom];
    if (!numbers.every((n) => typeof n === "number" && Number.isFinite(n))) continue;
    rows.push({
      installId: row.installId, capturedAt: row.capturedAt, mapId: row.mapId as number, continentId: row.continentId as number,
      left: row.left as number, top: row.top as number, right: row.right as number, bottom: row.bottom as number,
    });
  }
  return rows;
}
