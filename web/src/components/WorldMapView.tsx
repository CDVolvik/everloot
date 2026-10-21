"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Badge, Card, LinkTabs, Segmented } from "@/components/ui";
import {
  allLayers, DEFAULT_LAYERS, initialView, layerCounts, LAYER_IDS, searchMap, spotBox, viewSearch, visibleItems, wayCommand, zoneSpot,
  type Box, type LayerId, type LayerState, type MapArtLayer, type MapItems, type SearchHit,
} from "@/lib/map-view";
import MapList, { HELD_LABEL } from "./map/MapList";
import type { FitRequest, MapMarker, MapViewChange } from "./map/LeafletMap";
import "./map/world-map.css";

export type { MapMarker };

// Leaflet is loaded here and nowhere else: the rest of the site never downloads it, and the List tab is rendered
// on the server, so the page reads without it.
const LeafletMap = dynamic(() => import("./map/LeafletMap"), {
  ssr: false,
  loading: () => <p className="grid h-full place-items-center px-4 text-center text-sm text-muted">Loading the map. The same places are in the List tab.</p>,
});

const LAYER_LABELS: Record<LayerId, string> = {
  zones: "Zones",
  entrances: "Entrances",
  flightMasters: "Flight masters",
  flightPaths: "Flight paths",
  npcs: "NPCs players saw",
  vendors: "Vendors players saw",
};

/** Where the desktop sidebar's collapsed state is kept, in this browser only. */
export const SIDEBAR_KEY = "everloot.map.sidebar";

/** The sidebar's two views on a desk; on a phone, which bottom sheet is open. */
type View = "categories" | "list";
type Sheet = View | "search";

function Swatch({ layer }: { layer: LayerId }) {
  return (
    <svg width={layer === "entrances" ? 26 : 14} height="14" viewBox={layer === "entrances" ? "0 0 26 14" : "0 0 14 14"} aria-hidden="true" className="shrink-0">
      {layer === "zones" && <rect x="1.5" y="1.5" width="11" height="11" strokeWidth="1.2" className="fill-fg/10 stroke-edge" />}
      {layer === "entrances" && <><circle cx="7" cy="7" r="5" className="fill-accent" /><rect x="15" y="2" width="10" height="10" className="fill-warning" /></>}
      {layer === "flightMasters" && <path d="M7 1.5L12.5 12L1.5 12Z" className="fill-fg" />}
      {layer === "flightPaths" && <path d="M1 11L13 3" strokeWidth="1.5" strokeDasharray="3 2" className="stroke-fg-2" />}
      {layer === "npcs" && <circle cx="7" cy="7" r="3.5" className="fill-fg-2" />}
      {layer === "vendors" && <path d="M7 1.5L12.5 7L7 12.5L1.5 7Z" className="fill-fg" />}
    </svg>
  );
}

/** Our own line icons for the rail and the phone bar. */
function Icon({ name }: { name: "categories" | "search" | "list" | "open" | "close" }) {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {name === "categories" && <><path d="M12 3 21 8l-9 5-9-5Z" /><path d="m3 13 9 5 9-5" /></>}
      {name === "search" && <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>}
      {name === "list" && <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></>}
      {name === "open" && <path d="m9 6 6 6-6 6" />}
      {name === "close" && <path d="m15 6-6 6 6 6" />}
    </svg>
  );
}

const SHEET_LABEL: Record<Sheet, string> = { categories: "Categories", search: "Search", list: "List" };

/** What a pin on the map is, for its card. */
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
  /** The page title, for the heading screen readers land on (the sidebar shows the continent tabs instead). */
  title: string;
  name: string;
  continentId: number;
  continents: { id: number; name: string }[];
  /** The continent's box in yards. */
  base: Box;
  /** Everything the reader may see on this continent: held-back zones and their pins are in only with spoilers on. */
  items: MapItems;
  spoilers: boolean;
  /** The address that turns the spoiler switch the other way, keeping the zone or spot. */
  spoilerHref: string;
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
  /** A line over the map that the reader can close: a held-back zone asked for, storage out of reach. */
  notice?: ReactNode;
  /** The sidebar's foot: data age, the cross-check, the site's credit line and the guide. */
  meta?: ReactNode;
}

/**
 * The world map, full screen under the site header: Leaflet beside a sidebar with the continent tabs, search, the
 * categories and a List tab. On a desk the sidebar collapses to a rail; on a phone it becomes bottom sheets opened
 * from a bar, and a pin's card is a sheet too.
 */
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
  const [view, setView] = useState<View>("categories");
  const [collapsed, setCollapsed] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [full, setFull] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(true);
  // Focus asked for after the next render: the search field once its panel shows, the card once it opens.
  const [focusAsk, setFocusAsk] = useState<{ to: "search" | "card" | "panel"; n: number } | null>(null);
  const requestId = useRef(0);
  const camera = useRef<MapViewChange | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const searchInput = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const barButtons = useRef(new Map<Sheet, HTMLButtonElement>());
  // Where focus goes back to when the card closes: the list row or search result that opened it.
  const returnFocus = useRef<HTMLElement | null>(null);
  const drag = useRef<number | null>(null);

  // The collapsed sidebar is remembered in this browser, and read before the browser paints the mounted map.
  useLayoutEffect(() => {
    try { if (localStorage.getItem(SIDEBAR_KEY) === "collapsed") setCollapsed(true); } catch { /* storage blocked: start open */ }
  }, []);
  const collapse = (on: boolean) => {
    setCollapsed(on);
    try { if (on) localStorage.setItem(SIDEBAR_KEY, "collapsed"); else localStorage.removeItem(SIDEBAR_KEY); } catch { /* not remembered */ }
  };

  const shown = useMemo(() => visibleItems(items, layers, spoilers), [items, layers, spoilers]);
  const counts = useMemo(() => layerCounts(items, spoilers), [items, spoilers]);
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

  const ask = (to: "search" | "card" | "panel") => setFocusAsk((f) => ({ to, n: (f?.n ?? 0) + 1 }));
  useEffect(() => {
    if (!focusAsk) return;
    const el = focusAsk.to === "search" ? searchInput.current : focusAsk.to === "card" ? card.current : panel.current;
    el?.focus();
  }, [focusAsk]);

  const openSheet = (s: Sheet) => {
    setSheet(s);
    if (s !== "search") setView(s);
    ask(s === "search" ? "search" : "panel");
  };
  /** Closes a phone's sheet; focus goes back to the bar button that opened it. */
  const closeSheet = () => {
    if (sheet) barButtons.current.get(sheet)?.focus();
    setSheet(null);
    setFull(false);
  };
  /** Opens the sidebar on a desk, from the rail: on a view, or on the search field. */
  const openFromRail = (to: View | "search") => {
    collapse(false);
    if (to === "search") ask("search");
    else { setView(to); ask("panel"); }
  };

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
  /** From the list or search: the map moves to the item, a phone's sheet makes way, and focus goes to the card. */
  const showItem = (id: string) => {
    const s = subjects.get(id);
    if (!s) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    goSubject(s);
    setSheet(null);
    setFull(false);
    ask("card");
  };
  const showZone = (mapId: number) => {
    goZone(mapId);
    setSheet(null);
    setFull(false);
  };
  const goHit = (hit: SearchHit) => {
    setQuery("");
    if (hit.kind === "zone") showZone(Number(hit.id.slice(1)));
    else showItem(hit.id);
  };
  const goHome = () => {
    setFocusZone(null);
    setSelectedId(null);
    setSpot(null);
    fit(base);
  };
  const closeCard = () => {
    setSelectedId(null);
    setSpot(null);
    const back = returnFocus.current;
    returnFocus.current = null;
    // The row that opened the card, when it is still on screen (a phone's sheet has closed since).
    if (back?.isConnected && back.offsetParent !== null) back.focus();
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

  // Read once, when the map opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => initialView({ base, items, view: props.view, marker, zoneId: props.zoneId }), []);

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

  const focus = focusZone !== null ? items.zones.find((z) => z.mapId === focusZone) : undefined;
  const spoilerQuery = spoilers ? "&spoilers=1" : "";
  const cardSpot = selected ? selectedSpot : here;
  const allOn = LAYER_IDS.every((id) => layers[id]);
  const allOff = LAYER_IDS.every((id) => !layers[id]);
  const railButton = "inline-flex h-11 w-11 items-center justify-center rounded-control text-fg-2 hover:bg-canvas hover:text-accent";

  return (
    <div data-map-shell data-collapsed={collapsed ? "" : undefined} className="fixed inset-x-0 bottom-0 top-header z-30 flex flex-col bg-canvas md:flex-row">
      {/* Without JavaScript there is no map: the List tab shows, in the sheet on a phone. */}
      <noscript><style>{"[data-map-list][hidden]{display:block}@media (max-width:767.98px){[data-map-panel]{display:flex!important}}"}</style></noscript>
      <h1 className="sr-only">{props.title}</h1>

      {/* A desk with the sidebar collapsed: a 48 px rail of buttons that open it again. */}
      <nav aria-label="Map sidebar" data-map-rail className="hidden w-12 shrink-0 flex-col items-center gap-1 border-r border-line bg-panel py-2 md:flex">
        <button type="button" aria-label="Open the sidebar" title="Open the sidebar" aria-expanded={false} aria-controls="map-panel" onClick={() => openFromRail(view)} className={railButton}><Icon name="open" /></button>
        <button type="button" aria-label="Categories" title="Categories" onClick={() => openFromRail("categories")} className={railButton}><Icon name="categories" /></button>
        <button type="button" aria-label="Search the map" title="Search the map" onClick={() => openFromRail("search")} className={railButton}><Icon name="search" /></button>
        <button type="button" aria-label="List" title="List" onClick={() => openFromRail("list")} className={railButton}><Icon name="list" /></button>
      </nav>

      <aside
        id="map-panel"
        ref={panel}
        tabIndex={-1}
        aria-label={sheet ? SHEET_LABEL[sheet] : "Map sidebar"}
        data-map-panel
        data-open={sheet ? "" : undefined}
        data-full={full ? "" : undefined}
        data-mode={sheet === "search" ? "search" : undefined}
        onKeyDown={(e) => { if (e.key === "Escape" && sheet) { e.stopPropagation(); closeSheet(); } }}
        className="flex min-h-0 flex-col bg-panel focus:outline-none md:w-80 md:shrink-0 md:border-r md:border-line"
      >
        {/* A phone: drag the handle up for the full screen, down to close; tap it to switch. */}
        <div className="flex shrink-0 items-center gap-2 border-b border-line pl-4 pr-1 md:hidden">
          <p className="text-h2-sm text-fg">{sheet ? SHEET_LABEL[sheet] : ""}</p>
          <button
            type="button"
            aria-label={full ? "Half height" : "Full height"}
            onPointerDown={(e) => { drag.current = e.clientY; e.currentTarget.setPointerCapture?.(e.pointerId); }}
            onPointerUp={(e) => {
              const start = drag.current;
              drag.current = null;
              if (start === null) return;
              const dy = e.clientY - start;
              if (dy < -40) setFull(true);
              else if (dy > 40) { if (full) setFull(false); else closeSheet(); }
              else setFull((f) => !f);
            }}
            // A pointer is handled above; Enter and Space arrive as a click with no pointer (detail 0).
            onClick={(e) => { if (e.detail === 0) setFull((f) => !f); }}
            className="grid h-11 flex-1 touch-none place-items-center"
          >
            <span aria-hidden="true" className="block h-1 w-10 rounded-full bg-edge" />
          </button>
          <button type="button" aria-label="Close" onClick={closeSheet} className="btn min-h-11 min-w-11 border-transparent px-0 text-lg leading-none">&times;</button>
        </div>

        <div className="flex shrink-0 items-end gap-1 pl-3 pr-1 pt-1">
          <div className="min-w-0 flex-1">
            <LinkTabs
              label="Continent"
              tabs={props.continents.map((c) => ({ href: `/map?continent=${c.id}${spoilerQuery}`, label: c.name, current: c.id === props.continentId }))}
            />
          </div>
          <button
            type="button" aria-label="Collapse the sidebar" title="Collapse the sidebar" aria-expanded={true} aria-controls="map-panel"
            onClick={() => collapse(true)} className={`${railButton} mb-0.5 hidden md:inline-flex`}
          ><Icon name="close" /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-3">
          {focus && (
            <div data-map-zone className="flex items-center justify-between gap-3 text-sm">
              <p className="min-w-0 font-medium text-fg [overflow-wrap:anywhere]">{focus.name}{focus.heldBack ? " *" : ""}</p>
              <button type="button" onClick={goHome} className="inline-flex min-h-11 shrink-0 items-center text-accent hover:underline underline-offset-4 md:min-h-8">All of {props.name}</button>
            </div>
          )}

          <form role="search" onSubmit={(e) => { e.preventDefault(); if (hits[0]) goHit(hits[0]); }}>
            <label htmlFor="map-search" className="sr-only">Search the map for a zone, entrance, flight master or NPC</label>
            <input
              id="map-search" ref={searchInput} type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" placeholder="Search the map"
              aria-describedby="map-search-count"
              className="w-full rounded-control border border-edge bg-canvas px-3 text-sm text-fg placeholder:text-muted"
            />
            <p id="map-search-count" role="status" className="sr-only">{query.trim() ? `${hits.length} ${hits.length === 1 ? "result" : "results"}` : ""}</p>
            {query.trim() && (
              <ul aria-label="Search results" className="mt-1 overflow-hidden rounded-card border border-line bg-canvas text-sm">
                {hits.length === 0 && <li className="px-3 py-3 text-muted">Nothing on this continent by that name.</li>}
                {hits.map((h) => (
                  <li key={h.id}>
                    <button type="button" onClick={() => goHit(h)} className="flex min-h-11 w-full items-baseline justify-between gap-3 px-3 py-2 text-left hover:bg-panel focus-visible:bg-panel">
                      <span className="min-w-0 text-fg [overflow-wrap:anywhere]">{h.label}</span>
                      <span className="shrink-0 text-xs text-muted">{h.detail}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </form>

          <div data-map-view className="space-y-4">
            <div className="hidden md:block">
              <Segmented label="Sidebar view" stretch value={view} onChange={setView} options={[{ value: "categories", label: "Categories" }, { value: "list", label: "List" }]} />
            </div>

            <div data-map-categories hidden={view !== "categories"} className="space-y-4">
              <div className="flex gap-2">
                <button type="button" onClick={() => setLayers(allLayers(true))} disabled={allOn} className="btn min-h-11 flex-1 px-3 text-sm md:min-h-8">Show all</button>
                <button type="button" onClick={() => setLayers(allLayers(false))} disabled={allOff} className="btn min-h-11 flex-1 px-3 text-sm md:min-h-8">Hide all</button>
              </div>
              <fieldset>
                <legend className="mb-1 text-h2-sm text-fg">Categories</legend>
                {LAYER_IDS.map((id) => (
                  <label key={id} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-fg-2 md:min-h-9">
                    <input type="checkbox" checked={layers[id]} onChange={() => setLayers((l) => ({ ...l, [id]: !l[id] }))} className="h-4 w-4 accent-accent" />
                    <Swatch layer={id} />
                    <span className="min-w-0 flex-1 text-fg">{LAYER_LABELS[id]}</span>
                    <span data-count className="tabular-nums text-muted"><span className="sr-only">, </span>{counts[id]}</span>
                  </label>
                ))}
              </fieldset>
              {spoilers && (
                <p className="flex items-center gap-2 text-xs text-muted">
                  <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true"><rect x="1" y="1" width="16" height="12" strokeWidth="1.2" strokeDasharray="3 2" className="fill-warning/10 stroke-warning" /></svg>
                  * Held-back zone <Badge tone="files">{HELD_LABEL}</Badge>
                </p>
              )}
              <div className="border-t border-line pt-3 text-sm">
                {art && (
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 text-fg md:min-h-9">
                    <input type="checkbox" checked={showArt} onChange={() => setShowArt((x) => !x)} className="h-4 w-4 accent-accent" />
                    Game map art
                  </label>
                )}
                <Link href={props.spoilerHref} className="inline-flex min-h-11 items-center text-accent hover:underline underline-offset-4 md:min-h-9">
                  {spoilers ? "Hide spoilers" : "Show spoilers"}
                </Link>
              </div>
            </div>

            <div data-map-list hidden={view !== "list"}>
              <MapList zones={zones} shown={shown} layers={layers} spoilers={spoilers} thumbs={props.thumbs} onZone={showZone} onShow={showItem} />
            </div>
          </div>

          {props.meta && <div data-map-meta className="space-y-1 border-t border-line pt-3 text-xs leading-relaxed text-muted">{props.meta}</div>}
        </div>
      </aside>

      <div className="relative isolate min-h-0 min-w-0 flex-1 bg-panel">
        <LeafletMap
          name={props.name} base={base} items={shown} zones={zones} art={art ?? null} showArt={showArt}
          selectedId={selectedId} marker={marker} initial={initial} request={request}
          onSelect={(id) => { setSelectedId(id); if (id) { setSpot(null); setSheet(null); returnFocus.current = null; } }}
          onZone={goZone}
          onPoint={(x, y) => { setSpot({ x, y }); setSheet(null); returnFocus.current = null; }}
          onHover={setHover}
          onView={onView}
        />
        {props.notice && noticeOpen && (
          <div data-map-notice className="absolute left-16 right-2 top-2 z-[1100] flex items-start gap-2 rounded-card border border-line bg-panel py-1 pl-3 pr-1 text-sm text-warning md:right-auto md:max-w-lg">
            <div className="min-w-0 flex-1 py-2">{props.notice}</div>
            <button type="button" aria-label="Close the notice" onClick={() => setNoticeOpen(false)} className="btn min-h-11 min-w-11 shrink-0 border-transparent px-0 text-lg leading-none text-fg">&times;</button>
          </div>
        )}
        {/* Where the pointer is, on the game's 0 to 100 scale. A phone has no pointer: it reads the card instead. */}
        <p data-coordinates className="pointer-events-none absolute bottom-2 right-2 z-[1100] hidden rounded-control border border-line bg-panel px-3 py-1 font-mono text-xs text-fg-2 md:block">
          {hovered ? `${hovered.zone.name} ${hovered.x}, ${hovered.y}` : "Move over the map for coordinates"}
        </p>
        {/* The card for what was chosen: a sheet along the bottom on a phone, the map's corner on a desk. */}
        {(selected || (spot && here)) && (
          <div
            ref={card} tabIndex={-1} data-map-card aria-labelledby="map-card-title" role="group"
            onKeyDown={(e) => { if (e.key === "Escape") closeCard(); }}
            className="absolute inset-x-2 bottom-2 z-[1100] max-h-[50%] overflow-y-auto rounded-card focus:outline-none focus-visible:outline-2 focus-visible:outline-accent md:bottom-3 md:left-3 md:right-auto md:w-96"
          >
            <Card padding="none" className="space-y-2 bg-panel p-4" unconfirmed={selected?.kind === "entrance" || selected?.kind === "flight"}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p id="map-card-title" className="text-base font-semibold text-fg [overflow-wrap:anywhere]">{selected ? selected.title : here?.zone.name}</p>
                  <p className="text-sm text-fg-2">{selected ? selected.detail : "A spot you picked"}</p>
                </div>
                <button type="button" aria-label="Close" onClick={closeCard} className="btn -mr-2 -mt-2 min-h-11 min-w-11 border-transparent px-0 text-lg leading-none">&times;</button>
              </div>
              <p className="font-mono text-sm text-fg-2">{cardSpot ? `${cardSpot.zone.name} ${cardSpot.x}, ${cardSpot.y}` : "Outside every zone"}</p>
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

      {/* A phone: the bar that opens the sheets. */}
      <nav aria-label="Map sidebar" data-map-bar className="z-20 flex h-[calc(3.5rem+env(safe-area-inset-bottom))] shrink-0 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] md:hidden">
        {(["categories", "search", "list"] as const).map((s) => (
          <button
            key={s}
            ref={(el) => { if (el) barButtons.current.set(s, el); else barButtons.current.delete(s); }}
            type="button"
            aria-expanded={sheet === s}
            aria-controls="map-panel"
            onClick={() => (sheet === s ? closeSheet() : openSheet(s))}
            className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-xs transition-colors ${sheet === s ? "text-accent" : "text-fg-2 hover:text-fg"}`}
          >
            <Icon name={s} />
            {SHEET_LABEL[s]}
          </button>
        ))}
      </nav>
    </div>
  );
}
