import Link from "next/link";
import { GAME_DATA_CREDIT } from "../../../kb/src/attribution";
import { CLIENT_LABEL, edgesFrom, entityLabel, evidenceLabel, groupByRel, type Edge, type EdgeKind, type Rel } from "../../../kb/src/edges";

/** Where an entity has a page on this site; null where it has none yet (spells, sets, skills). */
function hrefFor(kind: EdgeKind, id: number, rel: Rel): string | null {
  if (kind === "item") return `/database/items/${id}`;
  if (kind === "npc") return rel === "sold_by" ? `/database/vendors/${id}` : `/database/npcs/${id}`;
  if (kind === "quest") return `/database/quests/${id}`;
  if (kind === "zone") return `/map?zone=${id}`;
  return null;
}

const SAME_ICON_SHOWN = 12;

function Target({ edge, rel }: { edge: Edge; rel: Rel }) {
  const href = hrefFor(edge.toKind, edge.toId, rel);
  const text = entityLabel(edge.toKind, edge.toId);
  return href ? <Link href={href} className="text-accent hover:underline underline-offset-4">{text}</Link> : <>{text}</>;
}

/**
 * Relations of one entity grouped by relation. Player-observed groups say how many installs agree;
 * game-file groups carry the label and the build, and the section ends with Blizzard's notice when
 * any are shown. `skip` leaves out relations the page already shows in full (an item's drop table).
 */
export function EntityRelations({ kind, id, observed, client, skip = [] }: {
  kind: EdgeKind; id: number; observed: readonly Edge[]; client: readonly Edge[]; skip?: Rel[];
}) {
  const groups = groupByRel(edgesFrom([...observed, ...client], kind, id)).filter((g) => !skip.includes(g.rel));
  const anyClient = groups.some((g) => g.edges.some((e) => e.evidence === "client"));
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
                      {e.rel === "same_icon" ? <SameIcon edge={e} self={id} client={client} /> : <Target edge={e} rel={g.rel} />}
                      <span className="text-muted">{` · ${e.evidence === "client" ? `${CLIENT_LABEL.toLowerCase()}, build ${e.build}` : evidenceLabel(e)}`}</span>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {anyClient ? <p className="text-xs text-muted">{CLIENT_LABEL}: read from the game files, not yet seen in play. {GAME_DATA_CREDIT}</p> : null}
    </section>
  );
}

function SameIcon({ edge, self, client }: { edge: Edge; self: number; client: readonly Edge[] }) {
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
