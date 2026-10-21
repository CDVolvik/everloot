import Link from "next/link";
import { Badge, EmptyState } from "@/components/ui";
import { mapHref, zoneHref, type LayerState, type MapItems, type MapZone } from "@/lib/map-view";

const LIST_LIMIT = 100;
export const HELD_LABEL = "found in game files, unconfirmed";

const heading = "mb-2 text-h2-sm text-fg";
const showClass = "inline-flex min-h-11 items-center text-accent hover:underline underline-offset-4 md:min-h-8";

/**
 * The List tab: every place the map shows, as headed lists, for a keyboard, a screen reader or anyone who would
 * rather read. It follows the same layer switches as the map. The server renders it, so the page reads without
 * JavaScript.
 */
export default function MapList({ zones, shown, layers, spoilers, thumbs, onZone, onShow }: {
  /** Every zone the reader may see, whatever the zone layer says. */
  zones: MapZone[];
  /** What the layers and the spoiler switch let through: the same items the map draws. */
  shown: MapItems;
  layers: LayerState;
  spoilers: boolean;
  thumbs?: Record<string, string>;
  onZone: (mapId: number) => void;
  /** Show an item on the map and open its card, by the item's id on the map. */
  onShow: (id: string) => void;
}) {
  const seen = new Set<string>();
  const flightNames = shown.flightMasters.filter((f) => (seen.has(f.name) ? false : (seen.add(f.name), true)));
  return (
    <div className="space-y-6 text-sm">
      <section aria-labelledby="map-list-zones">
        <h2 id="map-list-zones" className={heading}>Zones</h2>
        <ul className="grid grid-cols-2 gap-x-3">
          {zones.map((z) => (
            <li key={z.mapId} className="min-w-0">
              <Link
                href={zoneHref(z.mapId, spoilers)} onClick={(e) => { e.preventDefault(); onZone(z.mapId); }}
                className="inline-flex min-h-11 items-center gap-1.5 text-accent hover:underline underline-offset-4 md:min-h-8"
              >
                {z.name}{z.heldBack && <> *<Badge tone="files">{HELD_LABEL}</Badge></>}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="map-list-entrances">
        <h2 id="map-list-entrances" className={heading}>Dungeon and raid entrances</h2>
        {shown.entrances.length ? (
          <ul className="space-y-2 text-fg-2">
            {shown.entrances.map((p) => {
              const thumb = p.names.map((n) => thumbs?.[n]).find(Boolean);
              return (
                <li key={p.id} className="flex items-center gap-3">
                  {thumb && (
                    // The dungeon's or raid's loading screen, small; decorative, the name is beside it.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" aria-hidden="true" width={72} height={40} loading="lazy" decoding="async" data-entrance-art className="h-10 w-[72px] shrink-0 rounded-control border border-line object-cover" />
                  )}
                  <span className="min-w-0">
                    <span className="text-fg">{p.names.join(", ")}</span>
                    {" · "}{p.raid ? "raid" : "dungeon"}
                    {" · "}<span className="font-mono text-xs text-muted">{Math.round(p.worldX)}, {Math.round(p.worldY)}</span>
                    {" · "}<ShowButton onClick={() => onShow(`e${p.id}`)} />
                  </span>
                </li>
              );
            })}
          </ul>
        ) : <p className="text-muted">{layers.entrances ? "None placed on this continent." : "This layer is off."}</p>}
      </section>

      <section aria-labelledby="map-list-flights">
        <h2 id="map-list-flights" className={heading}>Flight masters</h2>
        {flightNames.length ? (
          <ul className="text-fg-2">
            {flightNames.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 text-fg">{f.name}</span>
                <ShowButton onClick={() => onShow(f.id)} />
              </li>
            ))}
          </ul>
        ) : <p className="text-muted">{layers.flightMasters ? "None placed on this continent." : "This layer is off."}</p>}
        <p className="mt-2 text-xs text-muted">Boats and zeppelins are not drawn.</p>
      </section>

      {(layers.npcs || layers.vendors) && (
        <section aria-labelledby="map-list-observed">
          <h2 id="map-list-observed" className={heading}>Seen by players</h2>
          <p className="mb-2 text-xs text-muted">A point shows once 3 installs agree on where the NPC stands. Distinct install ids do not prove independent players.</p>
          {shown.pins.length ? (
            <ul className="space-y-2 text-fg-2">
              {shown.pins.slice(0, LIST_LIMIT).map((p) => (
                <li key={p.id}>
                  <Link href={`/database/npcs/${p.npcId}`} className="text-accent hover:underline underline-offset-4">{p.name ?? `NPC ${p.npcId}`}</Link>
                  {" · "}{p.kind}{" · "}{p.zoneName}{" "}
                  <Link href={mapHref({ mapId: p.mapId, x: p.zoneX, y: p.zoneY })} className="font-mono text-xs text-muted hover:underline underline-offset-4">{p.zoneX}, {p.zoneY}</Link>
                  {" · "}{p.reporters} reporters
                  {p.heldBack && <> {"·"} <Badge tone="files">{HELD_LABEL}</Badge></>}
                  {" · "}<ShowButton onClick={() => onShow(p.id)} />
                </li>
              ))}
              {shown.pins.length > LIST_LIMIT && <li className="text-muted">and {shown.pins.length - LIST_LIMIT} more on the map.</li>}
            </ul>
          ) : <EmptyState message="No NPC or vendor position has 3 agreeing installs yet on this continent." />}
        </section>
      )}
    </div>
  );
}

/** "Show on map" in a list row: moves the map and opens the item's card. */
function ShowButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className={showClass}>Show on map</button>;
}
