"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CLASSES } from "@/design/tokens";
import { CURRENT_BUILD, TABLES, type BuffTable, type Scope } from "@/data/game-data/raid";
import {
  treeNames, SIZES, STATE_LABEL, coverage, decodeRaid, emptySlots, encodeRaid, findCode, groupsOf, resize,
  titleCase, GROUP_SIZE, roster, swapSlots,
  type ClassName, type FamilyCoverage, type Size, type Slot, type Slots, type State,
} from "@/lib/raid";
import type { RaidArt } from "@/lib/game-assets";
import GameIcon from "@/components/game/GameIcon";
import SpellTip from "@/components/game/SpellTip";
import { Card, DataTable, Input, SectionHeading, Segmented, type Column } from "@/components/ui";

const table = TABLES[CURRENT_BUILD];

// Full class-colour class names, written out so Tailwind sees them.
const CLASS_TEXT: Record<ClassName, string> = {
  warrior: "text-class-warrior", paladin: "text-class-paladin", hunter: "text-class-hunter",
  rogue: "text-class-rogue", priest: "text-class-priest", shaman: "text-class-shaman",
  mage: "text-class-mage", warlock: "text-class-warlock", druid: "text-class-druid",
};

const CLASS_BORDER: Record<ClassName, string> = {
  warrior: "border-l-class-warrior", paladin: "border-l-class-paladin", hunter: "border-l-class-hunter",
  rogue: "border-l-class-rogue", priest: "border-l-class-priest", shaman: "border-l-class-shaman",
  mage: "border-l-class-mage", warlock: "border-l-class-warlock", druid: "border-l-class-druid",
};

const STATE_TEXT: Record<State, string> = {
  covered: "text-accent", cast: "text-fg-2", possible: "text-warning", unknown: "text-warning", missing: "text-danger",
};
const STATE_SHORT: Record<State, string> = { covered: "Yes", cast: "Cast", possible: "Talent", unknown: "Unknown", missing: "No" };

const SCOPE_TEXT: Record<Scope, string> = {
  self: "caster only", single: "one player per cast", party: "party", raid: "raid", area: "players nearby",
  enemy: "enemy", mixed: "ranks differ", unknown: "reach unknown",
};
interface Snapshot { size: Size; slots: Slots }
const HISTORY_LIMIT = 100;

function reach(f: FamilyCoverage, table: BuffTable): string {
  const scopes = [...new Set(f.entries.map((e) => SCOPE_TEXT[e.scope]))].join(", ");
  const needs = [...new Set(f.entries.flatMap((e) => {
    if (e.tree === "baseline") return [];
    if (e.tree === "unknown") return ["tree unknown"];
    return [`needs a ${table.trees[e.class]?.[e.tree - 1] ?? `tree ${e.tree}`} talent`];
  }))];
  return [scopes, ...needs].join(", ");
}

/**
 * `art`: the game's class, tree and buff icons and the buffs' tooltips (lib/game-assets.ts), or null
 * without the asset URL. The icons sit beside the names, which stay; without them the builder is the
 * text it always was.
 */
/** `initialCode` is the raid from a raid link (/tools/raid/r/<code>), opened when the address has no #raid=. */
export default function RaidBuilder({ art = null, initialCode }: { art?: RaidArt | null; initialCode?: string } = {}) {
  const classIcon = (c: ClassName, size = 20, gap = "mr-2") => {
    const src = art?.classes[c];
    return src ? <GameIcon src={src} size={size} className={gap} /> : null;
  };
  const treeIcon = (c: ClassName, tree: number, size = 20, gap = "mr-2") => {
    const src = tree > 0 ? art?.trees[c]?.[tree - 1] : null;
    return src ? <GameIcon src={src} size={size} className={gap} /> : null;
  };
  const [state, setState] = useState<Snapshot>({ size: 20, slots: emptySlots(20) });
  const [past, setPast] = useState<Snapshot[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [activeGroup, setActiveGroup] = useState(0);
  const [linkBuild, setLinkBuild] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [paste, setPaste] = useState("");
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const { size, slots } = state;

  const commit = useCallback((next: Snapshot) => {
    setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), state]);
    setState(next);
    setLinkBuild(null);
    setMessage("");
  }, [state]);

  const undo = useCallback(() => {
    setPast((p) => {
      const last = p[p.length - 1];
      if (!last) return p;
      setState(last);
      setSelected(null);
      setLinkBuild(null);
      setMessage("Undone.");
      return p.slice(0, -1);
    });
  }, []);

  // Open a link: the plan is in the fragment, which never reaches the server.
  const load = useCallback((text: string, fromPaste: boolean) => {
    const decoded = decodeRaid(findCode(text));
    if (!decoded.ok) { setMessage(decoded.error); return; }
    const { size: s, slots: sl, build } = decoded.value;
    if (fromPaste) setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), state]);
    setState({ size: s, slots: sl });
    setSelected(null);
    setActiveGroup(0);
    setLinkBuild(build !== table.build ? build : null);
    setMessage(build !== table.build ? "" : "Raid loaded.");
  }, [state]);

  useEffect(() => {
    // A raid link carries its code in the path; move it into the planner's #raid= address and read it there.
    if (!location.hash && initialCode) history.replaceState(null, "", `/tools/raid#raid=${initialCode}`);
    if (location.hash.startsWith("#raid=")) load(location.hash.slice(6), false);
    setReady(true);
    // A link pasted into the address bar of this tab changes only the fragment. Our own updates use
    // replaceState, which does not fire this.
    const onHash = () => { if (location.hash.startsWith("#raid=")) load(location.hash.slice(6), false); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
    // Runs once, on first paint in the browser.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const code = useMemo(() => encodeRaid({ size, build: table.build, slots }), [size, slots]);
  const empty = slots.every((s) => !s);
  // The link handed out is the raid link: same raid, and its preview in a chat names the roster.
  const link = typeof window === "undefined" ? "" : `${location.origin}/tools/raid/r/${code}`;

  useEffect(() => {
    if (!ready) return;
    const hash = empty ? "" : `#raid=${code}`;
    history.replaceState(null, "", `${location.pathname}${location.search}${hash}`);
  }, [ready, code, empty]);

  useEffect(() => {
    if (selected !== null) pickerRef.current?.focus();
    setMoveTo("");
  }, [selected]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [undo]);

  const setSlot = (index: number, slot: Slot | null) => {
    const next = [...slots];
    next[index] = slot;
    commit({ size, slots: next });
  };

  const closePicker = () => {
    const i = selected;
    setSelected(null);
    if (i !== null) slotRefs.current[i]?.focus();
  };

  const cov = useMemo(() => coverage(slots, table), [slots]);
  const ros = useMemo(() => roster(slots), [slots]);
  const groups = groupsOf(slots);
  const current = selected === null ? null : slots[selected];

  const place = (i: number) => `group ${Math.floor(i / GROUP_SIZE) + 1}, slot ${(i % GROUP_SIZE) + 1}`;
  const describe = (s: Slot | null) => (s ? `${titleCase(s.class)}, ${s.tree ? treeNames(table, s.class)[s.tree - 1] : "any tree"}` : "empty");

  // Move a member to another slot; an occupied target swaps places. One undo step either way.
  const moveMember = (from: number, to: number) => {
    const next = swapSlots(slots, from, to);
    if (next === slots) return false;
    const mover = slots[from];
    const other = slots[to];
    commit({ size, slots: next });
    setMessage(
      mover && other
        ? `Swapped ${describe(mover)} with ${describe(other)}.`
        : `Moved ${describe(mover ?? other)} to ${place(mover ? to : from)}.`,
    );
    return true;
  };

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setMessage("Link copied.");
    } catch {
      setMessage("Select the link and copy it.");
    }
  };

  // The effect's name, with the game's tooltip on hover and keyboard focus when the page has it, and how far it reaches.
  const effectCell = (f: FamilyCoverage) => (
    <span className="block min-w-[12rem]">
      {art?.familyTips[f.family.id] ? (
        <SpellTip tip={art.familyTips[f.family.id]} size={20}>
          <span tabIndex={0} className="text-fg">{f.family.label}</span>
        </SpellTip>
      ) : (
        <span className="text-fg">
          {art?.families[f.family.id] && <GameIcon src={art.families[f.family.id]!} size={20} className="mr-2" />}
          {f.family.label}
        </span>
      )}
      <span className="block text-xs text-muted">{reach(f, table)}</span>
    </span>
  );
  const stateCell = (s: State) => <span className={`font-medium ${STATE_TEXT[s]}`}>{STATE_SHORT[s]}</span>;
  const buffColumns: Column<FamilyCoverage>[] = [
    { key: "effect", header: "Effect", cell: effectCell },
    { key: "raid", header: "Raid", cell: (f) => stateCell(f.raid), nowrap: true },
    ...groups.map((_, g): Column<FamilyCoverage> => ({ key: `g${g}`, header: `G${g + 1}`, cell: (f) => stateCell(f.groups[g]), nowrap: true })),
  ];
  const debuffColumns = buffColumns.slice(0, 2);

  return (
    <div className="space-y-12">
      {linkBuild && (
        <p role="status" className="text-sm text-warning">
          This link was made for build <span className="font-mono">{linkBuild}</span>. This page has rules for build{" "}
          <span className="font-mono">{table.build}</span> only, so coverage uses those.
        </p>
      )}

      <section aria-labelledby="raid-layout" className="space-y-4">
        <SectionHeading id="raid-layout">Raid</SectionHeading>

        <div role="toolbar" aria-label="Raid controls" className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Segmented
            label="Raid size"
            value={size}
            onChange={(s) => {
              if (s === size) return;
              setSelected(null);
              setActiveGroup(0);
              commit({ size: s, slots: resize(slots, s) });
            }}
            options={SIZES.map((s) => ({ value: s, label: `${s} players` }))}
          />
          <button type="button" className="btn text-sm" onClick={undo} disabled={past.length === 0}>Undo</button>
          <button
            type="button"
            className="btn text-sm"
            disabled={empty}
            onClick={() => { setSelected(null); commit({ size, slots: emptySlots(size) }); }}
          >
            Clear raid
          </button>
          <button type="button" className="btn btn-primary text-sm sm:ml-auto" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
        </div>
        <p role="status" aria-live="polite" className="min-h-5 text-sm text-fg-2">{message}</p>

        <Card padding="none" className="space-y-3 p-4">
          <div role="group" aria-label="Roster summary" className="space-y-3">
            <p className="text-sm text-fg-2">
              <span className="font-medium text-fg">{ros.filled} of {size}</span> slots filled
              {ros.filled > 0 && (
                <>
                  <span aria-hidden="true"> · </span>
                  <span className="font-medium text-fg">Buffs covered: {cov.summary.covered} of {cov.buffs.length}</span>
                </>
              )}
            </p>
            {ros.filled === 0 ? (
              <p className="text-sm text-muted">Pick a slot, then a class. The class count, the role split and the buffs they bring show here.</p>
            ) : (
              <>
                <ul aria-label="Members per class" className="flex flex-wrap gap-2">
                  {CLASSES.filter((c) => ros.classes[c] > 0).map((c) => (
                    <li key={c} className={`inline-flex items-center gap-2 rounded-control border border-current px-3 py-1 text-sm font-medium ${CLASS_TEXT[c]}`}>
                      {classIcon(c, 18, "")}
                      {titleCase(c)}
                      <span className="font-mono text-fg">{ros.classes[c]}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-fg-2">
                  Roles:{" "}
                  <span className="text-fg">{ros.roles.tank} tank{ros.roles.tank === 1 ? "" : "s"}</span>,{" "}
                  <span className="text-fg">{ros.roles.healer} healer{ros.roles.healer === 1 ? "" : "s"}</span>,{" "}
                  <span className="text-fg">{ros.roles.damage} damage</span>
                  {ros.roles.unknown > 0 && <>, <span className="text-fg">{ros.roles.unknown} not known</span> (any tree, or feral)</>}
                </p>
              </>
            )}
          </div>
        </Card>

        <div className="md:hidden">
          <Segmented stretch label="Group" value={activeGroup} onChange={setActiveGroup} options={groups.map((_, g) => ({ value: g, label: `G${g + 1}` }))} />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {groups.map((group, g) => (
            <div key={g} role="group" aria-label={`Group ${g + 1}`} className={`${g === activeGroup ? "block" : "hidden"} min-w-0 md:block`}>
              <Card padding="none" className="space-y-2 p-3">
                <h3 className="text-sm font-semibold text-fg-2">Group {g + 1}</h3>
                <ul className="space-y-2">
                  {group.map((slot, k) => {
                    const index = g * GROUP_SIZE + k;
                    const treeName = slot && slot.tree ? treeNames(table, slot.class)[slot.tree - 1] : "any tree";
                    const over = dragOver === index && dragFrom !== null && dragFrom !== index;
                    return (
                      <li
                        key={k}
                        onDragOver={(e) => {
                          if (dragFrom === null) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          if (dragOver !== index) setDragOver(index);
                        }}
                        onDragLeave={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver((d) => (d === index ? null : d));
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const from = dragFrom;
                          setDragFrom(null);
                          setDragOver(null);
                          if (from === null) return;
                          setSelected(null);
                          moveMember(from, index);
                        }}
                      >
                        <button
                          type="button"
                          ref={(el) => { slotRefs.current[index] = el; }}
                          aria-pressed={selected === index}
                          aria-label={`Group ${g + 1}, slot ${k + 1}: ${slot ? `${titleCase(slot.class)}, ${treeName}` : "empty"}`}
                          onClick={() => setSelected(selected === index ? null : index)}
                          draggable={!!slot}
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", String(index));
                            setDragFrom(index);
                          }}
                          onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
                          className={`flex min-h-14 w-full items-center gap-3 rounded-control border px-3 text-left transition-colors duration-150 ${
                            slot
                              ? `border-l-4 bg-canvas ${CLASS_BORDER[slot.class]} cursor-grab ${selected === index ? "border-accent" : "border-edge hover:border-fg-2"}`
                              : `border-dashed ${selected === index ? "border-accent" : "border-edge hover:border-fg-2"}`
                          } ${over ? "!border-accent bg-panel ring-1 ring-accent" : ""} ${dragFrom === index ? "!border-accent border-dashed" : ""}`}
                        >
                          {slot ? (
                            <>
                              {classIcon(slot.class, 32, "")}
                              <span className="min-w-0">
                                <span className={`block font-medium ${CLASS_TEXT[slot.class]}`}>{titleCase(slot.class)}</span>
                                <span className="flex items-center gap-1.5 text-sm text-fg-2">
                                  {treeIcon(slot.class, slot.tree, 16, "")}
                                  {treeName}
                                </span>
                              </span>
                            </>
                          ) : (
                            <span className="text-sm text-muted"><span aria-hidden="true">+ </span>Add</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </div>
          ))}
        </div>

        {selected !== null && (
          <div
            ref={pickerRef}
            tabIndex={-1}
            role="group"
            aria-label={`Pick for group ${Math.floor(selected / GROUP_SIZE) + 1}, slot ${(selected % GROUP_SIZE) + 1}`}
            className="space-y-4 rounded-card border border-accent bg-panel p-4"
            onKeyDown={(e) => { if (e.key === "Escape") closePicker(); }}
          >
            <h3 className="text-base font-semibold text-fg">
              Group {Math.floor(selected / GROUP_SIZE) + 1}, slot {(selected % GROUP_SIZE) + 1}
            </h3>
            <div role="group" aria-label="Class" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {CLASSES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={current?.class === c}
                  className={`flex min-h-11 items-center gap-2 rounded-control border border-l-4 bg-canvas px-3 text-left font-medium transition-colors ${CLASS_TEXT[c]} ${CLASS_BORDER[c]} ${
                    current?.class === c ? "border-accent" : "border-edge hover:border-fg-2"
                  }`}
                  onClick={() => setSlot(selected, { class: c, tree: current?.class === c ? current.tree : 0 })}
                >
                  {classIcon(c, 24, "")}
                  {titleCase(c)}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Talent tree" className="flex flex-wrap gap-2">
              {([0, 1, 2, 3] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={!current}
                  aria-pressed={!!current && current.tree === t}
                  className={`flex min-h-11 items-center gap-2 rounded-control border px-3 disabled:opacity-50 ${current ? CLASS_TEXT[current.class] : "text-fg"} ${
                    current && current.tree === t ? "border-accent" : "border-edge"
                  }`}
                  onClick={() => current && setSlot(selected, { class: current.class, tree: t })}
                >
                  {current && treeIcon(current.class, t, 24, "")}
                  {t === 0 || !current ? (t === 0 ? "Any tree" : `Tree ${t}`) : treeNames(table, current.class)[t - 1]}
                </button>
              ))}
            </div>
            {current && (
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="raid-move" className="text-sm text-fg-2">Move to</label>
                <select
                  id="raid-move"
                  value={moveTo}
                  onChange={(e) => setMoveTo(e.target.value)}
                  className="min-h-11 rounded-control border border-edge bg-canvas px-3 text-sm text-fg"
                >
                  <option value="">Choose a slot</option>
                  {slots.map((s, i) => i === selected ? null : (
                    <option key={i} value={i}>{`Group ${Math.floor(i / GROUP_SIZE) + 1}, slot ${(i % GROUP_SIZE) + 1}: ${describe(s)}`}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn"
                  disabled={moveTo === ""}
                  onClick={() => {
                    const to = Number(moveTo);
                    setMoveTo("");
                    if (moveMember(selected, to)) {
                      setSelected(to);
                      setActiveGroup(Math.floor(to / GROUP_SIZE));
                    }
                  }}
                >
                  Move
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" className="btn" disabled={!current} onClick={() => setSlot(selected, null)}>Clear slot</button>
              <button type="button" className="btn" onClick={closePicker}>Done</button>
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="raid-coverage" className="space-y-4">
        <SectionHeading
          id="raid-coverage"
          note={
            <span role="status" aria-live="polite">
              Buffs, for the raid: {cov.summary.covered} yes, {cov.summary.cast} by cast, {cov.summary.possible} if talented,{" "}
              {cov.summary.unknown} unknown reach, {cov.summary.missing} missing.
            </span>
          }
        >
          Coverage
        </SectionHeading>
        <DataTable caption="Buffs, per group" columns={buffColumns} rows={cov.buffs} rowKey={(f) => f.family.id} />
        <DataTable caption="Debuffs on the enemy" columns={debuffColumns} rows={cov.debuffs} rowKey={(f) => f.family.id} />
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          {(Object.keys(STATE_LABEL) as State[]).map((s) => (
            <div key={s} className="contents">
              <dt className={`font-medium ${STATE_TEXT[s]}`}>{STATE_SHORT[s]}</dt>
              <dd className="text-fg-2">{LEGEND[s]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="raid-share" className="space-y-3">
        <SectionHeading id="raid-share" note="Anyone with the link sees the same raid.">Share</SectionHeading>
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="raid-link">Share link</label>
          <Input id="raid-link" mono readOnly value={link} className="flex-1 basis-60 text-sm" />
          <button type="button" className="btn" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
        </div>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => { e.preventDefault(); load(paste, true); }}
        >
          <label className="sr-only" htmlFor="raid-paste">Raid code or link</label>
          <Input
            id="raid-paste"
            mono
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="Paste a raid code or link, for example from /everloot raid code"
            className="flex-1 basis-60 text-sm"
          />
          <button type="submit" className="btn" disabled={!paste.trim()}>Load</button>
        </form>
      </section>
    </div>
  );
}

const LEGEND: Record<State, string> = {
  covered: "A class you picked brings it, and it reaches this group.",
  possible: "A class you picked brings it with a talent in one tree, and the only slots of that class are set to any tree.",
  cast: "A class you picked brings it, but it is cast on one player or a few nearby, so someone has to cast it.",
  unknown: "A class you picked brings it, but the game files do not settle how far it reaches, its ranks disagree, or the tree that gives it is not clear.",
  missing: "No class you picked brings it.",
};
