import type { Metadata } from "next";
import AdSlot from "@/components/AdSlot";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { npcPage, questPage } from "../../../../../../kb/src/world-pages";
import { loadWorldFacts } from "@/lib/rollup-compute";
import { pinLink } from "@/lib/world-map";
import { trailFor } from "@/lib/breadcrumbs";
import { Container, DataTable, EmptyState, PageHeader, SourceLine, Tabs, TooltipFrame } from "@/components/ui";
import { EntityLayout, FactsCard, LINK, Unreachable } from "../../entity";
import { loadItemFacts } from "@/lib/rollup-compute";
import { itemNames, npcNames } from "@/lib/names";
import { loreForEntity } from "@/lib/lore";
import { loadItemTips, loadSiteAssets } from "@/lib/game-assets";
import EntityLink from "@/components/EntityLink";
import LoreSection from "@/components/LoreSection";
import GameCredit from "@/components/game/GameCredit";

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

interface Person { role: string; npcId: number; map: string | null }

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
  const title = facts.unreachable ? `Quest ${page.questId}` : page.title ?? `Quest ${page.questId}`;
  // Names for the giver, the turn-in and the rewards; icons for the rewards when the game files have them.
  const npcs = facts.unreachable ? new Map<number, string>() : npcNames(facts);
  const itemFacts = facts.unreachable || page.rewards.length === 0 ? null : await loadItemFacts();
  const items = itemFacts && !itemFacts.unreachable ? itemNames(itemFacts) : new Map<number, string>();
  const assets = page.rewards.length > 0 ? await loadSiteAssets() : null;
  const tips = await loadItemTips(assets, facts.unreachable ? [] : page.rewards);
  const lore = !facts.unreachable && page.title ? loreForEntity("quest", page.title) : null;
  const trail = [...trailFor("/database/quests")!, { name: title, path: `/database/quests/${page.questId}` }];
  const people: Person[] = facts.unreachable ? [] : [
    ...(page.giverNpcId !== null ? [{ role: "Giver", npcId: page.giverNpcId, map: where(page.giverNpcId) }] : []),
    ...(page.turnInNpcId !== null ? [{ role: "Turn-in", npcId: page.turnInNpcId, map: where(page.turnInNpcId) }] : []),
  ];
  const npcLink = (id: number) => <EntityLink kind="npc" id={id} name={npcs.get(id)} />;

  return (
    <Container width="wide">
      <article>
        <PageHeader trail={trail} title={title} meta={title !== `Quest ${page.questId}` ? <span className="font-mono tabular-nums">Quest {page.questId}</span> : undefined} />
        <EntityLayout
          rail={
            <>
              <TooltipFrame name={title} label={`${title}, as players saw it`}>
                {!facts.unreachable && page.level !== null && <p>Level {page.level}</p>}
              </TooltipFrame>
              {!facts.unreachable && (
                <FactsCard
                  title="Seen by players"
                  facts={[
                    { label: "Title", value: page.title ?? undefined },
                    { label: "Level", value: page.level ?? undefined },
                    { label: "Giver", value: page.giverNpcId !== null ? npcLink(page.giverNpcId) : undefined },
                    { label: "Turn-in", value: page.turnInNpcId !== null ? npcLink(page.turnInNpcId) : undefined },
                    { label: "Rewards", value: page.rewards.length ? `${page.rewards.length} items` : undefined },
                  ]}
                />
              )}
            </>
          }
        >
          <Tabs
            label={`${title}: relations`}
            tabs={[
              {
                id: "rewards", label: "Rewards", count: facts.unreachable ? undefined : page.rewards.length,
                panel: (
                  <DataTable
                    caption={`Rewards of ${title}`}
                    columns={[{ key: "item", header: "Item", cell: (itemId: number) => <EntityLink kind="item" id={itemId} name={items.get(itemId) ?? tips.get(itemId)?.name} icon={tips.get(itemId)?.icon} /> }]}
                    rows={facts.unreachable ? [] : page.rewards}
                    rowKey={String}
                    empty={facts.unreachable ? <Unreachable /> : <EmptyState framed={false} message="No agreed rewards yet. A reward shows once 3 installs report the same one." />}
                  />
                ),
              },
              {
                id: "givers", label: "Giver and turn-in", count: facts.unreachable ? undefined : people.length,
                panel: (
                  <DataTable
                    caption={`Who gives and takes ${title}`}
                    columns={[
                      { key: "role", header: "Role", nowrap: true, cell: (p: Person) => p.role },
                      { key: "npc", header: "NPC", cell: (p: Person) => npcLink(p.npcId) },
                      { key: "map", header: "", cell: (p: Person) => (p.map ? <Link href={p.map} className={LINK}>Show on the map</Link> : null) },
                    ]}
                    rows={people}
                    rowKey={(p) => p.role}
                    empty={facts.unreachable ? <Unreachable /> : <EmptyState framed={false} message="No agreed giver or turn-in yet. Each shows once 3 installs report the same NPC." />}
                  />
                ),
              },
            ]}
          />
          <LoreSection match={lore} />
          {!facts.unreachable && page.title !== null && <AdSlot slot="inContent" />}
        </EntityLayout>
        <SourceLine confirmed>
          The addon does not guess a level.
          {assets && tips.size > 0 && <>{" "}<GameCredit as="span" version={assets.version} label={assets.label} /></>}
        </SourceLine>
      </article>
    </Container>
  );
}
