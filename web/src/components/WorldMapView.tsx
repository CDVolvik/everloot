"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_LAYERS, ZOOM_STEP, cameraBox, cameraForBox, cameraForKey, cameraOn, ensureZoneVisible, fitCamera, frameBox, homeCamera,
  labelFontPx, mapHref, panBy, pinchFactor, placeLabels, visibleItems, zoomAt,
  type Box, type Camera, type LabelCandidate, type LayerId, type LayerState, type MapItems,
} from "@/lib/map-view";

export interface MapMarker { x: number; y: number; label: string }
/** Where to open: a point and about how many yards across to show. Null opens on the whole continent. */
export interface MapFocus { x: number; y: number; span: number }

const LAYER_LABELS: Record<LayerId, string> = {
  zones: "Zones",
  entrances: "Entrances",
  npcs: "NPCs players saw",
  vendors: "Vendors players saw",
};
const DRAG_START_PX = 4;
const LIST_LIMIT = 100;
const HELD_LABEL = "found in game files, unconfirmed";
/** Until the frame is measured, a plausible size, so the first paint is already close. */
const FIRST_SIZE = { w: 1000, h: 640 };

function Swatch({ layer }: { layer: LayerId }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
      {layer === "zones" && <rect x="1.5" y="1.5" width="11" height="11" strokeWidth="1.2" className="fill-fg/10 stroke-edge" />}
      {layer === "entrances" && <circle cx="7" cy="7" r="5" className="fill-accent" />}
      {layer === "npcs" && <circle cx="7" cy="7" r="3.5" className="fill-fg-2" />}
      {layer === "vendors" && <path d="M7 1.5L12.5 7L7 12.5L1.5 7Z" className="fill-fg" />}
    </svg>
  );
}

/** Pan and zoom map of one continent: mouse (drag, wheel), touch (drag, pinch), keyboard and buttons. */
export default function WorldMapView(props: {
  name: string;
  base: Box;
  items: MapItems;
  focus: MapFocus | null;
  marker: MapMarker | null;
  /** Whether held-back zones (and their pins, already in `items`) may show. */
  spoilers: boolean;
}) {
  const { base, items, marker, spoilers } = props;
  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS);
  const [size, setSize] = useState({ w: FIRST_SIZE.w, h: FIRST_SIZE.h });
  const frame = useMemo(() => frameBox(base, size.w / size.h), [base, size.w, size.h]);
  const [camera, setCamera] = useState<Camera>(() => props.focus ? cameraOn(frameBox(base, FIRST_SIZE.w / FIRST_SIZE.h), props.focus.x, props.focus.y, props.focus.span) : homeCamera(frameBox(base, FIRST_SIZE.w / FIRST_SIZE.h)));
  const surface = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);
  const pinch = useRef<number | null>(null);
  const measured = useRef(false);

  const shown = visibleItems(items, layers, spoilers);
  // The zones the view may not leave: every zone the reader is allowed to see, whatever the layer switch says.
  const keep = useMemo(() => items.zones.filter((z) => spoilers || !z.heldBack), [items.zones, spoilers]);
  const set = useCallback((next: Camera | ((c: Camera) => Camera)) => {
    setCamera((c) => ensureZoneVisible(frameRef.current, typeof next === "function" ? next(c) : next, keep));
  }, [keep]);

  const view = cameraBox(frame, camera);
  // Yards per screen pixel: marks keep one size on screen at every zoom.
  const px = view.width / size.w;

  useEffect(() => {
    const el = surface.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      setSize({ w: r.width, h: r.height });
      if (!measured.current) {
        measured.current = true;
        // The first real measure: open on the focus (or the whole continent) in the frame's true shape.
        const f = frameBox(base, r.width / r.height);
        setCamera(props.focus ? cameraOn(f, props.focus.x, props.focus.y, props.focus.span) : homeCamera(f));
      } else {
        setCamera((c) => fitCamera(frameBox(base, r.width / r.height), c));
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
    // The focus is read once, on the first measure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  const toMap = useCallback((clientX: number, clientY: number) => {
    const rect = svg.current!.getBoundingClientRect();
    const v = cameraBox(frameRef.current, cameraRef.current);
    return { x: v.x + ((clientX - rect.left) / rect.width) * v.width, y: v.y + ((clientY - rect.top) / rect.height) * v.height, perPx: v.width / rect.width };
  }, []);

  // A native listener: React's wheel handler is passive and could not stop the page from scrolling.
  useEffect(() => {
    const el = surface.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const at = toMap(event.clientX, event.clientY);
      set((c) => zoomAt(frameRef.current, c, Math.exp(-event.deltaY * 0.0015), at.x, at.y));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [set, toMap]);

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
      set((c) => zoomAt(frameRef.current, c, factor, at.x, at.y));
      return;
    }
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(now.x - d.startX, now.y - d.startY) < DRAG_START_PX) return;
    if (!d.moved) { d.moved = true; try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ } }
    const perPx = toMap(0, 0).perPx;
    set((c) => panBy(frameRef.current, c, -(now.x - last.x) * perPx, -(now.y - last.y) * perPx));
  };
  const onPointerEnd = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    const next = cameraForKey(frameRef.current, cameraRef.current, event.key);
    if (next) { event.preventDefault(); set(next); }
  };

  const center = (factor: number) => set((c) => zoomAt(frameRef.current, c, factor, c.cx, c.cy));
  const jump = (mapId: number) => {
    const z = items.zones.find((s) => s.mapId === mapId);
    if (z) set(cameraForBox(frameRef.current, z));
  };

  const dot = px * 6;
  const fontPx = labelFontPx(camera.zoom);
  const font = px * fontPx;
  const halo = px * 3;
  // Smaller zones are drawn last, so an inner zone (a city in its zone) sits on top of the one around it.
  const zonesByArea = [...shown.zones].sort((a, b) => b.width * b.height - a.width * a.height);
  const biggest = zonesByArea[0] ? zonesByArea[0].width * zonesByArea[0].height : 1;

  // Every label is a candidate for one top layer; the ones that collide give way to higher priority.
  const labels = useMemo(() => {
    const out: LabelCandidate[] = [];
    for (const z of shown.zones) {
      const x0 = Math.max(z.x, view.x), x1 = Math.min(z.x + z.width, view.x + view.width);
      const y0 = Math.max(z.y, view.y), y1 = Math.min(z.y + z.height, view.y + view.height);
      if (x1 <= x0 || y1 <= y0) continue;
      out.push({ id: `z${z.mapId}`, text: z.heldBack ? `${z.name} *` : z.name, x: (x0 + x1) / 2, y: (y0 + y1) / 2, align: "middle", priority: 10 + 20 * (1 - (z.width * z.height) / biggest) });
    }
    for (const p of shown.entrances) out.push({ id: `e${p.id}`, text: p.names[0]!, x: p.x + dot * 1.6, y: p.y, align: "start", priority: 60 });
    if (camera.zoom >= 6) for (const p of shown.pins) out.push({ id: `p${p.id}`, text: p.name ?? `NPC ${p.npcId}`, x: p.x + dot * 1.6, y: p.y, align: "start", priority: 70 });
    if (marker) out.push({ id: "marker", text: marker.label, x: marker.x + dot * 2.6, y: marker.y, align: "start", priority: 100 });
    return placeLabels(out, view, size.w, fontPx);
  }, [shown.zones, shown.entrances, shown.pins, view, size.w, fontPx, camera.zoom, marker, dot, biggest]);

  const zoneOptions = [...items.zones].filter((z) => spoilers || !z.heldBack).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-3">
      {/* The toolbar sits above the frame, so nothing on the map is ever covered by a control. */}
      <div className="rounded-xl border border-line bg-panel/80 p-3 space-y-3">
        <fieldset className="flex flex-wrap gap-x-5 gap-y-0 text-sm text-fg-2">
          <legend className="sr-only">Layers</legend>
          {(Object.keys(LAYER_LABELS) as LayerId[]).map((id) => (
            <label key={id} className="inline-flex items-center gap-2 min-h-11 cursor-pointer">
              <input type="checkbox" checked={layers[id]} onChange={() => setLayers((l) => ({ ...l, [id]: !l[id] }))} className="h-4 w-4 accent-accent" />
              <Swatch layer={id} />
              {LAYER_LABELS[id]}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-fg-2 min-w-0 flex-1 basis-48">
            <span className="shrink-0">Jump to</span>
            <select
              aria-label="Jump to a zone"
              value=""
              onChange={(e) => e.target.value && jump(Number(e.target.value))}
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-canvas px-2 text-sm text-fg"
            >
              <option value="">Choose a zone</option>
              {zoneOptions.map((z) => <option key={z.mapId} value={z.mapId}>{z.name}{z.heldBack ? " (unconfirmed)" : ""}</option>)}
            </select>
          </label>
          <div className="flex gap-1" role="group" aria-label="Zoom">
            <button type="button" aria-label="Zoom in" onClick={() => center(ZOOM_STEP)} className="btn min-h-11 min-w-11 text-lg leading-none">+</button>
            <button type="button" aria-label="Zoom out" onClick={() => center(1 / ZOOM_STEP)} className="btn min-h-11 min-w-11 text-lg leading-none">&minus;</button>
            <button type="button" aria-label="Reset view" onClick={() => set(homeCamera(frameRef.current))} className="btn min-h-11 px-3 text-xs">Reset</button>
          </div>
        </div>
        <ul aria-label="Legend" className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-fg-2">
          <li className="flex items-center gap-2"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" className="fill-accent" /></svg>Dungeon (circle)</li>
          <li className="flex items-center gap-2"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="1.5" y="1.5" width="11" height="11" className="fill-warning" /></svg>Raid (square)</li>
          <li className="flex items-center gap-2"><svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true"><rect x="1" y="1" width="16" height="12" strokeWidth="1.2" className="fill-fg/10 stroke-edge" /></svg>Zone outline (overlaps are real)</li>
          {spoilers && <li className="flex items-center gap-2"><svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true"><rect x="1" y="1" width="16" height="12" strokeWidth="1.2" strokeDasharray="3 2" className="fill-warning/10 stroke-warning" /></svg>* Held-back zone: {HELD_LABEL}</li>}
        </ul>
      </div>

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
        className="relative h-[clamp(340px,calc(100dvh-5rem),880px)] rounded-xl border border-line bg-panel overflow-hidden touch-none select-none cursor-grab active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <svg
          ref={svg}
          viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
          className="absolute inset-0 h-full w-full"
          role="group"
          aria-label={`${props.name}: ${shown.zones.length} zone outlines, ${shown.entrances.length} entrances, ${shown.pins.length} player-observed points. The same items are listed below.`}
        >
          {zonesByArea.map((z) => (
            <rect
              key={z.mapId}
              x={z.x} y={z.y} width={z.width} height={z.height}
              strokeWidth={1} vectorEffect="non-scaling-stroke"
              strokeDasharray={z.heldBack ? "5 3" : undefined}
              tabIndex={0}
              aria-label={`${z.name}${z.heldBack ? `, ${HELD_LABEL}` : ""}`}
              className={`${z.heldBack ? "fill-warning/10 stroke-warning hover:fill-warning/25" : "fill-fg/5 stroke-edge hover:fill-accent/20 hover:stroke-accent focus:fill-accent/20 focus:stroke-accent"} focus:outline-none`}
            />
          ))}
          {shown.entrances.map((p) => (
            <g key={p.id} pointerEvents="none">
              {p.raid
                ? <rect x={p.x - dot} y={p.y - dot} width={dot * 2} height={dot * 2} strokeWidth={1.5} vectorEffect="non-scaling-stroke" className="fill-warning stroke-canvas" />
                : <circle cx={p.x} cy={p.y} r={dot} strokeWidth={1.5} vectorEffect="non-scaling-stroke" className="fill-accent stroke-canvas" />}
            </g>
          ))}
          {shown.pins.map((p) => (
            <a key={p.id} href={`/database/npcs/${p.npcId}`} aria-label={`${p.name ?? `NPC ${p.npcId}`}, ${p.zoneName} ${p.zoneX}, ${p.zoneY}`}>
              {p.kind === "vendor"
                ? <path d={`M${p.x} ${p.y - dot * 1.3}L${p.x + dot * 1.3} ${p.y}L${p.x} ${p.y + dot * 1.3}L${p.x - dot * 1.3} ${p.y}Z`} strokeWidth={1.5} vectorEffect="non-scaling-stroke" className="fill-fg stroke-canvas" />
                : <circle cx={p.x} cy={p.y} r={dot * 0.7} strokeWidth={1.5} vectorEffect="non-scaling-stroke" className="fill-fg-2 stroke-canvas" />}
            </a>
          ))}
          {marker && (
            <g pointerEvents="none" aria-label={marker.label}>
              <circle cx={marker.x} cy={marker.y} r={dot * 2} fill="none" strokeWidth={2.5} vectorEffect="non-scaling-stroke" className="stroke-accent" />
              <circle cx={marker.x} cy={marker.y} r={dot * 0.5} className="fill-accent" />
            </g>
          )}
          {/* One top layer for every label, so no shape ever covers a name. */}
          <g pointerEvents="none" aria-hidden="true" fontSize={font}>
            {labels.map((l) => (
              <text
                key={l.id} x={l.x} y={l.y} dominantBaseline="central" textAnchor={l.align === "middle" ? "middle" : "start"}
                strokeWidth={halo} strokeLinejoin="round" paintOrder="stroke"
                className={`stroke-canvas ${l.id.startsWith("z") ? (l.text.endsWith("*") ? "fill-warning" : "fill-fg-2") : "fill-fg"}`}
              >
                {l.text}
              </text>
            ))}
          </g>
        </svg>
      </div>
      <p className="text-xs text-muted" aria-live="polite">Zoom {camera.zoom.toFixed(1)}x. Drag or use arrow keys to pan; scroll, pinch, + and - to zoom.</p>

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
