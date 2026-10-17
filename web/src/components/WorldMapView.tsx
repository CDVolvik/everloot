"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_LAYERS, ZOOM_STEP, cameraBox, cameraForKey, fitCamera, homeCamera, mapHref, panBy, pinchFactor, visibleItems, zoomAt,
  type Box, type Camera, type LayerId, type LayerState, type MapItems,
} from "@/lib/map-view";

export interface MapMarker { x: number; y: number; label: string }

const LAYER_LABELS: Record<LayerId, string> = {
  zones: "Zones",
  entrances: "Dungeon and raid entrances",
  npcs: "NPCs players saw",
  vendors: "Vendors players saw",
};
const DRAG_START_PX = 4;
const LIST_LIMIT = 100;
const HELD_LABEL = "found in game files, unconfirmed";

/** Pan and zoom map of one continent: mouse (drag, wheel), touch (drag, pinch), keyboard and buttons. */
export default function WorldMapView(props: {
  name: string;
  base: Box;
  items: MapItems;
  initial: Camera;
  marker: MapMarker | null;
  /** Whether held-back zones (and their pins, already in `items`) may show. */
  spoilers: boolean;
}) {
  const { base, items, marker, spoilers } = props;
  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS);
  const [camera, setCamera] = useState<Camera>(() => fitCamera(base, props.initial));
  const [widthPx, setWidthPx] = useState(1000);
  const surface = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);
  const pinch = useRef<number | null>(null);

  const view = cameraBox(base, camera);
  const shown = visibleItems(items, layers, spoilers);
  // Yards per screen pixel: marks keep one size on screen at every zoom.
  const px = view.width / widthPx;

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const measure = () => setWidthPx(el.getBoundingClientRect().width || 1000);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const toMap = useCallback((clientX: number, clientY: number) => {
    const rect = svg.current!.getBoundingClientRect();
    const v = cameraBox(base, cameraRef.current);
    return { x: v.x + ((clientX - rect.left) / rect.width) * v.width, y: v.y + ((clientY - rect.top) / rect.height) * v.height, perPx: v.width / rect.width };
  }, [base]);

  // A native listener: React's wheel handler is passive and could not stop the page from scrolling.
  useEffect(() => {
    const el = surface.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const at = toMap(event.clientX, event.clientY);
      setCamera((c) => zoomAt(base, c, Math.exp(-event.deltaY * 0.0015), at.x, at.y));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [base, toMap]);

  const onPointerDown = (event: React.PointerEvent) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) drag.current = { startX: event.clientX, startY: event.clientY, moved: false };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
      drag.current = null;
    }
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const last = pointers.current.get(event.pointerId);
    if (!last) return;
    const now = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, now);
    if (pointers.current.size === 2 && pinch.current !== null) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const at = toMap((a.x + b.x) / 2, (a.y + b.y) / 2);
      const factor = pinchFactor(pinch.current, distance);
      pinch.current = distance;
      setCamera((c) => zoomAt(base, c, factor, at.x, at.y));
      return;
    }
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(now.x - d.startX, now.y - d.startY) < DRAG_START_PX) return;
    if (!d.moved) { d.moved = true; try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ } }
    const perPx = toMap(0, 0).perPx;
    setCamera((c) => panBy(base, c, -(now.x - last.x) * perPx, -(now.y - last.y) * perPx));
  };
  const onPointerEnd = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    const next = cameraForKey(base, cameraRef.current, event.key);
    if (next) { event.preventDefault(); setCamera(next); }
  };

  const center = (factor: number) => setCamera((c) => zoomAt(base, c, factor, c.cx, c.cy));
  const dot = px * 6;
  const font = px * 11;
  const line = px * 1.2;
  const entranceCount = shown.entrances.length;

  return (
    <div className="space-y-3">
      <fieldset className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-fg-2">
        <legend className="sr-only">Layers</legend>
        {(Object.keys(LAYER_LABELS) as LayerId[]).map((id) => (
          <label key={id} className="inline-flex items-center gap-2 min-h-11 cursor-pointer">
            <input type="checkbox" checked={layers[id]} onChange={() => setLayers((l) => ({ ...l, [id]: !l[id] }))} className="h-4 w-4 accent-accent" />
            {LAYER_LABELS[id]}
          </label>
        ))}
      </fieldset>

      <div
        ref={surface}
        tabIndex={0}
        role="group"
        aria-label={`${props.name} map. Arrow keys pan, plus and minus zoom, 0 resets.`}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        className="relative rounded-xl border border-line bg-panel overflow-hidden touch-none select-none cursor-grab active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <svg
          ref={svg}
          viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
          style={{ aspectRatio: `${base.width} / ${base.height}` }}
          className="block w-full"
          aria-label={`${props.name}: ${shown.zones.length} zone outlines, ${entranceCount} entrances, ${shown.pins.length} player-observed points. The same items are listed below.`}
          role="img"
        >
          {shown.zones.map((z) => (
            <g key={z.mapId}>
              <rect
                x={z.x} y={z.y} width={z.width} height={z.height} strokeWidth={line}
                strokeDasharray={z.heldBack ? `${px * 5} ${px * 3}` : undefined}
                className={z.heldBack ? "fill-canvas stroke-warning" : "fill-canvas stroke-edge"}
              />
              {(z.width / view.width) * widthPx >= (z.name.length + (z.heldBack ? 2 : 0)) * 6.5 && (
                <text x={z.x + z.width / 2} y={z.y + z.height / 2} textAnchor="middle" fontSize={font} className={z.heldBack ? "fill-warning" : "fill-muted"}>
                  {z.name}{z.heldBack ? " *" : ""}
                </text>
              )}
            </g>
          ))}
          {shown.entrances.map((p) => (
            <g key={p.id}>
              {p.raid
                ? <rect x={p.x - dot} y={p.y - dot} width={dot * 2} height={dot * 2} strokeWidth={line} className="fill-warning stroke-canvas" />
                : <circle cx={p.x} cy={p.y} r={dot} strokeWidth={line} className="fill-accent stroke-canvas" />}
              {(camera.zoom >= 2 || widthPx >= 640) && (
                <text x={p.x + dot * 1.6} y={p.y + font * 0.35} fontSize={font} className="fill-fg stroke-canvas" strokeWidth={line * 2} paintOrder="stroke">{p.names[0]}</text>
              )}
            </g>
          ))}
          {shown.pins.map((p) => (
            <a key={p.id} href={`/database/npcs/${p.npcId}`} aria-label={`${p.name ?? `NPC ${p.npcId}`}, ${p.zoneName} ${p.zoneX}, ${p.zoneY}`}>
              {p.kind === "vendor"
                ? <path d={`M${p.x} ${p.y - dot * 1.3}L${p.x + dot * 1.3} ${p.y}L${p.x} ${p.y + dot * 1.3}L${p.x - dot * 1.3} ${p.y}Z`} strokeWidth={line} className="fill-fg stroke-canvas" />
                : <circle cx={p.x} cy={p.y} r={dot * 0.7} strokeWidth={line} className="fill-fg-2 stroke-canvas" />}
              {camera.zoom >= 6 && (
                <text x={p.x + dot * 1.6} y={p.y + font * 0.35} fontSize={font} className="fill-fg stroke-canvas" strokeWidth={line * 2} paintOrder="stroke">{p.name ?? `NPC ${p.npcId}`}</text>
              )}
            </a>
          ))}
          {marker && (
            <g aria-label={marker.label}>
              <circle cx={marker.x} cy={marker.y} r={dot * 2} fill="none" strokeWidth={line * 2} className="stroke-accent" />
              <circle cx={marker.x} cy={marker.y} r={dot * 0.5} className="fill-accent" />
              <text x={marker.x + dot * 2.6} y={marker.y + font * 0.35} fontSize={font} className="fill-fg stroke-canvas" strokeWidth={line * 2} paintOrder="stroke">{marker.label}</text>
            </g>
          )}
        </svg>

        <div className="absolute right-2 top-2 flex flex-col gap-1">
          <button type="button" aria-label="Zoom in" onClick={() => center(ZOOM_STEP)} className="btn min-h-11 min-w-11 text-lg leading-none">+</button>
          <button type="button" aria-label="Zoom out" onClick={() => center(1 / ZOOM_STEP)} className="btn min-h-11 min-w-11 text-lg leading-none">&minus;</button>
          <button type="button" aria-label="Reset view" onClick={() => setCamera(homeCamera(base))} className="btn min-h-11 min-w-11 text-xs">Reset</button>
        </div>
      </div>
      <p className="text-xs text-muted" aria-live="polite">Zoom {camera.zoom.toFixed(1)}x. Drag or use arrow keys to pan; scroll, pinch, + and - to zoom.</p>

      <ul aria-label="Legend" className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-fg-2">
        <li className="flex items-center gap-2"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" className="fill-accent" /></svg>Dungeon (circle)</li>
        <li className="flex items-center gap-2"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="1.5" y="1.5" width="11" height="11" className="fill-warning" /></svg>Raid (square)</li>
        <li className="flex items-center gap-2"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="4" className="fill-fg-2" /></svg>NPC players saw</li>
        <li className="flex items-center gap-2"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1L13 7L7 13L1 7Z" className="fill-fg" /></svg>Vendor players saw</li>
        <li className="flex items-center gap-2"><svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true"><rect x="1" y="1" width="16" height="12" strokeWidth="1.5" className="fill-canvas stroke-edge" /></svg>Zone outline</li>
        {spoilers && <li className="flex items-center gap-2"><svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true"><rect x="1" y="1" width="16" height="12" strokeWidth="1.5" strokeDasharray="3 2" className="fill-canvas stroke-warning" /></svg>* Held-back zone: {HELD_LABEL}</li>}
      </ul>

      <section aria-labelledby="entrances" className="space-y-3 pt-4">
        <h2 id="entrances" className="text-xl font-semibold text-fg">Dungeon and raid entrances</h2>
        {shown.entrances.length ? (
          <ul className="space-y-2 text-sm text-fg-2">
            {shown.entrances.map((p) => (
              <li key={p.id}>
                <span className="text-fg">{p.names.join(", ")}</span>
                {" · "}{p.raid ? "raid" : "dungeon"}
                {" · "}<span className="font-mono text-xs text-muted">{Math.round(p.worldX)}, {Math.round(p.worldY)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">{layers.entrances ? "None placed on this continent." : "This layer is off."}</p>}
      </section>

      {(layers.npcs || layers.vendors) && (
        <section aria-labelledby="observed" className="space-y-3 pt-4">
          <h2 id="observed" className="text-xl font-semibold text-fg">Seen by players</h2>
          <p className="text-sm text-fg-2">A point shows once 3 installs agree on where the NPC stands. Distinct install ids do not prove independent players.</p>
          {shown.pins.length ? (
            <ul className="space-y-2 text-sm text-fg-2">
              {shown.pins.slice(0, LIST_LIMIT).map((p) => (
                <li key={p.id}>
                  <Link href={`/database/npcs/${p.npcId}`} className="text-accent hover:underline underline-offset-4">{p.name ?? `NPC ${p.npcId}`}</Link>
                  {" · "}{p.kind}{" · "}{p.zoneName}{" "}
                  <Link href={mapHref({ mapId: p.mapId, x: p.zoneX, y: p.zoneY })} className="font-mono text-xs text-muted hover:underline underline-offset-4">{p.zoneX}, {p.zoneY}</Link>
                  {" · "}{p.reporters} reporters
                  {p.heldBack && <> {"·"} {HELD_LABEL}</>}
                </li>
              ))}
              {shown.pins.length > LIST_LIMIT && <li className="text-muted">and {shown.pins.length - LIST_LIMIT} more on the map.</li>}
            </ul>
          ) : <p className="text-sm text-muted">No NPC or vendor position has 3 agreeing installs yet on this continent.</p>}
        </section>
      )}
    </div>
  );
}
