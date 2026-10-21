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
import { SiteCredit } from "@/components/Footer";

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

  const notice = (hiddenTarget && target) || corpus.unreachable ? (
    <>
      {hiddenTarget && target && <p>{target.name} is held back as possibly unreleased. Turn spoilers on to see {deep ? "this spot" : "this zone"}.</p>}
      {corpus.unreachable && <p>{STORAGE_UNREACHABLE} The in-game cross-check and player-observed points are missing; the map itself does not depend on them.</p>}
    </>
  ) : null;

  // The sidebar's foot: the full-screen map has no site footer, so the credit line comes along.
  const meta = (
    <>
      {(map.confirmedZones > 0 || map.disagreements.length > 0) && (
        <p data-cross-check>
          <span className="text-fg-2">In-game cross-check.</span> Where 3 installs agree on a zone&apos;s corners, we compare them with the game files:
          {" "}{map.confirmedZones} zone{map.confirmedZones === 1 ? "" : "s"} match within a yard.
          {map.disagreements.length > 0 && <> These differ, so treat their outlines as unconfirmed: {map.disagreements.map((d) => d.name).join(", ")}.</>}
        </p>
      )}
      {!corpus.unreachable && <p>{dataAgeLabel(corpus.dataAsOf)}</p>}
      <SiteCredit />
      <p><Link href="/docs/guides/find#map" className="text-fg-2 hover:text-accent">How the map works</Link></p>
    </>
  );

  return (
    <article data-map-page>
      <JsonLd data={webApplicationJsonLd({ name: TITLE, path: "/map", description: lead })} />
      {vb ? (
        <WorldMapView
          key={`${continentId}-${spoilers}-${link ? `${link.mapId}-${link.x}-${link.y}` : zoneId ?? ""}`}
          title={TITLE}
          name={map.name}
          continentId={continentId}
          continents={CONTINENTS.map((c) => ({ id: c.id, name: c.name }))}
          base={vb}
          items={items}
          spoilers={spoilers}
          spoilerHref={switchHref}
          art={art}
          thumbs={thumbShown ? thumbs : undefined}
          marker={marker}
          zoneId={zoneId}
          view={parseViewState(searchParams)}
          notice={notice}
          meta={meta}
        />
      ) : (
        <div className="space-y-3">
          <h1 className="text-title-sm text-fg sm:text-title">{TITLE}</h1>
          {notice && <div className="text-sm text-warning">{notice}</div>}
          <p className="w-full max-w-wide rounded-card border border-line bg-panel p-5 text-sm text-fg-2">Nothing is placed on this continent yet.</p>
        </div>
      )}
    </article>
  );
}
