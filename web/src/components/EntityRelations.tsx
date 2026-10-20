import Link from "next/link";
import { GAME_DATA_CREDIT } from "@everloot/protocol";
import { CLIENT_SKILLS } from "../../../kb/src/client-layer-file";
import { CLIENT_LABEL, edgesFrom, entityLabel, evidenceLabel, groupByRel, type Edge, type EdgeKind, type Rel } from "../../../kb/src/edges";
import { zoneByMapId, zoneHref } from "@/lib/zones";
import GameIcon from "./game/GameIcon";

/** A spell's icon URL, when the page has the asset manifest. Items get none here: their icons follow the reported-items rule. */
export type SpellIconFor = (spellId: number) => string | undefined;

/** Where an entity has a page on this site; null where it has none yet (spells, sets, icons). */
function hrefFor(kind: EdgeKind, id: number, rel: Rel): string | null {
  if (kind === "item") return `/database/items/${id}`;
  if (kind === "npc") return rel === "sold_by" ? `/database/vendors/${id}` : `/database/npcs/${id}`;
  if (kind === "object") return `/database/objects/${id}`;
  if (kind === "quest") return `/database/quests/${id}`;
  if (kind === "zone") {
    // Released zones only: a zone found just in the game files gets no page, so no link.
    const zone = zoneByMapId(id);
    return zone ? zoneHref(zone.mapId, zone.name) : null;
  }
  if (kind === "skill") return "/tools/professions";
  return null;
}

const SAME_ICON_SHOWN = 12;

/** A profession by its skill line id, with the client's name where the layer has it. */
const professionName = (skill: number) => CLIENT_SKILLS.get(skill) ?? entityLabel("skill", skill);

/** The profession that teaches a spell, from the game-file relation spell -> skill line; undefined when none. */
function professionOf(spellId: number, client: readonly Edge[]): string | undefined {
  const e = client.find((o) => o.fromKind === "spell" && o.fromId === spellId && o.rel === "in_skill_line");
  return e ? professionName(e.toId) : undefined;
}

/** An agreed name for an entity, where the page has one; the label falls back to "kind id". */
export type NameFor = (kind: EdgeKind, id: number) => string | undefined;

export function RelationTarget({ edge, rel, client, spellIcon, nameOf }: { edge: Edge; rel: Rel; client: readonly Edge[]; spellIcon?: SpellIconFor; nameOf?: NameFor }) {
  const href = hrefFor(edge.toKind, edge.toId, rel);
  const text = edge.toKind === "skill" ? professionName(edge.toId) : edge.toKind === "zone" ? zoneByMapId(edge.toId)?.name ?? entityLabel("zone", edge.toId) : nameOf?.(edge.toKind, edge.toId) ?? entityLabel(edge.toKind, edge.toId);
  const icon = edge.toKind === "spell" ? spellIcon?.(edge.toId) : undefined;
  // A spell's profession beside it (Created by: spell 2660 · Blacksmithing), as item databases list recipes.
  const profession = edge.toKind === "spell" ? professionOf(edge.toId, client) : undefined;
  return (
    <>
      {icon ? <><GameIcon src={icon} size={18} />{" "}</> : null}
      {href ? <Link href={href} className="text-accent hover:underline underline-offset-4">{text}</Link> : text}
      {profession ? <span className="text-fg-2">{` · ${profession}`}</span> : null}
    </>
  );
}

/**
 * Relations of one entity grouped by relation. A player-observed row says how many installs agree; the
 * game-file rows carry no mark of their own, and the section ends with one line that says they were read
 * from the files, which build, and Blizzard's notice. `skip` leaves out relations the page already shows
 * in full (an item's drop table).
 */
export function EntityRelations({ kind, id, observed, client, skip = [], spellIcon, nameOf }: {
  kind: EdgeKind; id: number; observed: readonly Edge[]; client: readonly Edge[]; skip?: Rel[]; spellIcon?: SpellIconFor; nameOf?: NameFor;
}) {
  const groups = groupByRel(edgesFrom([...observed, ...client], kind, id)).filter((g) => !skip.includes(g.rel));
  const clientBuild = groups.flatMap((g) => g.edges).find((e) => e.evidence === "client")?.build;
  return (
    <section className="space-y-3" aria-labelledby="relations">
      <h2 id="relations" className="text-2xl text-fg">Relations</h2>
      {groups.length === 0 ? (
        <p className="text-sm text-fg-2">No relations recorded. Player-observed relations need 3 installs; game-file relations come from the current build.</p>
      ) : (
        <dl className="space-y-3 text-sm">
          {groups.map((g) => (
            <div key={g.rel}>
              <dt className="font-mono text-xs text-muted">{g.label}</dt>
              <dd>
                <ul className="space-y-1 text-fg">
                  {g.edges.map((e) => (
                    <li key={`${e.evidence}-${e.toKind}-${e.toId}`}>
                      {e.rel === "same_icon" ? <SameIcon edge={e} self={id} client={client} /> : <RelationTarget edge={e} rel={g.rel} client={client} spellIcon={spellIcon} nameOf={nameOf} />}
                      {e.evidence === "observed" ? <span className="text-muted">{` · ${evidenceLabel(e)}`}</span> : null}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {clientBuild ? <p className="text-xs text-muted">Rows without an install count are {CLIENT_LABEL.toLowerCase()}: read from build {clientBuild}, not yet seen in play. {GAME_DATA_CREDIT}</p> : null}
    </section>
  );
}

export function SameIcon({ edge, self, client }: { edge: Edge; self: number; client: readonly Edge[] }) {
  const others = client.filter((o) => o.rel === "same_icon" && o.toId === edge.toId && o.fromId !== self).map((o) => o.fromId);
  return (
    <>
      {`Icon file ${edge.toId}, shared with `}
      {others.slice(0, SAME_ICON_SHOWN).map((item, i) => (
        <span key={item}>{i > 0 ? ", " : ""}<Link href={`/database/items/${item}`} className="text-accent hover:underline underline-offset-4">item {item}</Link></span>
      ))}
      {others.length > SAME_ICON_SHOWN ? ` and ${others.length - SAME_ICON_SHOWN} more` : ""}
    </>
  );
}
