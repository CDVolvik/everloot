import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import { webApplicationJsonLd } from "@/lib/jsonld";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { mapBoundsFromRecords } from "../../../../kb/src/map-bounds";
import { allZones } from "../../../../kb/src/world-map-near";
import { zoneToMap } from "../../../../kb/src/world-coords";
import { STORAGE_UNREACHABLE, uploadStore } from "@/lib/upload-store";
import { dataAgeLabel } from "@/lib/data-age";
import { parseDeepLink, parseViewState, parseZoneLink, type MapItems } from "@/lib/map-view";
import { CONTINENTS, continentFlights, continentMap, continentPins, observedFacts, WORLD_MAP } from "@/lib/world-map";
import WorldMapView from "@/components/WorldMapView";
import { continentArt, instanceThumbs, loadSiteAssets } from "@/lib/game-assets";
import { Container, SectionHeading } from "@/components/ui";

export const dynamic = "force-dynamic";

const TITLE = "WoW Forever World Map";
const description = "Zones, entrances, flight masters and flight paths, and player-observed NPCs on one map of WoW: Forever, from the game files. No game art.";
/** The same description when the game's map pictures are shown. */
const withArt = (text: string) => text.replace(" No game art.", " The map pictures are the game's own.");

/** "No game art" only while there is none: with the asset URL set and pictures uploaded, the description says so. */
export async function generateMetadata(): Promise<Metadata> {
  const assets = await loadSiteAssets();
  const text = assets?.maps.length ? withArt(description) : description;
  return pageMetadata({ title: TITLE, description: text, path: "/map", image: "/map/opengraph-image" });
}

type Query = {
  continent?: string | string[]; zone?: string | string[]; x?: string | string[]; y?: string | string[]; spoilers?: string | string[];
  at?: string | string[]; z?: string | string[]; pin?: string | string[];
};
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function MapPage(props: { searchParams: Promise<Query> }) {
  const searchParams = await props.searchParams;
  // Held-back zones are read from the file and sent to the browser only when the reader turns spoilers on.
  const spoilers = one(searchParams.spoilers) === "1";
  const { zones: everyZone, held } = allZones(WORLD_MAP);

  // /map?zone=<id>&x=&y= puts a ring on the spot; /map?zone=<id> alone opens that zone fitted to the view.
  const deep = parseDeepLink(searchParams);
  const zoneOnly = parseZoneLink(searchParams);
  const askedZone = deep?.mapId ?? zoneOnly;
  const target = askedZone !== null ? everyZone.find((z) => z.mapId === askedZone) : undefined;
  const hiddenTarget = Boolean(target && held.has(target.mapId) && !spoilers);
  const link = target && !hiddenTarget ? deep : null;
  const zoneId = target && !hiddenTarget && !deep ? target.mapId : null;

  const asked = Number(one(searchParams.continent));
  const continentId = target && !hiddenTarget ? target.continentId : CONTINENTS.some((c) => c.id === asked) ? asked : 0;
  const corpus = await uploadStore.loadCorpus();
  const records = corpus.unreachable ? [] : corpus.records;
  const map = continentMap(continentId, mapBoundsFromRecords(records), WORLD_MAP, spoilers);
  const pins = continentPins(continentId, observedFacts(records), spoilers);
  const flights = continentFlights(continentId, spoilers);
  const vb = map.viewBox;
  // The game's own map pictures under the outlines, only when the asset URL is set and the upload has them.
  // A held-back zone's picture follows its outline: none unless spoilers are on.
  const assets = vb ? await loadSiteAssets() : null;
  const art = continentArt(assets, continentId, spoilers);
  const lead = art ? withArt(description) : description;
  // Each dungeon's and raid's loading screen beside its entrance in the list; a later map's only with spoilers on.
  const allThumbs = instanceThumbs(assets, spoilers);
  const thumbs = Object.fromEntries(map.entrances.flatMap((p) => p.names).filter((n) => allThumbs[n]).map((n) => [n, allThumbs[n]]));
  const thumbShown = Object.keys(thumbs).length > 0;

  const items: MapItems = {
    zones: map.zones,
    entrances: map.entrances.map((p) => ({ id: `${p.world.worldX}-${p.world.worldY}`, names: p.names, raid: p.raid, x: p.map.x, y: p.map.y, worldX: p.world.worldX, worldY: p.world.worldY })),
    pins,
    flightMasters: flights.masters,
    flightLines: flights.lines,
  };
  const at = link ? zoneToMap(everyZone, link.mapId, link.x / 100, link.y / 100) : null;
  const marker = link && target && at ? { x: at.x, y: at.y, label: `${target.name} ${link.x}, ${link.y}`, mapId: target.mapId } : null;

  const switchHref = (() => {
    const q = new URLSearchParams();
    if (!target || hiddenTarget) q.set("continent", String(continentId));
    if (deep) { q.set("zone", String(deep.mapId)); q.set("x", String(deep.x)); q.set("y", String(deep.y)); }
    else if (zoneOnly !== null) q.set("zone", String(zoneOnly));
    if (!spoilers) q.set("spoilers", "1");
    return `/map?${q.toString()}`;
  })();

  return (
    <article data-map-page className="space-y-3">
      <JsonLd data={webApplicationJsonLd({ name: TITLE, path: "/map", description: lead })} />
      <header className="mx-auto w-full max-w-[1800px]">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-0">
          <h1 className="text-2xl font-bold tracking-tight text-fg">{TITLE}</h1>
          <p className="text-sm text-fg-2">
            <span className="text-fg">Spoilers: {spoilers ? "on" : "off"}.</span>{" "}
            {spoilers
              ? "Zones found only in the game files are drawn dashed and marked as unconfirmed. They may not be in the game."
              : "Zones found only in the game files, which may not be released, are held back."}{" "}
            <Link href={switchHref} className="inline-flex min-h-11 items-center text-accent hover:underline underline-offset-4">
              {spoilers ? "Hide them" : "Show them"}
            </Link>
          </p>
        </div>
        {hiddenTarget && target && (
          <p className="text-sm text-warning">{target.name} is held back as possibly unreleased. Turn spoilers on to see {deep ? "this spot" : "this zone"}.</p>
        )}
        {corpus.unreachable && <p className="text-sm text-warning">{STORAGE_UNREACHABLE} The in-game cross-check and player-observed points are missing; the map itself does not depend on them.</p>}
      </header>

      {vb ? (
        <WorldMapView
          key={`${continentId}-${spoilers}-${link ? `${link.mapId}-${link.x}-${link.y}` : zoneId ?? ""}`}
          name={map.name}
          continentId={continentId}
          continents={CONTINENTS.map((c) => ({ id: c.id, name: c.name }))}
          base={vb}
          items={items}
          spoilers={spoilers}
          art={art}
          thumbs={thumbShown ? thumbs : undefined}
          marker={marker}
          zoneId={zoneId}
          view={parseViewState(searchParams)}
        />
      ) : (
        <p className="mx-auto w-full max-w-wide rounded-card border border-line bg-panel p-5 text-sm text-fg-2">Nothing is placed on this continent yet.</p>
      )}

      <Container className="mx-auto space-y-8 pt-8">
        {vb && (
          <section aria-labelledby="legend">
            <SectionHeading id="legend">How to read the map</SectionHeading>
            <p className="mb-3 text-sm text-fg-2">
              {map.name}. Zone outlines, entrances and flights are positions read from the game files, found in the files and unconfirmed until players see
              them in the game. Points for NPCs and vendors come from what players uploaded. Click a zone to zoom to it, click a pin for its card, and copy a waypoint for the game with the button on the card. Drag, scroll, pinch or use
              the arrow keys, plus and minus to move around. The address keeps your view, so a link opens the same place. Everything on the map is also in
              the lists below it.
            </p>
            <ul aria-label="Legend" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-fg-2">
              <li className="flex items-center gap-2"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" className="fill-accent" /></svg>Dungeon (circle)</li>
              <li className="flex items-center gap-2"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="1.5" y="1.5" width="11" height="11" className="fill-warning" /></svg>Raid (square)</li>
              <li className="flex items-center gap-2"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.5L12.5 12L1.5 12Z" className="fill-fg" /></svg>Flight master (triangle)</li>
              <li className="flex items-center gap-2"><svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true"><path d="M1 12L17 2" strokeWidth="1.5" strokeDasharray="3 2" className="stroke-fg-2" /></svg>Flight path (dashed line)</li>
              <li className="flex items-center gap-2"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="3.5" className="fill-fg-2" /></svg>NPC players saw (dot)</li>
              <li className="flex items-center gap-2"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.5L12.5 7L7 12.5L1.5 7Z" className="fill-fg" /></svg>Vendor players saw (diamond)</li>
              <li className="flex items-center gap-2"><svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true"><rect x="1" y="1" width="16" height="12" strokeWidth="1.2" className="fill-fg/10 stroke-edge" /></svg>Zone outline (overlaps are real)</li>
              {spoilers && <li className="flex items-center gap-2"><svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true"><rect x="1" y="1" width="16" height="12" strokeWidth="1.2" strokeDasharray="3 2" className="fill-warning/10 stroke-warning" /></svg>* Held-back zone: found in game files, unconfirmed</li>}
            </ul>
          </section>
        )}

        {(map.confirmedZones > 0 || map.disagreements.length > 0) && (
          <section aria-labelledby="check">
            <SectionHeading id="check">In-game cross-check</SectionHeading>
            <p className="text-sm text-fg-2">
              Where 3 installs agree on a zone&apos;s corners, we compare them with the game files:
              {" "}{map.confirmedZones} zone{map.confirmedZones === 1 ? "" : "s"} match within a yard.
              {map.disagreements.length > 0 && <> These differ, so treat their outlines as unconfirmed: {map.disagreements.map((d) => d.name).join(", ")}.</>}
            </p>
          </section>
        )}

        <footer className="space-y-1 text-xs text-muted">
          {!corpus.unreachable && <p>{dataAgeLabel(corpus.dataAsOf)}</p>}
        </footer>
      </Container>
    </article>
  );
}
