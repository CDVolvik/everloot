"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CLASSES } from "@/design/tokens";
import { CURRENT_BUILD, TABLES, type Evidence, type Scope } from "@/data/raid-buffs";
import {
  CLASS_TREES, SIZES, STATE_LABEL, coverage, decodeRaid, emptySlots, encodeRaid, findCode, groupsOf, resize,
  titleCase, GROUP_SIZE, type ClassName, type FamilyCoverage, type Size, type Slot, type Slots, type State,
} from "@/lib/raid";

const table = TABLES[CURRENT_BUILD];

// Full class-colour class names, written out so Tailwind sees them.
const CLASS_TEXT: Record<ClassName, string> = {
  warrior: "text-class-warrior", paladin: "text-class-paladin", hunter: "text-class-hunter",
  rogue: "text-class-rogue", priest: "text-class-priest", shaman: "text-class-shaman",
  mage: "text-class-mage", warlock: "text-class-warlock", druid: "text-class-druid",
};

const STATE_TEXT: Record<State, string> = {
  covered: "text-accent", cast: "text-fg-2", possible: "text-warning", unknown: "text-warning", missing: "text-danger",
};
const STATE_SHORT: Record<State, string> = { covered: "Yes", cast: "Cast", possible: "Talent", unknown: "Unknown", missing: "No" };

const SCOPE_TEXT: Record<Scope, string> = {
  self: "caster only", single: "one player per cast", party: "party", raid: "raid", area: "players nearby",
  enemy: "enemy", unknown: "reach unknown",
};
const EVIDENCE_TEXT: Record<Evidence, string> = {
  "patch-notes": "from patch notes",
  "classic-assumed": "assumed from Classic Era",
  "client-table": "from game files",
  "not-in-table": "not in the game file table",
};

interface Snapshot { size: Size; slots: Slots }
const HISTORY_LIMIT = 100;

function reach(f: FamilyCoverage): string {
  const scopes = [...new Set(f.entries.map((e) => SCOPE_TEXT[e.scope]))].join(", ");
  const evidence = [...new Set(f.entries.map((e) => EVIDENCE_TEXT[e.evidence]))].join(", ");
  return `${scopes} (${evidence})`;
}

export default function RaidBuilder() {
  const [state, setState] = useState<Snapshot>({ size: 20, slots: emptySlots(20) });
  const [past, setPast] = useState<Snapshot[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [activeGroup, setActiveGroup] = useState(0);
  const [linkBuild, setLinkBuild] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [paste, setPaste] = useState("");
  const [ready, setReady] = useState(false);
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
    if (location.hash.startsWith("#raid=")) load(location.hash.slice(6), false);
    setReady(true);
    // Runs once, on first paint in the browser.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const code = useMemo(() => encodeRaid({ size, build: table.build, slots }), [size, slots]);
  const empty = slots.every((s) => !s);
  const link = typeof window === "undefined" ? "" : `${location.origin}${location.pathname}#raid=${code}`;

  useEffect(() => {
    if (!ready) return;
    const hash = empty ? "" : `#raid=${code}`;
    history.replaceState(null, "", `${location.pathname}${location.search}${hash}`);
  }, [ready, code, empty]);

  useEffect(() => {
    if (selected !== null) pickerRef.current?.focus();
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
  const groups = groupsOf(slots);
  const current = selected === null ? null : slots[selected];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setMessage("Link copied.");
    } catch {
      setMessage("Select the link and copy it.");
    }
  };

  const head = (
    <tr className="text-left text-fg-2">
      <th scope="col" className="sticky left-0 bg-canvas py-2 pr-4 font-medium">Effect</th>
      <th scope="col" className="py-2 pr-4 font-medium">Raid</th>
      {groups.map((_, g) => (
        <th key={g} scope="col" className="py-2 pr-3 font-mono font-medium">G{g + 1}</th>
      ))}
    </tr>
  );

  const row = (f: FamilyCoverage, perGroup: boolean) => (
    <tr key={f.family.id} className="border-t border-line align-top">
      <th scope="row" className="sticky left-0 bg-canvas py-2 pr-4 text-left font-normal">
        <span className="text-fg">{f.family.label}</span>
        <span className="block text-xs text-muted">{reach(f)}</span>
      </th>
      <td className={`py-2 pr-4 ${STATE_TEXT[f.raid]}`}>{STATE_SHORT[f.raid]}</td>
      {perGroup &&
        f.groups.map((s, g) => (
          <td key={g} className={`py-2 pr-3 ${STATE_TEXT[s]}`}>{STATE_SHORT[s]}</td>
        ))}
    </tr>
  );

  return (
    <div className="space-y-8">
      <section aria-labelledby="raid-rules" className="rounded-lg border border-line bg-panel p-4 space-y-1">
        <h2 id="raid-rules" className="text-base font-semibold text-fg">
          Rules for build <span className="font-mono">{table.build}</span>
        </h2>
        <p className="text-sm text-fg-2">{table.label}.</p>
        {linkBuild && (
          <p role="status" className="text-sm text-warning">
            This link was made for build <span className="font-mono">{linkBuild}</span>. This page has rules for build{" "}
            <span className="font-mono">{table.build}</span> only, so coverage uses those.
          </p>
        )}
      </section>

      <section aria-labelledby="raid-layout" className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="raid-layout" className="text-xl font-semibold text-fg">Raid</h2>
          <div role="group" aria-label="Raid size" className="flex gap-2">
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={size === s}
                className={`btn ${size === s ? "border-accent text-accent" : ""}`}
                onClick={() => {
                  if (s === size) return;
                  setSelected(null);
                  setActiveGroup(0);
                  commit({ size: s, slots: resize(slots, s) });
                }}
              >
                {s}
              </button>
            ))}
          </div>
          <button type="button" className="btn" onClick={undo} disabled={past.length === 0}>Undo</button>
          <button
            type="button"
            className="btn"
            disabled={empty}
            onClick={() => { setSelected(null); commit({ size, slots: emptySlots(size) }); }}
          >
            Clear raid
          </button>
          <p role="status" aria-live="polite" className="text-sm text-fg-2">{message}</p>
        </div>

        <div role="tablist" aria-label="Group" className="flex gap-2 overflow-x-auto md:hidden">
          {groups.map((_, g) => (
            <button
              key={g}
              type="button"
              role="tab"
              aria-selected={activeGroup === g}
              className={`btn shrink-0 ${activeGroup === g ? "border-accent text-accent" : ""}`}
              onClick={() => setActiveGroup(g)}
            >
              Group {g + 1}
            </button>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {groups.map((group, g) => (
            <div
              key={g}
              role="group"
              aria-label={`Group ${g + 1}`}
              className={`${g === activeGroup ? "block" : "hidden"} md:block rounded-lg border border-line bg-panel p-3 space-y-2`}
            >
              <h3 className="font-mono text-sm text-muted">Group {g + 1}</h3>
              <ul className="space-y-2">
                {group.map((slot, k) => {
                  const index = g * GROUP_SIZE + k;
                  const treeName = slot && slot.tree ? CLASS_TREES[slot.class][slot.tree - 1] : "any tree";
                  return (
                    <li key={k}>
                      <button
                        type="button"
                        ref={(el) => { slotRefs.current[index] = el; }}
                        aria-pressed={selected === index}
                        aria-label={`Group ${g + 1}, slot ${k + 1}: ${slot ? `${titleCase(slot.class)}, ${treeName}` : "empty"}`}
                        className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-md border px-3 text-left ${
                          selected === index ? "border-accent" : "border-edge"
                        }`}
                        onClick={() => setSelected(selected === index ? null : index)}
                      >
                        {slot ? (
                          <>
                            <span className={`font-medium ${CLASS_TEXT[slot.class]}`}>{titleCase(slot.class)}</span>
                            <span className="text-sm text-fg-2">{treeName}</span>
                          </>
                        ) : (
                          <span className="text-sm text-muted">Empty</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {selected !== null && (
          <div
            ref={pickerRef}
            tabIndex={-1}
            role="group"
            aria-label={`Pick for group ${Math.floor(selected / GROUP_SIZE) + 1}, slot ${(selected % GROUP_SIZE) + 1}`}
            className="rounded-lg border border-accent bg-panel p-4 space-y-4"
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
                  className={`min-h-11 rounded-md border px-3 text-left font-medium ${CLASS_TEXT[c]} ${
                    current?.class === c ? "border-accent" : "border-edge"
                  }`}
                  onClick={() => setSlot(selected, { class: c, tree: current?.class === c ? current.tree : 0 })}
                >
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
                  className={`min-h-11 rounded-md border px-3 text-fg disabled:opacity-50 ${
                    current && current.tree === t ? "border-accent" : "border-edge"
                  }`}
                  onClick={() => current && setSlot(selected, { class: current.class, tree: t })}
                >
                  {t === 0 || !current ? (t === 0 ? "Any tree" : `Tree ${t}`) : CLASS_TREES[current.class][t - 1]}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn" disabled={!current} onClick={() => setSlot(selected, null)}>Clear slot</button>
              <button type="button" className="btn" onClick={closePicker}>Done</button>
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="raid-coverage" className="space-y-4">
        <h2 id="raid-coverage" className="text-xl font-semibold text-fg">Coverage</h2>
        <p role="status" aria-live="polite" className="text-sm text-fg-2">
          Buffs, for the raid: {cov.summary.covered} yes, {cov.summary.cast} by cast, {cov.summary.possible} if talented,{" "}
          {cov.summary.unknown} unknown reach, {cov.summary.missing} missing.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <caption className="pb-2 text-left font-medium text-fg">Buffs, per group</caption>
            <thead>{head}</thead>
            <tbody>{cov.buffs.map((f) => row(f, true))}</tbody>
          </table>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <caption className="pb-2 text-left font-medium text-fg">Debuffs on the enemy</caption>
            <thead>
              <tr className="text-left text-fg-2">
                <th scope="col" className="sticky left-0 bg-canvas py-2 pr-4 font-medium">Effect</th>
                <th scope="col" className="py-2 pr-4 font-medium">Raid</th>
              </tr>
            </thead>
            <tbody>{cov.debuffs.map((f) => row(f, false))}</tbody>
          </table>
        </div>
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
        <h2 id="raid-share" className="text-xl font-semibold text-fg">Share</h2>
        <p className="text-sm text-fg-2">
          The raid is in the link, after the <span className="font-mono">#</span>, so it never reaches our server.
          Anyone with the link sees the same raid.
        </p>
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="raid-link">Share link</label>
          <input id="raid-link" readOnly value={link} className="min-w-0 flex-1 rounded-md border border-edge bg-panel px-3 font-mono text-sm text-fg" />
          <button type="button" className="btn" onClick={copy}>Copy link</button>
        </div>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => { e.preventDefault(); load(paste, true); }}
        >
          <label className="sr-only" htmlFor="raid-paste">Raid code or link</label>
          <input
            id="raid-paste"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="Paste a raid code or link, for example from /everloot raid code"
            className="min-w-0 flex-1 rounded-md border border-edge bg-panel px-3 font-mono text-sm text-fg"
          />
          <button type="submit" className="btn" disabled={!paste.trim()}>Load</button>
        </form>
      </section>
    </div>
  );
}

const LEGEND: Record<State, string> = {
  covered: "A class you picked brings it, and it reaches this group.",
  cast: "A class you picked brings it, but it is cast on one player or a few nearby, so someone has to cast it.",
  possible: "It needs a talent tree, and the only slots of that class are set to any tree.",
  unknown: "A class you picked brings it, but how far it reaches is not known for this build.",
  missing: "No class you picked brings it.",
};
