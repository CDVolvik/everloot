"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { importCode, type ImportReport } from "@/lib/talents/import";
import {
  add, canAdd, canRemove, commit, entryAtRank, isLegal, nodeMap, pointsAtLevel, pointsByTree, pointsSpent, redo, refusalText,
  remove, startHistory, undo, levelFor, type History,
} from "@/lib/talents/rules";
import GameIcon from "@/components/game/GameIcon";
import Card from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import Segmented from "@/components/ui/Segmented";
import { CREDIT, hasNodeFrames, loadGameAssets, type GameAssets } from "@/lib/talents/assets";
import { HOW_IT_WORKS_ID } from "@/lib/talents/facts";
import { encodeBuild } from "@/lib/talents/share";
import type { Ranks, TalentCatalog } from "@/lib/talents/types";
import GameTree from "./GameTree";
import TalentTooltip, { type TipContent } from "./TalentTooltip";
import TalentTreeView, { assetOf, CLASS_TEXT, type TipMode } from "./TalentTreeView";

// Client side of the calculator: the point rules live in lib/talents/rules.ts, this file only holds
// state and wires clicks, long presses and keys to them.

type Sets = [Ranks, Ranks];
const LONG_PRESS_MS = 500;

/** `classIcon`: the game's class icon for the bar, when the page has the asset folder. */
export default function TalentCalculator({ catalog, classIcon = null }: { catalog: TalentCatalog; classIcon?: string | null }) {
  const { rules } = catalog;
  const [history, setHistory] = useState<History<Sets>>(() => startHistory<Sets>([{}, {}]));
  const [active, setActive] = useState<0 | 1>(0);
  const [level, setLevel] = useState(rules.maxLevel);
  const [planAhead, setPlanAhead] = useState(false);
  const [view, setView] = useState(0);
  const [removeMode, setRemoveMode] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [rovingByTree, setRovingByTree] = useState<Record<number, number>>({});
  const [link, setLink] = useState("");
  const [pasted, setPasted] = useState("");
  const [report, setReport] = useState<(ImportReport & { loaded: boolean }) | null>(null);
  const [assets, setAssets] = useState<GameAssets | null>(null);
  const [tip, setTip] = useState<{ id: number; mode: TipMode } | null>(null);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);

  // The game's icons, tooltips and frame art, when the site has an asset folder. Anything wrong with
  // it leaves assets null and the page as it was.
  useEffect(() => {
    let live = true;
    void loadGameAssets().then((a) => { if (live) setAssets(a); });
    return () => { live = false; };
  }, []);
  const game = assets !== null && hasNodeFrames(assets);

  function onTip(id: number | null, mode: TipMode) {
    setTip((cur) => (id === null ? (cur?.mode === mode ? null : cur) : { id, mode }));
  }

  const ranks = history.present[active];
  const available = pointsAtLevel(catalog, level);
  const spent = pointsSpent(ranks);
  const perTree = pointsByTree(catalog, ranks);
  const secondOpen = level >= rules.dualSpecLevel || planAhead;
  const nodes = nodeMap(catalog);
  const nameOf = (id: number) => {
    const n = nodes.get(id);
    return n ? (n.kind === "choice" ? n.entries.map((e) => e.name).join(" or ") : n.entries[0].name) : "";
  };

  function setSets(next: Sets) {
    setHistory((h) => commit(h, next));
  }
  function setActiveRanks(next: Ranks) {
    const sets: Sets = [...history.present];
    sets[active] = next;
    setSets(sets);
  }

  function load(text: string) {
    const result = importCode(catalog, text);
    if (!result.ok) {
      setReport(null);
      setMessage(result.message);
      return;
    }
    const sets: Sets = [...history.present];
    sets[active] = result.ranks;
    setHistory((h) => commit(h, sets));
    setLevel((current) => Math.min(rules.maxLevel, Math.max(current, result.minLevel)));
    setReport({ ...result.report, loaded: true });
    setMessage(result.report.problems.length === 0 ? "Build loaded." : "Build loaded with changes. The list below says what.");
  }

  // A share link carries its code after #plan=. The hash never reaches the server, so the page itself
  // stays static and cached. Read when the page opens and whenever the hash changes, so pasting a
  // link into a tab that is already open loads it.
  useEffect(() => {
    function fromHash(opening: boolean) {
      const code = /[#&]plan=([A-Za-z0-9_.-]+)/.exec(window.location.hash)?.[1];
      if (!code) return;
      const result = importCode(catalog, code);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setHistory((h) => (opening ? startHistory<Sets>([result.ranks, {}]) : commit(h, [result.ranks, h.present[1]])));
      setActive(0);
      setLevel((current) => Math.min(rules.maxLevel, Math.max(opening ? rules.maxLevel : current, result.minLevel)));
      setReport({ ...result.report, loaded: true });
      setMessage(result.report.problems.length === 0 ? "Build loaded from the link." : "Build loaded from the link with changes. The list below says what.");
    }
    fromHash(true);
    const onHashChange = () => fromHash(false);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [catalog, rules.maxLevel]);

  // Undo and redo can bring back more points than the level now holds (spend 8, undo 3, lower the
  // level, redo 3). Raise the level to fit rather than show more points spent than allowed.
  function travel(step: (h: History<Sets>) => History<Sets>) {
    const next = step(history);
    if (next === history) return;
    const needed = Math.max(...next.present.map((r) => levelFor(catalog, pointsSpent(r))));
    setHistory(next);
    if (needed > level) {
      setLevel(needed);
      setMessage(`Level raised to ${needed}, the lowest that holds the points in this build.`);
    }
  }

  function doAdd(id: number, choice?: number) {
    const node = nodes.get(id)!;
    const next = add(catalog, ranks, id, available, choice);
    if (next === ranks) {
      const verdict = canAdd(catalog, ranks, id, available);
      setMessage(verdict.ok ? "" : refusalText(verdict.reason!, node, catalog, ranks));
      return;
    }
    setActiveRanks(next);
    const now = next[id]?.rank ?? 0;
    setMessage(`${nameOf(id)}: rank ${now} of ${node.maxRanks}.`);
  }

  function doRemove(id: number) {
    const node = nodes.get(id)!;
    const next = remove(catalog, ranks, id);
    if (next === ranks) {
      const verdict = canRemove(catalog, ranks, id);
      setMessage(refusalText(verdict.reason!, node, catalog, ranks));
      return;
    }
    setActiveRanks(next);
    setMessage(`${nameOf(id)}: rank ${next[id]?.rank ?? 0} of ${node.maxRanks}.`);
  }

  function setLevelClamped(value: number) {
    const needed = Math.max(...history.present.map((r) => levelFor(catalog, pointsSpent(r))));
    const next = Math.max(rules.firstPointLevel, Math.min(rules.maxLevel, value));
    if (next < needed) {
      setLevel(needed);
      setMessage(`Level ${needed} is the lowest that holds the points already spent. Remove points first.`);
      return;
    }
    setLevel(next);
    if (next < rules.dualSpecLevel && !planAhead && active === 1) setActive(0);
  }

  function chooseSet(slot: 0 | 1) {
    if (slot === 1 && !secondOpen) return;
    setActive(slot);
  }

  function share() {
    const code = encodeBuild({ classSlug: catalog.classSlug, specId: catalog.specId, build: catalog.build, ranks });
    setLink(`${window.location.origin}${window.location.pathname}#plan=${code}`);
  }

  // Taps add. A long press (touch or pen) takes a point back, as does a right click, the Delete or
  // Backspace key, and the "Take points back" switch. With the game's tooltips on the page, a long
  // press shows the tooltip instead (a phone has no hover), and the switch is how a phone takes
  // points back.
  function nodeIdOf(target: EventTarget): number | null {
    const el = (target as HTMLElement).closest?.("[data-node]");
    return el ? Number(el.getAttribute("data-node")) : null;
  }
  function onPointerDown(e: PointerEvent<HTMLElement>) {
    suppressClick.current = false;
    const id = nodeIdOf(e.target);
    if (id === null) { setTip((cur) => (cur?.mode === "press" ? null : cur)); return; }
    if (e.pointerType === "mouse") return;
    endPress();
    press.current = setTimeout(() => {
      suppressClick.current = true;
      if (assets) onTip(id, "press");
      else doRemove(id);
    }, LONG_PRESS_MS);
  }
  // Touch browsers also send a context menu event on a long press. Whichever arrives first takes
  // the point back; the other is ignored.
  function onContextMenu(e: React.MouseEvent<HTMLElement>) {
    const id = nodeIdOf(e.target);
    if (id === null) return;
    e.preventDefault();
    if (suppressClick.current) return;
    if (press.current) {
      endPress();
      suppressClick.current = true;
      if (assets) { onTip(id, "press"); return; }
    }
    doRemove(id);
  }
  function endPress() {
    if (press.current) clearTimeout(press.current);
    press.current = null;
  }
  function onClickCapture(e: React.MouseEvent<HTMLElement>) {
    if (suppressClick.current) {
      suppressClick.current = false;
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    const id = nodeIdOf(e.target);
    if (id !== null && removeMode) {
      e.stopPropagation();
      e.preventDefault();
      doRemove(id);
    }
  }
  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    // Typing in the paste box keeps its own undo.
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if (e.key === "Escape") setTip(null);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      travel(e.shiftKey ? redo : undo);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      travel(redo);
      return;
    }
    const id = nodeIdOf(e.target);
    if (id === null) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      doRemove(id);
      return;
    }
    const arrows: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const dir = arrows[e.key];
    if (!dir) return;
    e.preventDefault();
    const from = nodes.get(id)!;
    const peers = catalog.nodes.filter((n) => n.treeId === from.treeId && n.id !== id);
    let target;
    if (dir[0] === 0) {
      // Left and right stay on the row.
      target = peers
        .filter((n) => n.row === from.row && Math.sign(n.col - from.col) === dir[1])
        .sort((a, b) => Math.abs(a.col - from.col) - Math.abs(b.col - from.col))[0];
    } else {
      // Up and down stay in the column if they can; otherwise they go to the next row that has
      // anything, at the nearest column.
      const below = peers.filter((n) => Math.sign(n.row - from.row) === dir[0]);
      target = below
        .filter((n) => n.col === from.col)
        .sort((a, b) => Math.abs(a.row - from.row) - Math.abs(b.row - from.row))[0];
      if (!target && below.length > 0) {
        const nextRow = below.reduce((best, n) => (Math.abs(n.row - from.row) < Math.abs(best - from.row) ? n.row : best), below[0].row);
        target = below
          .filter((n) => n.row === nextRow)
          .sort((a, b) => Math.abs(a.col - from.col) - Math.abs(b.col - from.col))[0];
      }
    }
    if (!target) return;
    setRovingByTree((r) => ({ ...r, [from.treeId]: target.id }));
    document.getElementById(target.kind === "choice" ? `talent-${target.id}-0` : `talent-${target.id}`)?.focus();
  }

  const selectedNode = selected === null ? null : nodes.get(selected) ?? null;

  // The tooltip of the node under the pointer, focus or long press.
  let tipContent: TipContent | null = null;
  let tipAnchor: string | null = null;
  const tipNode = tip ? nodes.get(tip.id) ?? null : null;
  if (assets && tipNode) {
    const rank = ranks[tipNode.id]?.rank ?? 0;
    const choice = tipNode.kind === "choice";
    const entries = choice ? tipNode.entries : [entryAtRank(tipNode, rank)];
    const verdict = canAdd(catalog, ranks, tipNode.id, available);
    tipAnchor = choice ? `talent-${tipNode.id}-0` : `talent-${tipNode.id}`;
    tipContent = {
      title: entries.map((e) => e.name).join(" or "),
      rank: `Rank ${rank}/${tipNode.maxRanks}`,
      text: entries.map((e) => assetOf(assets, e)?.text).filter(Boolean).join("\n\n") || null,
      partial: entries.some((e) => assetOf(assets, e)?.partial),
      lock: verdict.ok || verdict.reason === "max-rank" ? null : refusalText(verdict.reason!, tipNode, catalog, ranks),
      label: `${assets.label} · build ${assets.version}`,
    };
  }
  const classText = CLASS_TEXT[catalog.classSlug];
  const rovingFor = (treeId: number) => rovingByTree[treeId] ?? catalog.nodes.find((n) => n.treeId === treeId)!.id;
  const setName = active === 0 ? "set 1" : "set 2";

  // Take every point out of one tree. Refused when another tree's talents need those points.
  function resetTree(treeId: number, name: string) {
    const next: Ranks = {};
    for (const [id, r] of Object.entries(ranks)) if (nodes.get(Number(id))?.treeId !== treeId) next[Number(id)] = r;
    if (!isLegal(catalog, next)) {
      setMessage(`Talents in another tree need the points in ${name}. Take those back first.`);
      return;
    }
    setActiveRanks(next);
    setMessage(`${name} was reset. Undo brings it back.`);
  }

  // The explanations live in the page's closed "How it works" section; "?" opens it and goes there.
  function openHowTo() {
    const how = document.getElementById(HOW_IT_WORKS_ID);
    if (how instanceof HTMLDetailsElement) how.open = true;
    how?.scrollIntoView({ block: "start" });
  }

  return (
    <div onKeyDown={onKeyDown} data-calculator>
      <Card padding="none">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4 border-b border-line p-4">
          <div className="flex min-w-0 items-center gap-3">
            {classIcon && <GameIcon src={classIcon} size={32} />}
            <span className={`font-semibold ${classText}`}>{catalog.className}</span>
            <span className="font-mono text-sm tabular-nums text-fg-2" aria-label={`Points spent by tree: ${catalog.trees.map((t) => `${t.name} ${perTree.get(t.id)}`).join(", ")}`}>
              {catalog.trees.map((t) => perTree.get(t.id)).join(" / ")}
            </span>
          </div>
          <Stat label="Points left" value={Math.max(0, available - spent)} />
          <Stat label="Level needed" value={spent === 0 ? "–" : levelFor(catalog, spent)} />
          <label className="flex flex-col gap-0.5">
            <span className="text-xs text-muted">Level</span>
            <span className="flex items-center gap-3">
              <span className="w-7 font-mono text-xl font-semibold tabular-nums text-fg">{level}</span>
              <input
                type="range"
                min={rules.firstPointLevel}
                max={rules.maxLevel}
                value={level}
                aria-label="Character level"
                aria-valuetext={`Level ${level}, ${available} talent points`}
                onChange={(e) => setLevelClamped(Number(e.target.value))}
                className="w-32 accent-[rgb(var(--accent))]"
              />
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
            <Segmented
              label="Talent set"
              value={active}
              onChange={chooseSet}
              options={[{ value: 0, label: "Set 1" }, { value: 1, label: "Set 2", disabled: !secondOpen }]}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <button type="button" className="btn text-sm" onClick={() => travel(undo)} disabled={history.past.length === 0}>Undo</button>
          <button type="button" className="btn text-sm" onClick={() => travel(redo)} disabled={history.future.length === 0}>Redo</button>
          <button type="button" className="btn text-sm" onClick={() => { setActiveRanks({}); setMessage("This set was reset. Undo brings it back."); }} disabled={spent === 0}>Reset {setName}</button>
          <button type="button" className="btn text-sm" aria-pressed={removeMode} onClick={() => setRemoveMode(!removeMode)}>
            Take points back: {removeMode ? "on" : "off"}
          </button>
          <button type="button" className="btn size-11 px-0 text-sm" aria-label="How the calculator works" title="How it works" onClick={openHowTo}>?</button>
          {level < rules.dualSpecLevel && (
            <label className="flex min-h-11 items-center gap-3 text-sm text-fg-2">
              <input type="checkbox" checked={planAhead} onChange={(e) => { setPlanAhead(e.target.checked); if (!e.target.checked && active === 1) setActive(0); }} className="size-5" />
              Plan set 2 now (it opens at level {rules.dualSpecLevel})
            </label>
          )}
        </div>

        <p role="status" aria-live="polite" className="min-h-6 px-4 pt-3 text-sm text-fg-2">{message}</p>

        <div className="px-4 pt-3 lg:hidden">
          <Segmented stretch label="Show tree" value={view} onChange={setView} options={catalog.trees.map((t, i) => ({ value: i, label: `${t.name} ${perTree.get(t.id)}` }))} />
        </div>

        <h2 className="sr-only">Talent trees</h2>
        <div className="grid gap-4 p-4 lg:grid-cols-3" onPointerDown={onPointerDown} onPointerUp={endPress} onPointerLeave={endPress} onPointerCancel={endPress} onClickCapture={onClickCapture} onContextMenu={onContextMenu}>
          {catalog.trees.map((tree, i) => {
            const points = perTree.get(tree.id) ?? 0;
            return (
              <section key={tree.id} className={`min-w-0 ${i === view ? "" : "hidden lg:block"}`} aria-label={tree.name}>
                <div className="mb-2 flex items-center gap-3">
                  <h3 className={`text-sm font-semibold ${classText}`}>{tree.name}</h3>
                  <span className={`ml-auto font-mono text-xl font-semibold tabular-nums ${points === 0 ? "text-muted" : "text-fg"}`}>{points}</span>
                  <button type="button" className="min-h-11 px-1 text-sm text-muted hover:text-fg disabled:opacity-50" disabled={points === 0} aria-label={`Reset ${tree.name}`} onClick={() => resetTree(tree.id, tree.name)}>Reset</button>
                </div>
                {(() => {
                  const props = {
                    catalog, tree, ranks, available, spent: points, selected, roving: rovingFor(tree.id), onAdd: doAdd, onTip,
                    onSelect: (id: number) => { setSelected(id); setRovingByTree((r) => ({ ...r, [nodes.get(id)!.treeId]: id })); },
                  };
                  return game ? <GameTree {...props} assets={assets} /> : <TalentTreeView {...props} assets={assets} />;
                })()}
              </section>
            );
          })}
        </div>
        {assets && tipContent && tip && <TalentTooltip anchorId={tipAnchor!} id="talent-tooltip" content={tipContent} />}

        {/* Without the game's tooltips this panel is how a talent's row, needs and spell id are read. With them, the tooltip says it. */}
        {!assets && selectedNode && (
          <section aria-label="Selected talent" className="mx-4 mb-4 space-y-1 rounded-control border border-line bg-canvas p-4 text-sm text-fg-2">
            <p className="font-semibold text-fg">{selectedNode.entries.map((e) => e.name).join(selectedNode.kind === "choice" ? " or " : ", then ")}</p>
            <p className="font-mono text-xs tabular-nums text-muted">
              Row {selectedNode.row}, max rank {selectedNode.maxRanks}
              {selectedNode.entries.map((e) => e.spellId).filter(Boolean).length > 0 && ` · spell id ${selectedNode.entries.map((e) => e.spellId).filter(Boolean).join(", ")}`}
            </p>
            {selectedNode.unlock?.pointsInTree ? <p>Opens after {selectedNode.unlock.pointsInTree} points in this tree, on the rows above.</p> : null}
            {selectedNode.unlock?.pointsTotal ? <p>Opens after {selectedNode.unlock.pointsTotal} points spent in the class&apos;s trees.</p> : null}
            {selectedNode.unlock?.ranksInNodes?.map((r) => <p key={r.nodeId}>Needs {r.ranks} {r.ranks === 1 ? "rank" : "ranks"} in {nameOf(r.nodeId)}.</p>)}
            {selectedNode.prereqs.length > 0 && <p>Needs {selectedNode.prereqs.map(nameOf).join(", ")} at full rank.</p>}
            {(selectedNode.anyOf?.length ?? 0) > 0 && <p>Needs {selectedNode.anyOf!.map(nameOf).join(" or ")} at full rank.</p>}
            <p className="text-muted">Description: not shown yet.</p>
          </section>
        )}

        <section aria-label="Share" className="space-y-3 border-t border-line p-4">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary text-sm" onClick={share} disabled={spent === 0}>Make a share link</button>
            {link && (
              <>
                <label className="sr-only" htmlFor="talent-link">Link to {setName} (game build {catalog.build})</label>
                <Input id="talent-link" mono readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="flex-1 basis-60 text-xs" />
                <button type="button" className="btn text-sm" onClick={() => { void navigator.clipboard?.writeText(link).then(() => setMessage("Link copied."), () => setMessage("Copy failed. Select the link and copy it.")); }}>Copy</button>
              </>
            )}
          </div>
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); load(pasted); }}>
            <label className="sr-only" htmlFor="talent-paste">Share code or link</label>
            <Input id="talent-paste" mono value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Paste a share code or link" className="flex-1 basis-60 text-xs" />
            <button type="submit" className="btn text-sm">Load into {setName}</button>
          </form>
          {report && (
            <section aria-label="What loaded" className="space-y-2 rounded-control border border-line bg-canvas p-4 text-sm text-fg-2">
              <p className="font-semibold text-fg">
                {report.problems.length === 0 ? "Loaded as made." : `Loaded, with ${report.problems.length} ${report.problems.length === 1 ? "change" : "changes"}.`}
              </p>
              <p className="font-mono text-xs text-muted">Made on build {report.codeBuild} · this tree is build {report.treeBuild}</p>
              {report.problems.length > 0 && (
                <ul className="list-disc space-y-1 pl-5">
                  {report.problems.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              )}
            </section>
          )}
        </section>

        {assets && (
          <p className="border-t border-line px-4 py-3 text-xs text-muted" data-game-credit>
            {CREDIT} Icons and text from game build {assets.version}, {assets.label}.
          </p>
        )}
      </Card>
    </div>
  );
}

/** One figure in the calculator's bar: a small label over a mono number. */
function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-mono text-xl font-semibold tabular-nums text-fg">{value}</span>
    </div>
  );
}
