import type { Metadata } from "next";
import AdSlot from "@/components/AdSlot";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { npcPage, questPage } from "../../../../../../kb/src/world-pages";
import { loadWorldFacts } from "@/lib/rollup-compute";
import { pinLink } from "@/lib/world-map";
import { trailFor } from "@/lib/breadcrumbs";
import { Badge, Container, DataTable, Facts, Tabs, TooltipFrame } from "@/components/ui";
import { EmptyTab, EntityHeader, EntityTop, known, LINK, Unreachable } from "../../entity";
import { loadItemFacts } from "@/lib/rollup-compute";
import { itemNames, npcNames } from "@/lib/names";
import { loreForEntity } from "@/lib/lore";
import { loadItemTips, loadQuestNames, loadSiteAssets } from "@/lib/game-assets";
import { CLIENT_LAYER } from "@/lib/items";
import { GAME_NAME_TITLE } from "@/components/EntityRelations";
import EntityLink from "@/components/EntityLink";
import LoreSection from "@/components/LoreSection";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const params = await props.params;
  if (!/^[1-9]\d*$/.test(params.id)) return { robots: { index: false, follow: true } };
  const [facts, wiki] = await Promise.all([loadWorldFacts(), loadQuestNames(CLIENT_LAYER.build.version)]);
  const page = questPage(Number(params.id), facts);
  const title = (!facts.unreachable && page.title) || wiki?.names.get(page.questId)?.name || `Quest ${params.id}`;
  return {
    ...pageMetadata({ title, description: "A WoW: Forever quest page from corroborated titles, levels, givers, and rewards.", path: `/database/quests/${params.id}` }),
    robots: { index: !facts.unreachable && Boolean(page.title || page.level !== null || page.giverNpcId !== null || page.turnInNpcId !== null || page.rewards.length), follow: true },
  };
}

interface Person { role: string; npcId: number; map: string | null }

export default async function QuestPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!/^[1-9]\d*$/.test(params.id)) notFound();
  const [facts, wiki] = await Promise.all([loadWorldFacts(), loadQuestNames(CLIENT_LAYER.build.version)]);
  const page = questPage(Number(params.id), facts);
  // Where players saw the giver and the turn-in NPC stand, as map links, when 3 installs agree.
  const where = (npcId: number | null) => {
    const pin = npcId === null || facts.unreachable ? undefined : npcPage(npcId, facts).pins.find((p) => pinLink(p.mapId, p.x, p.y));
    return pin ? pinLink(pin.mapId, pin.x, pin.y) : null;
  };
  // The title players agree on; else the Warcraft Wiki's, for a quest the game files list (docs/DATA_POLICY.md).
  const reported = facts.unreachable ? null : page.title;
  const wikiTitle = reported ? undefined : wiki?.names.get(page.questId)?.name;
  const title = reported ?? wikiTitle ?? `Quest ${page.questId}`;
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

  const named = title !== `Quest ${page.questId}`;

  return (
    <Container width="data">
      <article>
        <EntityHeader
          trail={trail}
          title={title}
          meta={[
            "Quest", !facts.unreachable && page.level !== null ? `Level ${page.level}` : null, named ? <span className="tabular-nums">ID {page.questId}</span> : null,
            // A title from the wiki carries the quiet unconfirmed marker; its source is a tooltip, never a printed label.
            wikiTitle ? <Badge tone="files">{`${GAME_NAME_TITLE.wiki.toLowerCase()}, unconfirmed`}</Badge> : null,
          ]}
        />
        <EntityTop
          box={
            <TooltipFrame name={title} label={wikiTitle ? `${title}, ${GAME_NAME_TITLE.wiki.toLowerCase()}` : `${title}, as players saw it`}>
              {!facts.unreachable && page.level !== null && <p>Level {page.level}</p>}
            </TooltipFrame>
          }
          facts={!facts.unreachable && (
            <Facts
              layout="list"
              label={`${title}: quick facts`}
              items={[
                { label: "Reported title", value: known(page.title) },
                { label: "Level", value: known(page.level), numeric: true },
                { label: "Giver", value: known(page.giverNpcId !== null ? npcLink(page.giverNpcId) : null) },
                { label: "Turn-in", value: known(page.turnInNpcId !== null ? npcLink(page.turnInNpcId) : null) },
                { label: "Rewards", value: known(page.rewards.length ? `${page.rewards.length} items` : null) },
              ]}
            />
          )}
        />
        <Tabs
          label={`${title}: relations`}
          tabs={[
            {
              id: "rewards", label: "Rewards", count: facts.unreachable ? undefined : page.rewards.length,
              panel: facts.unreachable ? <Unreachable />
                : page.rewards.length ? (
                  <DataTable
                    dense
                    caption={`Rewards of ${title}`}
                    columns={[{ key: "item", header: "Item", cell: (itemId: number) => <EntityLink kind="item" id={itemId} name={items.get(itemId) ?? tips.get(itemId)?.name} icon={tips.get(itemId)?.icon} /> }]}
                    rows={page.rewards}
                    rowKey={String}
                  />
                )
                : <EmptyTab message="No agreed rewards yet." />,
            },
            {
              id: "givers", label: "Giver and turn-in", count: facts.unreachable ? undefined : people.length,
              panel: facts.unreachable ? <Unreachable />
                : people.length ? (
                  <DataTable
                    dense
                    caption={`Who gives and takes ${title}`}
                    columns={[
                      { key: "role", header: "Role", nowrap: true, cell: (p: Person) => p.role },
                      { key: "npc", header: "NPC", cell: (p: Person) => npcLink(p.npcId) },
                      { key: "map", header: "", cell: (p: Person) => (p.map ? <Link href={p.map} className={LINK}>Show on the map</Link> : null) },
                    ]}
                    rows={people}
                    rowKey={(p) => p.role}
                  />
                )
                : <EmptyTab message="No agreed giver or turn-in yet." />,
            },
          ]}
        />
        <div className="mt-6 space-y-6 empty:hidden">
          <LoreSection match={lore} />
          {!facts.unreachable && page.title !== null && <AdSlot slot="inContent" />}
        </div>
      </article>
    </Container>
  );
}
