"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Card, EmptyState, SectionHeading } from "@/components/ui";
import {
  DEFAULT_LAYERS, mapHref, searchMap, viewSearch, visibleItems, wayCommand, zoneHref, zoneSpot,
  type Box, type LayerId, type LayerState, type MapArtLayer, type MapItems, type SearchHit,
} from "@/lib/map-view";
import type { FitRequest, MapMarker, MapViewChange } from "./map/LeafletMap";

export type { MapMarker };

// Leaflet is loaded here and nowhere else: the rest of the site never downloads it, and the lists below the
// map are rendered on the server, so the page reads without it.
const LeafletMap = dynamic(() => import("./map/LeafletMap"), {
  ssr: false,
  loading: () => <p className="grid h-full place-items-center px-4 text-center text-sm text-muted">Loading the map. The same places are listed below it.</p>,
});

const LAYER_LABELS: Record<LayerId, string> = {
  zones: "Zones",
  entrances: "Entrances",
  flightMasters: "Flight masters",
  flightPaths: "Flight paths",
  npcs: "NPCs players saw",
  vendors: "Vendors players saw",
};
const LIST_LIMIT = 100;
/** How many yards across the view is when a place is shown, a spot in a zone. */
const SPOT_SPAN = 1200;
const HELD_LABEL = "found in game files, unconfirmed";

const spotBox = (x: number, y: number): Box => ({ x: x - SPOT_SPAN / 2, y: y - SPOT_SPAN / 2, width: SPOT_SPAN, height: SPOT_SPAN });

function Swatch({ layer }: { layer: LayerId }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
      {layer === "zones" && <rect x="1.5" y="1.5" width="11" height="11" strokeWidth="1.2" className="fill-fg/10 stroke-edge" />}
      {layer === "entrances" && <circle cx="7" cy="7" r="5" className="fill-accent" />}
      {layer === "flightMasters" && <path d="M7 1.5L12.5 12L1.5 12Z" className="fill-fg" />}
      {layer === "flightPaths" && <path d="M1 11L13 3" strokeWidth="1.5" strokeDasharray="3 2" className="stroke-fg-2" />}
      {layer === "npcs" && <circle cx="7" cy="7" r="3.5" className="fill-fg-2" />}
      {layer === "vendors" && <path d="M7 1.5L12.5 7L7 12.5L1.5 7Z" className="fill-fg" />}
    </svg>
  );
}

/** What a pin on the map is, for its card and its list row. */
interface Subject {
  id: string;
  kind: "entrance" | "flight" | "npc" | "vendor";
  title: string;
  detail: string;
  x: number;
  y: number;
  /** The database page, for a player-observed NPC. */
  href?: string;
  reporters?: number;
}

export interface WorldMapViewProps {
  name: string;
  continentId: number;
  continents: { id: number; name: string }[];
  /** The continent's box in yards. */
  base: Box;
  /** Everything the reader may see on this continent: held-back zones and their pins are in only with spoilers on. */
  items: MapItems;
  spoilers: boolean;
  /** The game's own map pictures, already filtered for spoilers; null without the asset URL. */
  art?: MapArtLayer | null;
  /** Small loading screens by dungeon or raid name, already filtered for spoilers; absent without the asset URL. */
  thumbs?: Record<string, string>;
  /** A spot from a deep link: a ring, and the view opens on it. */
  marker: (MapMarker & { mapId: number }) | null;
  /** The zone a link asked for, to open fitted to the view. */
  zoneId: number | null;
  /** The view the address carries: the centre in yards, the zoom, the selected item. */
  view: { at: [number, number] | null; zoom: number | null; pin: string | null };
}

/** The world map: a Leaflet map with a search box, layers, a card for the selected pin and the same places as lists. */
export default function WorldMapView(props: WorldMapViewProps) {
  const { base, items, marker, spoilers, art } = props;
  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS);
  const [showArt, setShowArt] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(props.view.pin);
  const [focusZone, setFocusZone] = useState<number | null>(props.marker?.mapId ?? props.zoneId);
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [copied, setCopied] = useState("");
  const [request, setRequest] = useState<FitRequest | null>(null);
  const requestId = useRef(0);
  const camera = useRef<MapViewChange | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  const shown = useMemo(() => visibleItems(items, layers, spoilers), [items, layers, spoilers]);
  // Zones the reader may see, whatever the zone layer says: coordinates and a click on a zone use them.
  const zones = useMemo(() => items.zones.filter((z) => spoilers || !z.heldBack), [items.zones, spoilers]);

  const subjects = useMemo(() => {
    const out = new Map<string, Subject>();
    for (const e of shown.entrances) out.set(`e${e.id}`, { id: `e${e.id}`, kind: "entrance", title: e.names.join(", "), detail: e.raid ? "Raid entrance" : "Dungeon entrance", x: e.x, y: e.y });
    for (const f of shown.flightMasters) out.set(f.id, { id: f.id, kind: "flight", title: f.name, detail: "Flight master", x: f.x, y: f.y });
    for (const p of shown.pins) {
      out.set(p.id, {
        id: p.id, kind: p.kind, title: p.name ?? `NPC ${p.npcId}`, detail: p.kind === "vendor" ? "Vendor players saw" : "NPC players saw",
        x: p.x, y: p.y, href: `/database/npcs/${p.npcId}`, reporters: p.reporters,
      });
    }
    return out;
  }, [shown]);
  const selected = selectedId ? subjects.get(selectedId) ?? null : null;
  const selectedSpot = selected ? zoneSpot(zones, selected.x, selected.y) : null;
  const here = spot ? zoneSpot(zones, spot.x, spot.y) : null;
  const hovered = hover ? zoneSpot(zones, hover.x, hover.y) : null;

  const fit = useCallback((b: Box) => setRequest({ id: ++requestId.current, box: b }), []);
  const goZone = useCallback((mapId: number) => {
    const z = items.zones.find((s) => s.mapId === mapId);
    if (!z) return;
    setFocusZone(mapId);
    setSelectedId(null);
    setSpot(null);
    fit(z);
  }, [items.zones, fit]);
  const goSubject = useCallback((s: Subject) => {
    setSelectedId(s.id);
    setSpot(null);
    setFocusZone(zoneSpot(zones, s.x, s.y)?.zone.mapId ?? null);
    fit(spotBox(s.x, s.y));
  }, [zones, fit]);
  const goHit = (hit: SearchHit) => {
    setQuery("");
    if (hit.kind === "zone") goZone(Number(hit.id.slice(1)));
    else {
      const s = subjects.get(hit.id);
      if (s) goSubject(s);
    }
  };
  const goHome = () => {
    setFocusZone(null);
    setSelectedId(null);
    setSpot(null);
    fit(base);
  };

  // The address keeps the continent, zone, spot and spoiler switch it was opened with, and adds where the reader is.
  const sync = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const c = camera.current;
      if (!c) return;
      const search = viewSearch(new URLSearchParams(window.location.search), { x: c.x, y: c.y, zoom: c.zoom, pin: selectedRef.current });
      window.history.replaceState(window.history.state, "", `${window.location.pathname}?${search}`);
    }, 250);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { sync(); }, [selectedId, sync]);
  const onView = useCallback((v: MapViewChange) => { camera.current = v; sync(); }, [sync]);

  const initial = useMemo(() => {
    const { at, zoom } = props.view;
    if (at && zoom !== null) return { x: at[0], y: at[1], zoom };
    const z = props.zoneId !== null ? items.zones.find((s) => s.mapId === props.zoneId) : undefined;
    if (marker) return { fit: spotBox(marker.x, marker.y) };
    // A link to a pin without a view opens on the pin.
    const pin = props.view.pin;
    const pinned = pin ? [
      ...items.entrances.map((e) => ({ id: `e${e.id}`, x: e.x, y: e.y })), ...items.flightMasters, ...items.pins,
    ].find((p) => p.id === pin) : undefined;
    if (pinned) return { fit: spotBox(pinned.x, pinned.y) };
    return { fit: z ?? base };
    // Read once, when the map opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Zones are found whether or not their layer is on; everything else only while its layer shows.
  const hits = useMemo(() => searchMap({ ...shown, zones }, query), [shown, zones, query]);

  const target = selected
    ? { name: selected.title, at: selectedSpot }
    : spot ? { name: here?.zone.name ?? "", at: here } : null;
  const command = target?.at ? wayCommand(target.at.x, target.at.y, target.name) : null;
  const copy = async () => {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(`Copied: ${command}`);
    } catch {
      setCopied("Could not copy. Select the line and copy it.");
    }
  };
  useEffect(() => { setCopied(""); }, [command]);

  const otherContinents = props.continents.filter((c) => c.id !== props.continentId);
  const focus = focusZone !== null ? items.zones.find((z) => z.mapId === focusZone) : undefined;
  const spoilerQuery = spoilers ? "&spoilers=1" : "";
  const flightNames = useMemo(() => {
    const seen = new Set<string>();
    return shown.flightMasters.filter((f) => (seen.has(f.name) ? false : (seen.add(f.name), true)));
  }, [shown.flightMasters]);

  return (
    <div className="space-y-3">
      <div className="mx-auto flex w-full max-w-[1800px] flex-wrap items-center gap-x-6 gap-y-2">
        <nav aria-label="Where on the map" className="min-w-0 text-sm text-muted">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <li className="flex items-center gap-2"><span>Azeroth</span><span aria-hidden="true">›</span></li>
            <li className="flex items-center gap-2">
              {focus
                ? <button type="button" onClick={goHome} className="inline-flex min-h-11 items-center hover:text-accent hover:underline underline-offset-4">{props.name}</button>
                : <span aria-current="page" className="text-fg-2">{props.name}</span>}
              {focus && <span aria-hidden="true">›</span>}
            </li>
            {focus && <li aria-current="page" className="text-fg-2">{focus.name}{focus.heldBack ? " *" : ""}</li>}
          </ol>
        </nav>
        <div className="flex items-center gap-2 text-sm" role="group" aria-label="Continent">
          {otherContinents.map((c) => (
            <Link key={c.id} href={`/map?continent=${c.id}${spoilerQuery}`} className="btn min-h-11 px-4 text-sm">{c.name}</Link>
          ))}
        </div>
        <form role="search" onSubmit={(e) => { e.preventDefault(); if (hits[0]) goHit(hits[0]); }} className="relative min-w-0 flex-1 basis-64 sm:max-w-md sm:ml-auto">
          <label htmlFor="map-search" className="sr-only">Search the map for a zone, entrance, flight master or NPC</label>
          <input
            id="map-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" placeholder="Search the map"
            aria-describedby="map-search-count"
            className="w-full rounded-control border border-edge bg-canvas px-3 text-sm text-fg placeholder:text-muted"
          />
          <p id="map-search-count" role="status" className="sr-only">{query.trim() ? `${hits.length} ${hits.length === 1 ? "result" : "results"}` : ""}</p>
          {query.trim() && (
            <ul aria-label="Search results" className="absolute left-0 right-0 top-full z-[1200] mt-1 overflow-hidden rounded-card border border-edge bg-panel text-sm">
              {hits.length === 0 && <li className="px-3 py-3 text-muted">Nothing on this continent by that name.</li>}
              {hits.map((h) => (
                <li key={h.id}>
                  <button type="button" onClick={() => goHit(h)} className="flex min-h-11 w-full items-baseline justify-between gap-3 px-3 py-2 text-left hover:bg-canvas focus-visible:bg-canvas">
                    <span className="min-w-0 text-fg [overflow-wrap:anywhere]">{h.label}</span>
                    <span className="shrink-0 text-xs text-muted">{h.detail}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
      </div>

      <div className="relative mx-auto h-[max(22rem,calc(100dvh-20rem))] sm:h-[max(24rem,calc(100dvh-12.5rem))] w-full max-w-[1800px] overflow-hidden rounded-card border border-line bg-panel">
        <LeafletMap
          name={props.name} base={base} items={shown} zones={zones} art={art ?? null} showArt={showArt}
          selectedId={selectedId} marker={marker} initial={initial} request={request}
          onSelect={(id) => { setSelectedId(id); if (id) setSpot(null); }}
          onZone={goZone}
          onPoint={(x, y) => setSpot({ x, y })}
          onHover={setHover}
          onView={onView}
        />
        {/* The layer switches: a small panel in the corner of the map, closed until asked for. */}
        <details className="absolute right-2 top-2 z-[1100] rounded-card border border-edge bg-panel text-sm text-fg-2">
          <summary className="flex min-h-11 cursor-pointer list-none items-center px-4 font-medium text-fg">Layers</summary>
          <fieldset className="border-t border-line px-4 py-1">
            <legend className="sr-only">Layers</legend>
            {(Object.keys(LAYER_LABELS) as LayerId[]).map((id) => (
              <label key={id} className="flex min-h-11 cursor-pointer items-center gap-2">
                <input type="checkbox" checked={layers[id]} onChange={() => setLayers((l) => ({ ...l, [id]: !l[id] }))} className="h-4 w-4 accent-accent" />
                <Swatch layer={id} />
                {LAYER_LABELS[id]}
              </label>
            ))}
            {art && (
              <label className="flex min-h-11 cursor-pointer items-center gap-2">
                <input type="checkbox" checked={showArt} onChange={() => setShowArt((x) => !x)} className="h-4 w-4 accent-accent" />
                Game map art
              </label>
            )}
          </fieldset>
        </details>
        {/* Where the pointer is, on the game's 0 to 100 scale. A phone has no pointer: it reads the card instead. */}
        <p data-coordinates className="pointer-events-none absolute bottom-2 right-2 z-[1100] hidden rounded-control border border-line bg-panel/90 px-3 py-1 font-mono text-xs text-fg-2 sm:block">
          {hovered ? `${hovered.zone.name} ${hovered.x}, ${hovered.y}` : "Move over the map for coordinates"}
        </p>
        {/* The card for what was tapped: along the bottom on a phone, a corner of the map on a desk. */}
        {(selected || (spot && here)) && (
          <div className="absolute inset-x-2 bottom-2 z-[1100] sm:right-auto sm:max-w-sm">
            <Card padding="none" className="space-y-2 bg-panel p-4" unconfirmed={selected?.kind === "entrance" || selected?.kind === "flight"}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-fg [overflow-wrap:anywhere]">{selected ? selected.title : here?.zone.name}</p>
                  <p className="text-sm text-fg-2">{selected ? selected.detail : "A spot you picked"}</p>
                </div>
                <button type="button" aria-label="Close" onClick={() => { setSelectedId(null); setSpot(null); }} className="btn -mr-2 -mt-2 min-h-11 min-w-11 border-transparent px-0 text-lg leading-none">&times;</button>
              </div>
              <p className="font-mono text-sm text-fg-2">
                {(selected ? selectedSpot : here) ? `${(selected ? selectedSpot : here)!.zone.name} ${(selected ? selectedSpot : here)!.x}, ${(selected ? selectedSpot : here)!.y}` : "Outside every zone"}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {selected && (selected.kind === "entrance" || selected.kind === "flight") && <Badge tone="files" />}
                {selected?.reporters ? <Badge tone="confirmed">Seen by {selected.reporters} installs</Badge> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {command && <button type="button" onClick={copy} className="btn min-h-11 px-4 text-sm">Copy /way</button>}
                {selected?.href && <Link href={selected.href} className="btn min-h-11 px-4 text-sm">Open page</Link>}
              </div>
              {command && <p className="font-mono text-xs text-muted" data-way>{command}</p>}
              <p role="status" className="text-xs text-fg-2">{copied}</p>
            </Card>
          </div>
        )}
      </div>

      <noscript><p className="text-sm text-muted">The map needs JavaScript. The places on it are listed below.</p></noscript>

      <div className="mx-auto w-full max-w-wide space-y-10 pt-6">
        <section aria-labelledby="zones">
          <SectionHeading id="zones">Zones</SectionHeading>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {zones.map((z) => (
              <li key={z.mapId}>
                <Link
                  href={zoneHref(z.mapId, spoilers)} onClick={(e) => { e.preventDefault(); goZone(z.mapId); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  className="inline-flex min-h-11 items-center text-accent hover:underline underline-offset-4"
                >
                  {z.name}{z.heldBack ? ` * (${HELD_LABEL})` : ""}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="entrances">
          <SectionHeading id="entrances">Dungeon and raid entrances</SectionHeading>
          {shown.entrances.length ? (
            <ul className="space-y-2 text-sm text-fg-2">
              {shown.entrances.map((p) => {
                const thumb = p.names.map((n) => props.thumbs?.[n]).find(Boolean);
                return (
                  <li key={p.id} className="flex items-center gap-3">
                    {thumb && (
                      // The dungeon's or raid's loading screen, small; decorative, the name is beside it.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" aria-hidden="true" width={96} height={54} loading="lazy" decoding="async" data-entrance-art className="h-[54px] w-24 shrink-0 rounded-control border border-line object-cover" />
                    )}
                    <span className="min-w-0">
                      <span className="text-fg">{p.names.join(", ")}</span>
                      {" · "}{p.raid ? "raid" : "dungeon"}
                      {" · "}<span className="font-mono text-xs text-muted">{Math.round(p.worldX)}, {Math.round(p.worldY)}</span>
                      {" · "}<ShowButton onClick={() => goSubject(subjects.get(`e${p.id}`)!)} />
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-sm text-muted">{layers.entrances ? "None placed on this continent." : "This layer is off."}</p>}
        </section>

        <section aria-labelledby="flights">
          <SectionHeading id="flights" note="Boats and zeppelins are not drawn.">Flight masters</SectionHeading>
          {flightNames.length ? (
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-fg-2">
              {flightNames.map((f) => (
                <li key={f.id} className="flex items-center gap-2">
                  <span className="text-fg">{f.name}</span>
                  <ShowButton onClick={() => goSubject(subjects.get(f.id)!)} />
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">{layers.flightMasters ? "None placed on this continent." : "This layer is off."}</p>}
        </section>

        {(layers.npcs || layers.vendors) && (
          <section aria-labelledby="observed">
            <SectionHeading id="observed" note="A point shows once 3 installs agree on where the NPC stands. Distinct install ids do not prove independent players.">Seen by players</SectionHeading>
            {shown.pins.length ? (
              <ul className="space-y-2 text-sm text-fg-2">
                {shown.pins.slice(0, LIST_LIMIT).map((p) => (
                  <li key={p.id}>
                    <Link href={`/database/npcs/${p.npcId}`} className="text-accent hover:underline underline-offset-4">{p.name ?? `NPC ${p.npcId}`}</Link>
                    {" · "}{p.kind}{" · "}{p.zoneName}{" "}
                    <Link href={mapHref({ mapId: p.mapId, x: p.zoneX, y: p.zoneY })} className="font-mono text-xs text-muted hover:underline underline-offset-4">{p.zoneX}, {p.zoneY}</Link>
                    {" · "}{p.reporters} reporters
                    {p.heldBack && <> {"·"} {HELD_LABEL}</>}
                    {" · "}<ShowButton onClick={() => goSubject(subjects.get(p.id)!)} />
                  </li>
                ))}
                {shown.pins.length > LIST_LIMIT && <li className="text-muted">and {shown.pins.length - LIST_LIMIT} more on the map.</li>}
              </ul>
            ) : <EmptyState message="No NPC or vendor position has 3 agreeing installs yet on this continent." />}
          </section>
        )}
      </div>
    </div>
  );
}

/** "Show on map" in a list row: moves the map and selects the pin. */
function ShowButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={() => { onClick(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
      className="inline-flex min-h-11 items-center text-accent hover:underline underline-offset-4"
    >
      Show on map
    </button>
  );
}
