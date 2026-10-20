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
import { parseDeepLink, type MapItems } from "@/lib/map-view";
import { CONTINENTS, continentMap, continentPins, MAP_SOURCE, observedFacts, WORLD_MAP } from "@/lib/world-map";
import WorldMapView from "@/components/WorldMapView";
import { continentArt, creditWhat, instanceThumbs, loadingArt, loadSiteAssets } from "@/lib/game-assets";
import GameCredit from "@/components/game/GameCredit";
import { BannerArt } from "@/components/game/PageBanner";
import { Card, Explainer, LinkTabs, PageHeader, SectionHeading, SourceLine } from "@/components/ui";
import { trailFor } from "@/lib/breadcrumbs";

export const dynamic = "force-dynamic";

const TITLE = "WoW Forever World Map";
const description = "Zones, dungeon and raid entrances and player-observed NPCs on one map of WoW: Forever, drawn from positions read in the game files. No game art.";
/** The same description when the game's map pictures are shown. */
const withArt = (text: string) => text.replace(" No game art.", " The map pictures are the game's own.");

/** "No game art" only while there is none: with the asset URL set and pictures uploaded, the description says so. */
export async function generateMetadata(): Promise<Metadata> {
  const assets = await loadSiteAssets();
  const text = assets?.maps.length ? withArt(description) : description;
  return pageMetadata({ title: TITLE, description: text, path: "/map", image: "/map/opengraph-image" });
}

type Query = { continent?: string | string[]; zone?: string | string[]; x?: string | string[]; y?: string | string[]; spoilers?: string | string[] };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function MapPage(props: { searchParams: Promise<Query> }) {
  const searchParams = await props.searchParams;
  // Held-back zones are read from the file and sent to the browser only when the reader turns spoilers on.
  const spoilers = one(searchParams.spoilers) === "1";
  const { zones: everyZone, held } = allZones(WORLD_MAP);

  const deep = parseDeepLink(searchParams);
  const target = deep ? everyZone.find((z) => z.mapId === deep.mapId) : undefined;
  const hiddenTarget = Boolean(target && held.has(target.mapId) && !spoilers);
  const link = target && !hiddenTarget ? deep! : null;

  const asked = Number(one(searchParams.continent));
  const continentId = link && target ? target.continentId : CONTINENTS.some((c) => c.id === asked) ? asked : 0;
  const corpus = await uploadStore.loadCorpus();
  const records = corpus.unreachable ? [] : corpus.records;
  const map = continentMap(continentId, mapBoundsFromRecords(records), WORLD_MAP, spoilers);
  const pins = continentPins(continentId, observedFacts(records), spoilers);
  const vb = map.viewBox;
  // The game's own map pictures under the outlines, only when the asset URL is set and the upload has them.
  // A held-back zone's picture follows its outline: none unless spoilers are on.
  const assets = vb ? await loadSiteAssets() : null;
  const art = continentArt(assets, continentId, spoilers, WORLD_MAP.heldBackZones.some((z) => z.continentId === continentId));
  const lead = art ? withArt(description) : description;
  // The continent's loading screen under the title, and each dungeon's and raid's beside its entrance;
  // a later map's only with spoilers on.
  const banner = loadingArt(assets, continentId, spoilers);
  const allThumbs = instanceThumbs(assets, spoilers);
  const thumbs = Object.fromEntries(map.entrances.flatMap((p) => p.names).filter((n) => allThumbs[n]).map((n) => [n, allThumbs[n]]));
  const thumbShown = Object.keys(thumbs).length > 0;

  const items: MapItems = {
    zones: map.zones,
    entrances: map.entrances.map((p) => ({ id: `${p.world.worldX}-${p.world.worldY}`, names: p.names, raid: p.raid, x: p.map.x, y: p.map.y, worldX: p.world.worldX, worldY: p.world.worldY })),
    pins,
  };
  const at = link ? zoneToMap(everyZone, link.mapId, link.x / 100, link.y / 100) : null;
  const marker = link && target && at ? { x: at.x, y: at.y, label: `${target.name} ${link.x}, ${link.y}` } : null;
  // A deep link opens on the spot, about 1,200 yards across; a plain visit opens on the whole continent.
  const focus = marker ? { x: marker.x, y: marker.y, span: 1200 } : null;

  const switchHref = (() => {
    const q = new URLSearchParams();
    if (!link) q.set("continent", String(continentId));
    if (deep) { q.set("zone", String(deep.mapId)); q.set("x", String(deep.x)); q.set("y", String(deep.y)); }
    if (!spoilers) q.set("spoilers", "1");
    return `/map?${q.toString()}`;
  })();

  // One full credit line for the page's game art, at the foot; the banner carries only its one-line caption.
  const credit = assets && (art || banner || thumbShown)
    ? <GameCredit version={assets.version} label={assets.label} what={creditWhat(art && "map pictures", (banner || thumbShown) && "loading screen art")} />
    : null;

  return (
    <article>
      <JsonLd data={webApplicationJsonLd({ name: TITLE, path: "/map", description: lead })} />
      <PageHeader
        trail={trailFor("/map")!}
        title={TITLE}
        lede={lead}
        banner={banner ? { image: <BannerArt art={banner} eager /> } : undefined}
      />

      <LinkTabs
        label="Continent"
        tabs={CONTINENTS.map((c) => ({ href: `/map?continent=${c.id}${spoilers ? "&spoilers=1" : ""}`, label: c.name, current: c.id === continentId }))}
        aside={
          <>
            <span className="text-fg">Spoilers: {spoilers ? "on" : "off"}</span>
            <Link href={switchHref} className="inline-flex min-h-11 items-center text-accent hover:underline underline-offset-4">
              {spoilers ? "Hide them" : "Show them"}
            </Link>
          </>
        }
      />
      <div className="mt-6 space-y-8">
        {hiddenTarget && target && (
          <p className="text-sm text-warning">{target.name} is held back as possibly unreleased. Turn spoilers on to see this spot.</p>
        )}
        {corpus.unreachable && <p className="text-sm text-warning">{STORAGE_UNREACHABLE} The in-game cross-check and player-observed points are missing; the map itself does not depend on them.</p>}

        {vb ? (
          <WorldMapView
            key={`${continentId}-${spoilers}-${link ? `${link.mapId}-${link.x}-${link.y}` : ""}`}
            name={map.name}
            base={vb}
            items={items}
            focus={focus}
            marker={marker}
            spoilers={spoilers}
            art={art}
            thumbs={thumbShown ? thumbs : undefined}
          />
        ) : (
          <Card><p className="text-sm text-fg-2">Nothing is placed on this continent yet.</p></Card>
        )}

        <section aria-labelledby="zones">
          <SectionHeading id="zones">Zones</SectionHeading>
          <p className="text-sm text-fg-2">
            {map.zones.filter((z) => !z.heldBack).map((z) => z.name).join(", ")}.
            {map.zones.some((z) => z.heldBack) && (
              <> Held back, {HELD_LABEL}: {map.zones.filter((z) => z.heldBack).map((z) => z.name).join(", ")}.</>
            )}
          </p>
        </section>

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
      </div>

      <Explainer summary="Where the map comes from">
        <p>
          Zone outlines and entrances are positions read from the game files. They are found in the files and unconfirmed
          until players see them in the game. Points for NPCs and vendors come from what players uploaded.
        </p>
        <p>
          {spoilers
            ? "Spoilers are on: zones found only in the game files are drawn dashed and marked as unconfirmed. They may not be in the game."
            : "Spoilers are off: zones found only in the game files, which may not be released, are held back."}
        </p>
        <p>
          Map data read from the WoW: Forever game files, build {MAP_SOURCE.version}. It is Blizzard&apos;s data, found in the
          files and unconfirmed, and is not under our licence. See the{" "}
          <a className="text-accent" href={MAP_SOURCE.licenceUrl}>data policy</a>.
          NPC and vendor points are from player uploads (CC BY-SA 4.0).
        </p>
      </Explainer>
      {credit && <div className="mt-6">{credit}</div>}
      <SourceLine build={MAP_SOURCE.version} licence="Blizzard's data, not under our licence; player points CC BY-SA 4.0">
        {!corpus.unreachable && dataAgeLabel(corpus.dataAsOf)}
      </SourceLine>
    </article>
  );
}

const HELD_LABEL = "found in game files, unconfirmed";
