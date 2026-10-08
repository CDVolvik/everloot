import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { questPage } from "../../../../../../kb/src/world-pages";
import { loadWorldFacts } from "@/lib/rollup-compute";
import { STORAGE_UNREACHABLE } from "@/lib/upload-store";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const params = await props.params;
  if (!/^[1-9]\d*$/.test(params.id)) return { robots: { index: false, follow: true } };
  const facts = await loadWorldFacts();
  const page = questPage(Number(params.id), facts);
  return {
    title: !facts.unreachable && page.title ? page.title : `Quest ${params.id}`,
    description: "A WoW: Forever quest page from corroborated titles, levels, givers, and rewards.",
    alternates: { canonical: `/database/quests/${params.id}` },
    robots: { index: !facts.unreachable && Boolean(page.title || page.level !== null || page.giverNpcId !== null || page.turnInNpcId !== null || page.rewards.length), follow: true },
  };
}

export default async function QuestPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!/^[1-9]\d*$/.test(params.id)) notFound();
  const facts = await loadWorldFacts();
  const page = questPage(Number(params.id), facts);
  const title = facts.unreachable ? `Quest ${page.questId}` : page.title ?? `Quest ${page.questId}`;

  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">WoW: Forever · quest</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-parchment-100 tracking-tight">{title}</h1>
        <p className="text-sm text-parchment-100/60">
          {facts.unreachable
            ? STORAGE_UNREACHABLE
            : page.title
              ? `Quest ${page.questId}`
              : "No agreed title yet. A title needs 3 installs reporting the same one."}
        </p>
      </header>

      {facts.unreachable ? null : (
      <>
      <dl className="text-sm text-parchment-100/85 space-y-2">
        <div>{page.level === null ? "No agreed level. A level needs 3 installs reporting the same one." : `Level ${page.level}`}</div>
        <div>{page.giverNpcId === null ? "No agreed giver." : <Link href={`/database/npcs/${page.giverNpcId}`} className="text-gold-400 hover:underline underline-offset-4">Giver NPC {page.giverNpcId}</Link>}</div>
        <div>{page.turnInNpcId === null ? "No agreed turn-in." : <Link href={`/database/npcs/${page.turnInNpcId}`} className="text-gold-400 hover:underline underline-offset-4">Turn-in NPC {page.turnInNpcId}</Link>}</div>
      </dl>

      <section className="space-y-2">
        <h2 className="font-display text-2xl text-parchment-100">Rewards</h2>
        {page.rewards.length === 0 ? (
          <p className="text-sm text-parchment-100/70">No agreed rewards.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {page.rewards.map((itemId) => (
              <li key={itemId}>
                <Link href={`/database/items/${itemId}`} className="text-gold-400 hover:underline underline-offset-4">Item {itemId}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      </>
      )}

      <p className="text-sm text-parchment-100/60">
        <Link href="/database/quests" className="text-gold-400 hover:underline underline-offset-4">Quest lookup</Link>
      </p>
    </article>
  );
}
