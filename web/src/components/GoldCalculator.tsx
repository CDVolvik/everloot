"use client";

import { useEffect, useMemo, useState } from "react";

/* ---------- Types + helpers ---------- */

type Item = {
  id: string;
  name: string;
  qty: number;
  price: number; // gold (as a decimal, e.g. 12.5 = 12g 50s)
};

const newItem = (): Item => ({
  id: Math.random().toString(36).slice(2, 9),
  name: "",
  qty: 1,
  price: 0,
});

/** Format a gold decimal like 1234.567 into "1,234g 56s 70c". */
function formatGold(value: number): string {
  if (!isFinite(value)) return "0g";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const gold = Math.floor(abs);
  const silverDecimal = (abs - gold) * 100;
  const silver = Math.floor(silverDecimal);
  const copper = Math.round((silverDecimal - silver) * 100);
  const goldStr = gold.toLocaleString();
  return `${sign}${goldStr}g ${silver.toString().padStart(2, "0")}s ${copper
    .toString()
    .padStart(2, "0")}c`;
}

/** Format a large number with compact suffixes for the big hero number. */
function formatCompactGold(value: number): string {
  if (!isFinite(value)) return "0g";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}Mg`;
  if (Math.abs(value) >= 10_000) return `${(value / 1_000).toFixed(1)}Kg`;
  return `${Math.round(value).toLocaleString()}g`;
}

/* ---------- URL state (share link) ---------- */

type State = {
  farmName: string;
  hours: number;
  minutes: number;
  vendorGold: number;
  ahCut: boolean;
  items: Item[];
};

const DEFAULT_STATE: State = {
  farmName: "",
  hours: 1,
  minutes: 0,
  vendorGold: 0,
  ahCut: true,
  items: [newItem()],
};

function encodeState(s: State): string {
  // Compact JSON then base64-url. Keeps share links short-ish.
  const slim = {
    n: s.farmName,
    h: s.hours,
    m: s.minutes,
    v: s.vendorGold,
    c: s.ahCut ? 1 : 0,
    i: s.items.map((it) => [it.name, it.qty, it.price]),
  };
  const json = JSON.stringify(slim);
  if (typeof window === "undefined") return "";
  return btoa(unescape(encodeURIComponent(json)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function decodeState(str: string): State | null {
  try {
    const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
    const b64 = (str + pad).replaceAll("-", "+").replaceAll("_", "/");
    const json = decodeURIComponent(escape(atob(b64)));
    const slim = JSON.parse(json);
    return {
      farmName: String(slim.n ?? ""),
      hours: Number(slim.h ?? 1),
      minutes: Number(slim.m ?? 0),
      vendorGold: Number(slim.v ?? 0),
      ahCut: Boolean(slim.c),
      items: (slim.i ?? []).map((t: [string, number, number]) => ({
        id: Math.random().toString(36).slice(2, 9),
        name: String(t[0] ?? ""),
        qty: Number(t[1] ?? 0),
        price: Number(t[2] ?? 0),
      })),
    };
  } catch {
    return null;
  }
}

/* ---------- Component ---------- */

export default function GoldCalculator() {
  const [state, setState] = useState<State>(DEFAULT_STATE);
  const [copied, setCopied] = useState<"link" | "summary" | null>(null);

  // Load state from URL on first mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const s = params.get("s");
    if (s) {
      const decoded = decodeState(s);
      if (decoded) setState(decoded);
    }
  }, []);

  /* ---------- Math ---------- */

  const calc = useMemo(() => {
    const totalMinutes = Math.max(0, state.hours * 60 + state.minutes);
    const totalHours = totalMinutes / 60;

    const itemLines = state.items.map((it) => {
      const gross = it.qty * it.price;
      const net = state.ahCut ? gross * 0.95 : gross;
      return { ...it, gross, net };
    });

    const itemsSubtotal = itemLines.reduce((s, i) => s + i.net, 0);
    const total = itemsSubtotal + (state.vendorGold || 0);
    const perHour = totalHours > 0 ? total / totalHours : 0;

    const withShare = itemLines.map((i) => ({
      ...i,
      share: total > 0 ? i.net / total : 0,
    }));

    const best = [...withShare].sort((a, b) => b.net - a.net)[0];

    return {
      totalMinutes,
      totalHours,
      itemLines: withShare,
      itemsSubtotal,
      total,
      perHour,
      best,
    };
  }, [state]);

  /* ---------- Handlers ---------- */

  const patch = (partial: Partial<State>) =>
    setState((s) => ({ ...s, ...partial }));

  const updateItem = (id: string, partial: Partial<Item>) =>
    setState((s) => ({
      ...s,
      items: s.items.map((it) => (it.id === id ? { ...it, ...partial } : it)),
    }));

  const addItem = () =>
    setState((s) => ({ ...s, items: [...s.items, newItem()] }));

  const removeItem = (id: string) =>
    setState((s) => ({
      ...s,
      items: s.items.length > 1 ? s.items.filter((it) => it.id !== id) : s.items,
    }));

  const resetAll = () => setState({ ...DEFAULT_STATE, items: [newItem()] });

  const shareLink = () => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}${window.location.pathname}?s=${encodeState(
      state
    )}`;
    navigator.clipboard.writeText(url);
    setCopied("link");
    setTimeout(() => setCopied(null), 2000);
  };

  const copySummary = () => {
    const lines = [
      `${state.farmName || "WoW Farm"}: ${formatCompactGold(calc.perHour)}/hr`,
      `Time: ${state.hours}h ${state.minutes}m`,
      `Total: ${formatGold(calc.total)}${state.ahCut ? " (after 5% AH cut)" : ""}`,
      ``,
      ...calc.itemLines
        .filter((i) => i.name && i.net > 0)
        .map(
          (i) =>
            `• ${i.name} x${i.qty} @ ${formatGold(i.price)} = ${formatGold(i.net)}`
        ),
      state.vendorGold ? `• Vendor gold: ${formatGold(state.vendorGold)}` : "",
      ``,
      `via GoldGoblin.gg`,
    ]
      .filter(Boolean)
      .join("\n");
    navigator.clipboard.writeText(lines);
    setCopied("summary");
    setTimeout(() => setCopied(null), 2000);
  };

  /* ---------- Render ---------- */

  return (
    <div className="space-y-8">
      {/* Header row: farm name */}
      <div className="grid sm:grid-cols-[1fr,auto,auto] gap-3 items-end">
        <label className="block">
          <span className="block text-xs uppercase tracking-wider text-parchment-100/60 mb-1">
            Farm name <span className="text-parchment-100/30">(optional)</span>
          </span>
          <input
            type="text"
            placeholder="e.g. Revendreth cloth run"
            value={state.farmName}
            onChange={(e) => patch({ farmName: e.target.value })}
            className="w-full rounded-lg bg-parchment-900/60 border border-parchment-100/10 px-3 py-2 text-parchment-100 placeholder:text-parchment-100/30 focus:border-gold-400 outline-none"
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wider text-parchment-100/60 mb-1">
            Hours
          </span>
          <input
            type="number"
            min={0}
            value={state.hours}
            onChange={(e) =>
              patch({ hours: Math.max(0, Number(e.target.value) || 0) })
            }
            className="w-24 rounded-lg bg-parchment-900/60 border border-parchment-100/10 px-3 py-2 text-parchment-100 focus:border-gold-400 outline-none"
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wider text-parchment-100/60 mb-1">
            Minutes
          </span>
          <input
            type="number"
            min={0}
            max={59}
            value={state.minutes}
            onChange={(e) =>
              patch({
                minutes: Math.min(59, Math.max(0, Number(e.target.value) || 0)),
              })
            }
            className="w-24 rounded-lg bg-parchment-900/60 border border-parchment-100/10 px-3 py-2 text-parchment-100 focus:border-gold-400 outline-none"
          />
        </label>
      </div>

      {/* Items */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl text-parchment-100">Items looted</h2>
          <button
            onClick={addItem}
            className="text-sm px-3 py-1.5 rounded-md border border-parchment-100/20 hover:border-gold-400/60 hover:text-gold-400 transition"
          >
            + Add item
          </button>
        </div>

        <div className="rounded-xl border border-parchment-100/10 overflow-hidden">
          <div className="hidden md:grid grid-cols-[1fr,100px,140px,140px,40px] gap-2 px-4 py-2 bg-parchment-900/40 text-xs uppercase tracking-wider text-parchment-100/50">
            <div>Item</div>
            <div>Quantity</div>
            <div>Price each (g)</div>
            <div>Value {state.ahCut && <span className="text-gold-500/70">(net)</span>}</div>
            <div />
          </div>

          <div className="divide-y divide-parchment-100/5">
            {state.items.map((it, idx) => {
              const line = calc.itemLines[idx];
              return (
                <div
                  key={it.id}
                  className="grid grid-cols-2 md:grid-cols-[1fr,100px,140px,140px,40px] gap-2 px-4 py-3 items-center"
                >
                  <input
                    type="text"
                    placeholder="e.g. Shrouded Cloth"
                    value={it.name}
                    onChange={(e) => updateItem(it.id, { name: e.target.value })}
                    className="col-span-2 md:col-span-1 rounded-md bg-parchment-950/60 border border-parchment-100/10 px-3 py-2 text-sm text-parchment-100 placeholder:text-parchment-100/30 focus:border-gold-400 outline-none"
                  />
                  <input
                    type="number"
                    min={0}
                    placeholder="Qty"
                    value={it.qty || ""}
                    onChange={(e) =>
                      updateItem(it.id, { qty: Number(e.target.value) || 0 })
                    }
                    className="rounded-md bg-parchment-950/60 border border-parchment-100/10 px-3 py-2 text-sm text-parchment-100 focus:border-gold-400 outline-none"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Gold"
                    value={it.price || ""}
                    onChange={(e) =>
                      updateItem(it.id, { price: Number(e.target.value) || 0 })
                    }
                    className="rounded-md bg-parchment-950/60 border border-parchment-100/10 px-3 py-2 text-sm text-parchment-100 focus:border-gold-400 outline-none"
                  />
                  <div className="text-sm text-gold-300 tabular-nums">
                    {formatGold(line?.net ?? 0)}
                  </div>
                  <button
                    onClick={() => removeItem(it.id)}
                    aria-label="Remove item"
                    className="text-parchment-100/40 hover:text-red-400 transition text-lg justify-self-end"
                  >
                    &times;
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Extras */}
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="block text-xs uppercase tracking-wider text-parchment-100/60 mb-1">
            Vendor / extra gold <span className="text-parchment-100/30">(optional)</span>
          </span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={state.vendorGold || ""}
            onChange={(e) =>
              patch({ vendorGold: Number(e.target.value) || 0 })
            }
            placeholder="Lump sum from trash / quests"
            className="w-full rounded-lg bg-parchment-900/60 border border-parchment-100/10 px-3 py-2 text-parchment-100 placeholder:text-parchment-100/30 focus:border-gold-400 outline-none"
          />
        </label>

        <label className="flex items-center gap-3 rounded-lg border border-parchment-100/10 px-3 py-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={state.ahCut}
            onChange={(e) => patch({ ahCut: e.target.checked })}
            className="h-4 w-4 accent-gold-500"
          />
          <span className="text-sm text-parchment-100/90">
            Subtract 5% auction house cut from AH items
          </span>
        </label>
      </div>

      {/* Results */}
      <div className="rounded-2xl border border-gold-500/30 bg-gradient-to-br from-gold-500/5 to-transparent p-6">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-gold-500/80">
              Gold per hour
            </p>
            <p className="font-display text-5xl sm:text-6xl font-bold text-gold-400 tabular-nums leading-none mt-1">
              {formatCompactGold(calc.perHour)}
            </p>
            <p className="text-sm text-parchment-100/70 mt-2">
              {formatGold(calc.perHour)} / hr
            </p>
          </div>
          <div className="text-sm text-parchment-100/70 space-y-1 min-w-[220px]">
            <div className="flex justify-between gap-6">
              <span>Items subtotal</span>
              <span className="tabular-nums">{formatGold(calc.itemsSubtotal)}</span>
            </div>
            {state.vendorGold > 0 && (
              <div className="flex justify-between gap-6">
                <span>Vendor gold</span>
                <span className="tabular-nums">{formatGold(state.vendorGold)}</span>
              </div>
            )}
            <div className="flex justify-between gap-6 pt-1 border-t border-parchment-100/10 mt-2 text-parchment-100">
              <span>Total</span>
              <span className="tabular-nums font-semibold text-gold-300">
                {formatGold(calc.total)}
              </span>
            </div>
            <div className="flex justify-between gap-6 text-xs text-parchment-100/50">
              <span>Duration</span>
              <span>
                {state.hours}h {state.minutes}m
              </span>
            </div>
          </div>
        </div>

        {calc.best && calc.best.net > 0 && (
          <p className="mt-5 text-sm text-parchment-100/70">
            💡 Biggest earner:{" "}
            <span className="text-gold-300">{calc.best.name || "Unnamed item"}</span>{" "}
            &mdash; {formatGold(calc.best.net)} (
            {Math.round(calc.best.share * 100)}% of total)
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 text-sm">
        <button
          onClick={shareLink}
          className="px-4 py-2 rounded-lg bg-gold-500 text-parchment-950 font-medium hover:bg-gold-400 transition"
        >
          {copied === "link" ? "✓ Link copied" : "Copy share link"}
        </button>
        <button
          onClick={copySummary}
          className="px-4 py-2 rounded-lg border border-parchment-100/20 hover:border-gold-400/60 hover:text-gold-400 transition"
        >
          {copied === "summary" ? "✓ Summary copied" : "Copy summary for Discord"}
        </button>
        <button
          onClick={resetAll}
          className="px-4 py-2 rounded-lg border border-parchment-100/10 hover:border-red-400/50 hover:text-red-400 transition ml-auto"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
