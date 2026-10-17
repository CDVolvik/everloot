import type { Metadata } from "next";
import Link from "next/link";
import { mapBoundsFromRecords } from "../../../../kb/src/map-bounds";
import { STORAGE_UNREACHABLE, uploadStore } from "@/lib/upload-store";
import { dataAgeLabel } from "@/lib/data-age";
import { CONTINENTS, continentMap, MAP_SOURCE } from "@/lib/world-map";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "World map",
  description: "Zones and dungeon and raid entrances on one map of WoW: Forever, drawn from positions read in the game files. No game art.",
  alternates: { canonical: "/map" },
};

export default async function MapPage(props: { searchParams: Promise<{ continent?: string | string[] }> }) {
  const searchParams = await props.searchParams;
  const asked = Number(Array.isArray(searchParams.continent) ? searchParams.continent[0] : searchParams.continent);
  const continentId = CONTINENTS.some((c) => c.id === asked) ? asked : 0;
  const corpus = await uploadStore.loadCorpus();
  const map = continentMap(continentId, corpus.unreachable ? [] : mapBoundsFromRecords(corpus.records));
  const vb = map.viewBox;
  // Sizes are in yards, so they are set from the view box width: text is about 11px or more wherever it
  // shows (from 640px up), and pins are at least 5px. Below that the labels hide and the list carries the names.
  const w = vb?.width ?? 1;
  const pin = w * 0.014;

  return (
    <article className="space-y-8 max-w-5xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">WoW: Forever · world map</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">{map.name}</h1>
        <p className="text-sm text-fg-2 max-w-2xl">
          One map from game coordinates, drawn by us with no game art. Zone outlines and entrances are positions read from the
          game files. They are found in the files and unconfirmed until players see them in the game.
        </p>
        <nav aria-label="Continent" className="flex gap-3 text-sm">
          {CONTINENTS.map((c) => (
            <Link
              key={c.id}
              href={`/map?continent=${c.id}`}
              aria-current={c.id === continentId ? "page" : undefined}
              className={c.id === continentId ? "text-fg underline underline-offset-4" : "text-accent hover:underline underline-offset-4"}
            >
              {c.name}
            </Link>
          ))}
        </nav>
      </header>

      {corpus.unreachable && <p className="text-sm text-warning">{STORAGE_UNREACHABLE} The in-game cross-check is missing; the map itself does not depend on it.</p>}

      {vb ? (
        <svg
          viewBox={`${vb.x} ${vb.y} ${vb.width} ${vb.height}`}
          role="img"
          aria-label={`${map.name}: ${map.zones.length} zone outlines, ${map.entrances.length} entrances. The same items are listed below.`}
          className="w-full rounded-xl border border-line bg-panel"
        >
          {map.zones.map((z) => (
            <g key={z.mapId}>
              <rect x={z.x} y={z.y} width={z.width} height={z.height} className="fill-canvas stroke-edge" strokeWidth={w * 0.002} />
              {(z.width / w) * 600 >= z.name.length * 7 && (
                <text x={z.x + z.width / 2} y={z.y + z.height / 2} textAnchor="middle" fontSize={w * 0.019} className="fill-muted hidden sm:inline">{z.name}</text>
              )}
            </g>
          ))}
          {map.entrances.map((p) => (
            <g key={`${p.world.worldX}-${p.world.worldY}`}>
              {p.raid
                ? <rect x={p.map.x - pin} y={p.map.y - pin} width={pin * 2} height={pin * 2} className="fill-warning stroke-canvas" strokeWidth={pin * 0.2} />
                : <circle cx={p.map.x} cy={p.map.y} r={pin} className="fill-accent stroke-canvas" strokeWidth={pin * 0.2} />}
              <text x={p.map.x + pin * 1.6} y={p.map.y + w * 0.006} fontSize={w * 0.019} className="fill-fg hidden sm:inline">{p.names[0]}</text>
            </g>
          ))}
        </svg>
      ) : (
        <p className="rounded-xl border border-line bg-panel p-5 text-sm text-fg-2">Nothing is placed on this continent yet.</p>
      )}

      {vb && (
        <ul aria-label="Legend" className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-fg-2">
          <li className="flex items-center gap-2"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" className="fill-accent" /></svg>Dungeon (circle)</li>
          <li className="flex items-center gap-2"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="1.5" y="1.5" width="11" height="11" className="fill-warning" /></svg>Raid (square)</li>
          <li className="flex items-center gap-2"><svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true"><rect x="1" y="1" width="16" height="12" strokeWidth="1.5" className="fill-canvas stroke-edge" /></svg>Zone outline</li>
          <li className="sm:hidden">Names show on wider screens; the lists below always carry them.</li>
        </ul>
      )}

      <section aria-labelledby="entrances" className="space-y-3">
        <h2 id="entrances" className="text-xl font-semibold text-fg">Dungeon and raid entrances</h2>
        {map.entrances.length ? (
          <ul className="space-y-2 text-sm text-fg-2">
            {map.entrances.map((p) => (
              <li key={`${p.world.worldX}-${p.world.worldY}`}>
                <span className="text-fg">{p.names.join(", ")}</span>
                {" · "}{p.raid ? "raid" : "dungeon"}
                {" · "}<span className="font-mono text-xs text-muted">{Math.round(p.world.worldX)}, {Math.round(p.world.worldY)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">None placed on this continent.</p>}
      </section>

      <section aria-labelledby="zones" className="space-y-3">
        <h2 id="zones" className="text-xl font-semibold text-fg">Zones</h2>
        <p className="text-sm text-fg-2">{map.zones.map((z) => z.name).join(", ")}.</p>
      </section>

      {(map.confirmedZones > 0 || map.disagreements.length > 0) && (
        <section aria-labelledby="check" className="space-y-3">
          <h2 id="check" className="text-xl font-semibold text-fg">In-game cross-check</h2>
          <p className="text-sm text-fg-2">
            Where 3 installs agree on a zone&apos;s corners, we compare them with the game files:
            {" "}{map.confirmedZones} zone{map.confirmedZones === 1 ? "" : "s"} match within a yard.
            {map.disagreements.length > 0 && <> These differ, so treat their outlines as unconfirmed: {map.disagreements.map((d) => d.name).join(", ")}.</>}
          </p>
        </section>
      )}

      <footer className="space-y-1 text-xs text-muted">
        {!corpus.unreachable && <p>{dataAgeLabel(corpus.dataAsOf)}</p>}
        <p>
          Map data read from the WoW: Forever game files, build {MAP_SOURCE.version}. It is Blizzard&apos;s data, found in the
          files and unconfirmed, and is not under our licence. See the{" "}
          <a className="text-accent hover:underline underline-offset-4" href={MAP_SOURCE.licenceUrl}>data policy</a>.
        </p>
      </footer>
    </article>
  );
}
