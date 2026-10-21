import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container, DataTable, Facts, InShort, OpenData, Tabs, TooltipFrame, type Column, type TabItem } from "@/components/ui";
import { EmptyTab, EntityHeader, EntityTop, known, LINK } from "../../entity";
import { entitySummary, evidenceLine } from "@/lib/evidence";
import { loadEdges } from "@/lib/edges";
import { loadSiteAssets, loadSpellNames } from "@/lib/game-assets";
import { CLIENT_LAYER } from "@/lib/items";
import { edgesFrom, type Edge, type Rel } from "../../../../../../kb/src/edges";
import { entityLabel } from "../../../../../../kb/src/edges";
import { trailFor } from "@/lib/breadcrumbs";

/**
 * A spell page. The spell is the game's own data: its name, its text and its relations all come
 * from the client files of one build, so the page says which build and never claims a player saw
 * it. What players reported is a different page: the items and the quests.
 */
type Props = { params: Promise<{ id: string }> };

const relLabel: Record<string, string> = {
  created_by: "Creates",
  reagent_for: "Costs",
  in_skill_line: "Taught by",
  reward_from: "Reward from",
};

/** Where a spell''s relation target has a page, a link to it; otherwise the kind and the id. */
function SpellTarget({ edge }: { edge: Edge }) {
  const label = entityLabel(edge.toKind, edge.toId);
  const href = edge.toKind === "item" ? `/database/items/${edge.toId}`
    : edge.toKind === "npc" ? `/database/npcs/${edge.toId}`
    : edge.toKind === "quest" ? `/database/quests/${edge.toId}`
    : edge.toKind === "object" ? `/database/objects/${edge.toId}`
    : null;
  return href ? <Link href={href} className={LINK}>{label}</Link> : <span>{label}</span>;
}

const relationColumns: Column<Edge>[] = [
  { key: "to", header: "What", cell: (e) => <SpellTarget edge={e} /> },
  { key: "build", header: "Build", cell: (e) => e.build ?? "—" },
];

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  if (!/^[1-9]\d*$/.test(params.id)) return { robots: { index: false, follow: true } };
  return {
    title: `Spell ${params.id} · Everloot`,
    description: `Spell ${params.id} from the WoW: Forever client files: what it creates, what it costs and which talent teaches it, with the build it was read from.`,
    alternates: { canonical: `/database/spells/${params.id}` },
  };
}

export default async function SpellPage(props: Props) {
  const params = await props.params;
  if (!/^[1-9]\d*$/.test(params.id)) notFound();
  const spellId = Number(params.id);
  const [edges, assets, spellNames] = await Promise.all([
    loadEdges(),
    loadSiteAssets(),
    loadSpellNames(CLIENT_LAYER.build.version),
  ]);
  const all = edgesFrom([...edges.observed, ...edges.client], "spell", spellId);
  const rel = (r: Rel) => all.filter((e) => e.rel === r);
  const name = spellNames?.names.get(spellId);
  const tip = assets?.spellTips.get(spellId);
  const icon = assets?.spellIcons.get(spellId);
  const title = name ?? tip?.name ?? `Spell ${spellId}`;
  const build = edges.client.find((e) => e.fromId === spellId || e.toId === spellId)?.build ?? CLIENT_LAYER.build.version;

  const creates = rel("created_by");
  const costs = rel("reagent_for");
  const taught = rel("in_skill_line");
  const rewards = rel("reward_from");

  // The page in three lines: what it is, what the files say it does, and where the name came from.
  const summary = entitySummary({
    identity: [tip?.name ?? name, `Spell ${spellId}`].filter(Boolean).join(" · "),
    observed: creates.length
      ? `The files say it creates ${creates.length} ${creates.length === 1 ? "item" : "items"}${costs.length ? ` and costs ${costs.length}` : ""}.`
      : "The files say nothing about what it creates.",
    named: Boolean(name),
  });

  const relationTab = (id: string, label: string, r: Rel, empty: string): TabItem => {
    const rows = rel(r);
    return {
      id, label, count: rows.length,
      panel: rows.length
        ? <><p className="mb-2 text-meta text-fg-2">{evidenceLine(rows[0]!, Date.now())}</p><DataTable dense caption={`${label}: ${title}`} columns={relationColumns} rows={rows} rowKey={(e) => `${e.rel}-${e.toKind}-${e.toId}`} /></>
        : <EmptyTab message={empty} players={false} />,
    };
  };

  const tabs: TabItem[] = [
    relationTab("creates", relLabel.created_by!, "created_by", "The files say it creates nothing."),
    relationTab("costs", relLabel.reagent_for!, "reagent_for", "The files say it costs nothing."),
    relationTab("taught-by", relLabel.in_skill_line!, "in_skill_line", "The files say no profession teaches it."),
    ...(rewards.length ? [relationTab("reward-from", relLabel.reward_from!, "reward_from", "")] : []),
  ];

  const trail = [...trailFor("/database/spells")!, { name: title, path: `/database/spells/${spellId}` }];
  const facts: { label: string; value: React.ReactNode; numeric?: boolean }[] = [
    { label: "Spell id", value: <span className="tabular-nums">{spellId}</span>, numeric: true },
    { label: "Build", value: build },
    { label: "Creates", value: known(creates.length || null), numeric: true },
    { label: "Costs", value: known(costs.length || null), numeric: true },
  ];

  return (
    <Container width="data">
      <article>
        <EntityHeader trail={trail} title={title} meta={["Spell", <span className="tabular-nums">ID {spellId}</span>]} />
        <EntityTop
          box={
            <TooltipFrame name={tip?.name ?? title} label={`${tip?.name ?? title}, from the game files`}>
              {tip?.text ? <p>{tip.text}</p> : <p>No text for this spell in the client files.</p>}
            </TooltipFrame>
          }
          facts={<Facts layout="list" label={`${title}: quick facts`} items={facts} />}
        />
        <InShort summary="In short" bullets={summary} note={<Link href="/database#reading" className={LINK}>How to read these numbers</Link>} />
        <OpenData
          text={[`${title} (spell ${spellId})`, tip?.text ?? "", ...summary, `Source: https://everloot.app/database/spells/${spellId}`].filter(Boolean).join("\n")}
        />
        <Tabs label={`${title}: relations`} tabs={tabs} />
      </article>
    </Container>
  );
}
