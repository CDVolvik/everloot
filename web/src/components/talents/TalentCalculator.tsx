"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { importCode, type ImportReport } from "@/lib/talents/import";
import {
  add, canAdd, canRemove, commit, nodeMap, pointsAtLevel, pointsByTree, pointsSpent, redo, refusalText,
  remove, startHistory, undo, levelFor, type History,
} from "@/lib/talents/rules";
import { encodeBuild } from "@/lib/talents/share";
import type { Ranks, TalentCatalog } from "@/lib/talents/types";
import TalentTreeView, { CLASS_TEXT } from "./TalentTreeView";

// Client side of the calculator: the point rules live in lib/talents/rules.ts, this file only holds
// state and wires clicks, long presses and keys to them.

type Sets = [Ranks, Ranks];
const LONG_PRESS_MS = 500;

export default function TalentCalculator({ catalog }: { catalog: TalentCatalog }) {
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
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);

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
      setMessage(verdict.ok ? "" : refusalText(verdict.reason!, node, catalog));
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
      setMessage(refusalText(verdict.reason!, node, catalog));
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
  // Backspace key, and the "Take points back" switch.
  function nodeIdOf(target: EventTarget): number | null {
    const el = (target as HTMLElement).closest?.("[data-node]");
    return el ? Number(el.getAttribute("data-node")) : null;
  }
  function onPointerDown(e: PointerEvent<HTMLElement>) {
    suppressClick.current = false;
    const id = nodeIdOf(e.target);
    if (id === null || e.pointerType === "mouse") return;
    endPress();
    press.current = setTimeout(() => {
      suppressClick.current = true;
      doRemove(id);
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
  const classText = CLASS_TEXT[catalog.classSlug];
  const rovingFor = (treeId: number) => rovingByTree[treeId] ?? catalog.nodes.find((n) => n.treeId === treeId)!.id;

  return (
    <div className="space-y-5" onKeyDown={onKeyDown}>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Talent sets">
        <button type="button" className="btn text-sm" aria-pressed={active === 0} onClick={() => chooseSet(0)}>
          First set{active === 0 ? " (editing)" : ""}
        </button>
        <button type="button" className="btn text-sm" aria-pressed={active === 1} aria-disabled={!secondOpen} onClick={() => chooseSet(1)}>
          Second set{active === 1 ? " (editing)" : ""}
        </button>
        {!secondOpen && <span className="text-sm text-muted">The second set opens at level {rules.dualSpecLevel}.</span>}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="flex items-center gap-3 text-sm text-fg-2">
          <span>Level <span className="font-mono tabular-nums text-fg">{level}</span></span>
          <input
            type="range"
            min={rules.firstPointLevel}
            max={rules.maxLevel}
            value={level}
            aria-valuetext={`Level ${level}, ${available} talent points`}
            onChange={(e) => setLevelClamped(Number(e.target.value))}
            className="w-40 accent-[rgb(var(--accent))]"
          />
        </label>
        {level < rules.dualSpecLevel && (
          <label className="flex min-h-11 items-center gap-3 text-sm text-fg-2">
            <input type="checkbox" checked={planAhead} onChange={(e) => { setPlanAhead(e.target.checked); if (!e.target.checked && active === 1) setActive(0); }} className="size-5" />
            Plan the second set before level {rules.dualSpecLevel}
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn text-sm" onClick={() => travel(undo)} disabled={history.past.length === 0}>Undo</button>
        <button type="button" className="btn text-sm" onClick={() => travel(redo)} disabled={history.future.length === 0}>Redo</button>
        <button type="button" className="btn text-sm" onClick={() => { setActiveRanks({}); setMessage("This set was reset. Undo brings it back."); }} disabled={spent === 0}>Reset this set</button>
        <button type="button" className="btn text-sm" aria-pressed={removeMode} onClick={() => setRemoveMode(!removeMode)}>
          Take points back: {removeMode ? "on" : "off"}
        </button>
      </div>

      <p className="font-mono text-sm tabular-nums text-fg-2" aria-label="Points spent by tree">
        {catalog.trees.map((t, i) => (
          <span key={t.id}>
            {i > 0 && <span className="text-muted"> / </span>}
            <span className={classText}>{t.name}</span> {perTree.get(t.id)}
          </span>
        ))}
        <span className="text-muted"> · </span>
        {spent} of {available} points spent, {Math.max(0, available - spent)} left
      </p>

      <p role="status" aria-live="polite" className="min-h-6 text-sm text-fg-2">{message}</p>

      <div className="flex gap-2 md:hidden" role="group" aria-label="Show tree">
        {catalog.trees.map((t, i) => (
          <button key={t.id} type="button" className="btn flex-1 px-2 text-sm" aria-pressed={view === i} onClick={() => setView(i)}>{t.name}</button>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-6" onPointerDown={onPointerDown} onPointerUp={endPress} onPointerLeave={endPress} onPointerCancel={endPress} onClickCapture={onClickCapture} onContextMenu={onContextMenu}>
        {catalog.trees.map((tree, i) => (
          <section key={tree.id} className={i === view ? "" : "hidden md:block"} aria-label={tree.name}>
            <h2 className={`mb-3 text-center font-mono text-sm ${classText}`}>{tree.name} · {perTree.get(tree.id)}</h2>
            <TalentTreeView
              catalog={catalog}
              tree={tree}
              ranks={ranks}
              available={available}
              spent={perTree.get(tree.id) ?? 0}
              selected={selected}
              roving={rovingFor(tree.id)}
              onAdd={doAdd}
              onSelect={(id) => { setSelected(id); setRovingByTree((r) => ({ ...r, [nodes.get(id)!.treeId]: id })); }}
            />
          </section>
        ))}
      </div>
      <p className="text-xs text-muted">
        The small number at the left of each row is how many points must be spent in the tree, on the rows above, before that row opens (from the game tables, unconfirmed).
        Tap or press Enter to add a point. Right click, long press, Delete or the switch above takes one back. Arrow keys move between talents.
      </p>

      <section aria-label="Selected talent" className="rounded-lg border border-line bg-panel p-4 text-sm text-fg-2 space-y-1">
        {selectedNode ? (
          <>
            <p className="text-fg font-semibold">{selectedNode.entries.map((e) => e.name).join(selectedNode.kind === "choice" ? " or " : ", then ")}</p>
            <p className="font-mono text-xs tabular-nums text-muted">
              Row {selectedNode.row}, max rank {selectedNode.maxRanks}
              {selectedNode.entries.map((e) => e.spellId).filter(Boolean).length > 0 && ` · spell id ${selectedNode.entries.map((e) => e.spellId).filter(Boolean).join(", ")}`}
            </p>
            {selectedNode.unlock?.pointsInTree ? <p>Opens after {selectedNode.unlock.pointsInTree} points in this tree, on the rows above.</p> : null}
            {selectedNode.unlock?.ranksInNode ? <p>Needs {selectedNode.unlock.ranksInNode.ranks} {selectedNode.unlock.ranksInNode.ranks === 1 ? "rank" : "ranks"} in {nameOf(selectedNode.unlock.ranksInNode.nodeId)}.</p> : null}
            {selectedNode.prereqs.length > 0 && <p>Needs {selectedNode.prereqs.map(nameOf).join(", ")} at full rank.</p>}
            {(selectedNode.anyOf?.length ?? 0) > 0 && <p>Needs {selectedNode.anyOf!.map(nameOf).join(" or ")} at full rank.</p>}
            <p className="text-muted">Description: not shown yet.</p>
          </>
        ) : (
          <p>Select a talent to see its row, prerequisites and spell id.</p>
        )}
      </section>

      <section aria-label="Share" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary text-sm" onClick={share} disabled={spent === 0}>Make a share link</button>
        </div>
        {link && (
          <div className="space-y-1">
            <label className="block text-sm text-fg-2" htmlFor="talent-link">Link to the {active === 0 ? "first" : "second"} set (game build {catalog.build})</label>
            <div className="flex gap-2">
              <input id="talent-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="flex-1 min-w-0 rounded-lg border border-edge bg-panel px-3 font-mono text-xs text-fg" />
              <button type="button" className="btn text-sm" onClick={() => { void navigator.clipboard?.writeText(link).then(() => setMessage("Link copied."), () => setMessage("Copy failed. Select the link and copy it.")); }}>Copy</button>
            </div>
            <p className="text-xs text-muted">The link holds the whole build and names the game build. If talents move, opening it lists what changed.</p>
          </div>
        )}
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); load(pasted); }}>
          <label className="sr-only" htmlFor="talent-paste">Share code or link</label>
          <input id="talent-paste" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Paste a share code or link" className="flex-1 min-w-0 rounded-lg border border-edge bg-panel px-3 font-mono text-xs text-fg" />
          <button type="submit" className="btn text-sm">Load into the {active === 0 ? "first" : "second"} set</button>
        </form>
      </section>

      {report && (
        <section aria-label="What loaded" className="rounded-lg border border-line bg-panel p-4 text-sm text-fg-2 space-y-2">
          <p className="text-fg font-semibold">
            {report.problems.length === 0 ? "Loaded as made." : `Loaded, with ${report.problems.length} ${report.problems.length === 1 ? "change" : "changes"}.`}
          </p>
          <p className="font-mono text-xs text-muted">Made on build {report.codeBuild} · this tree is build {report.treeBuild}</p>
          {report.problems.length > 0 && (
            <ul className="list-disc pl-5 space-y-1">
              {report.problems.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
