import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { npcPage, questPage } from "../../../../../../kb/src/world-pages";
import { loadWorldFacts } from "@/lib/rollup-compute";
import { STORAGE_UNREACHABLE } from "@/lib/upload-store";
import { pinLink } from "@/lib/world-map";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const params = await props.params;
  if (!/^[1-9]\d*$/.test(params.id)) return { robots: { index: false, follow: true } };
  const facts = await loadWorldFacts();
  const page = questPage(Number(params.id), facts);
  return {
    ...pageMetadata({ title: !facts.unreachable && page.title ? page.title : `Quest ${params.id}`, description: "A WoW: Forever quest page from corroborated titles, levels, givers, and rewards.", path: `/database/quests/${params.id}` }),
    robots: { index: !facts.unreachable && Boolean(page.title || page.level !== null || page.giverNpcId !== null || page.turnInNpcId !== null || page.rewards.length), follow: true },
  };
}

export default async function QuestPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!/^[1-9]\d*$/.test(params.id)) notFound();
  const facts = await loadWorldFacts();
  const page = questPage(Number(params.id), facts);
  // Where players saw the giver and the turn-in NPC stand, as map links, when 3 installs agree.
  const where = (npcId: number | null) => {
    const pin = npcId === null || facts.unreachable ? undefined : npcPage(npcId, facts).pins.find((p) => pinLink(p.mapId, p.x, p.y));
    return pin ? pinLink(pin.mapId, pin.x, pin.y) : null;
  };
  const giverOnMap = where(page.giverNpcId);
  const turnInOnMap = where(page.turnInNpcId);
  const title = facts.unreachable ? `Quest ${page.questId}` : page.title ?? `Quest ${page.questId}`;

  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">WoW: Forever · quest</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">{title}</h1>
        <p className="text-sm text-muted">
          {facts.unreachable
            ? STORAGE_UNREACHABLE
            : page.title
              ? `Quest ${page.questId}`
              : "No agreed title yet. A title needs 3 installs reporting the same one."}
        </p>
      </header>

      {facts.unreachable ? null : (
      <>
      <dl className="text-sm text-fg space-y-2">
        <div>{page.level === null ? "No agreed level. A level needs 3 installs reporting the same one." : `Level ${page.level}`}</div>
        <div>{page.giverNpcId === null ? "No agreed giver." : <Link href={`/database/npcs/${page.giverNpcId}`} className="text-accent hover:underline underline-offset-4">Giver NPC {page.giverNpcId}</Link>}
          {giverOnMap && <>{" · "}<Link href={giverOnMap} className="text-accent hover:underline underline-offset-4">Show on the map</Link></>}</div>
        <div>{page.turnInNpcId === null ? "No agreed turn-in." : <Link href={`/database/npcs/${page.turnInNpcId}`} className="text-accent hover:underline underline-offset-4">Turn-in NPC {page.turnInNpcId}</Link>}
          {turnInOnMap && <>{" · "}<Link href={turnInOnMap} className="text-accent hover:underline underline-offset-4">Show on the map</Link></>}</div>
      </dl>

      <section className="space-y-2">
        <h2 className="text-2xl text-fg">Rewards</h2>
        {page.rewards.length === 0 ? (
          <p className="text-sm text-fg-2">No agreed rewards.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {page.rewards.map((itemId) => (
              <li key={itemId}>
                <Link href={`/database/items/${itemId}`} className="text-accent hover:underline underline-offset-4">Item {itemId}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      </>
      )}

      <p className="text-sm text-muted">
        <Link href="/database/quests" className="text-accent hover:underline underline-offset-4">Quest lookup</Link>
      </p>
    </article>
  );
}
