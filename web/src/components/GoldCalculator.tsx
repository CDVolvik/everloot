"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Field, Input, SectionHeading, Segmented } from "@/components/ui";

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
  const [announcement, setAnnouncement] = useState("");

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

  // Announce after typing settles; a live region updated on every keystroke talks over the user.
  useEffect(() => {
    const timer = setTimeout(
      () => setAnnouncement(`Gold per hour ${formatGold(calc.perHour)}. Total ${formatGold(calc.total)}.`),
      750,
    );
    return () => clearTimeout(timer);
  }, [calc.perHour, calc.total]);

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
      `via Everloot`,
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
      <div className="grid items-end gap-3 sm:grid-cols-[1fr,6rem,6rem]">
        <Field
          label={<>Farm name <span className="text-muted">(optional)</span></>}
          type="text"
          placeholder="e.g. Cloth farm"
          value={state.farmName}
          onChange={(e) => patch({ farmName: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-3 sm:contents">
          <Field
            label="Hours"
            type="number"
            min={0}
            mono
            value={state.hours}
            onChange={(e) =>
              patch({ hours: Math.max(0, Number(e.target.value) || 0) })
            }
          />
          <Field
            label="Minutes"
            type="number"
            min={0}
            max={59}
            mono
            value={state.minutes}
            onChange={(e) =>
              patch({
                minutes: Math.min(59, Math.max(0, Number(e.target.value) || 0)),
              })
            }
          />
        </div>
      </div>

      {/* Items */}
      <section aria-labelledby="gph-items">
        <SectionHeading
          id="gph-items"
          action={
            <button onClick={addItem} className="btn min-h-11 px-3 text-sm">
              + Add item
            </button>
          }
        >
          Items looted
        </SectionHeading>

        <Card padding="none">
          <div className="hidden grid-cols-[minmax(0,1fr),100px,120px,130px,44px] gap-2 border-b border-line bg-canvas px-4 py-2 font-mono text-xs text-muted md:grid">
            <div>Item</div>
            <div>Quantity</div>
            <div>Price each (g)</div>
            <div>Value {state.ahCut && <span className="text-muted">(net)</span>}</div>
            <div />
          </div>

          <div className="divide-y divide-line">
            {state.items.map((it, idx) => {
              const line = calc.itemLines[idx];
              return (
                <div
                  key={it.id}
                  className="grid grid-cols-2 items-center gap-2 px-4 py-3 md:grid-cols-[minmax(0,1fr),100px,120px,130px,44px]"
                >
                  <label className="col-span-2 min-w-0 md:col-span-1">
                    <span className="sr-only">Item {idx + 1} name</span>
                    <Input
                      type="text"
                      placeholder="Item name"
                      value={it.name}
                      onChange={(e) => updateItem(it.id, { name: e.target.value })}
                    />
                  </label>
                  <label className="min-w-0">
                    <span className="mb-1 block text-xs text-muted md:sr-only">Item {idx + 1} quantity</span>
                    <Input
                      type="number"
                      min={0}
                      mono
                      placeholder="Qty"
                      value={it.qty || ""}
                      onChange={(e) =>
                        updateItem(it.id, { qty: Number(e.target.value) || 0 })
                      }
                    />
                  </label>
                  <label className="min-w-0">
                    <span className="mb-1 block text-xs text-muted md:sr-only">Item {idx + 1} price each (g)</span>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      mono
                      placeholder="Gold"
                      value={it.price || ""}
                      onChange={(e) =>
                        updateItem(it.id, { price: Number(e.target.value) || 0 })
                      }
                    />
                  </label>
                  <div className="font-mono text-sm tabular-nums text-accent">
                    {formatGold(line?.net ?? 0)}
                  </div>
                  <button
                    onClick={() => removeItem(it.id)}
                    aria-label={`Remove item ${idx + 1}`}
                    disabled={state.items.length === 1}
                    className="btn min-h-11 min-w-11 justify-self-end px-0 hover:border-danger hover:text-danger disabled:opacity-40"
                  >
                    &times;
                  </button>
                </div>
              );
            })}
          </div>
        </Card>
      </section>

      {/* Extras */}
      <div className="grid items-end gap-4 sm:grid-cols-2">
        <Field
          label={<>Vendor / extra gold <span className="text-muted">(optional)</span></>}
          type="number"
          min={0}
          step="0.01"
          mono
          value={state.vendorGold || ""}
          onChange={(e) =>
            patch({ vendorGold: Number(e.target.value) || 0 })
          }
          placeholder="Lump sum from trash / quests"
        />
        <div className="space-y-1 text-sm">
          <span className="block text-muted">Auction house cut</span>
          <Segmented
            label="Auction house cut"
            value={state.ahCut ? "on" : "off"}
            onChange={(v) => patch({ ahCut: v === "on" })}
            options={[
              { value: "on", label: "Subtract 5%" },
              { value: "off", label: "No cut" },
            ]}
          />
        </div>
      </div>

      {/* Results */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-xs text-muted">
              Gold per hour
            </p>
            <p className="mt-1 text-5xl font-bold leading-none tabular-nums text-accent sm:text-6xl">
              {formatCompactGold(calc.perHour)}
            </p>
            <p className="mt-2 font-mono text-sm tabular-nums text-fg-2">
              {formatGold(calc.perHour)} / hr
            </p>
          </div>
          <div className="min-w-[220px] space-y-1 text-sm text-fg-2">
            <div className="flex justify-between gap-6">
              <span>Items subtotal</span>
              <span className="font-mono tabular-nums">{formatGold(calc.itemsSubtotal)}</span>
            </div>
            {state.vendorGold > 0 && (
              <div className="flex justify-between gap-6">
                <span>Vendor gold</span>
                <span className="font-mono tabular-nums">{formatGold(state.vendorGold)}</span>
              </div>
            )}
            <div className="mt-2 flex justify-between gap-6 border-t border-line pt-1 text-fg">
              <span>Total</span>
              <span className="font-mono font-semibold tabular-nums text-accent">
                {formatGold(calc.total)}
              </span>
            </div>
            <div className="flex justify-between gap-6 text-xs text-muted">
              <span>Duration</span>
              <span className="font-mono tabular-nums">
                {state.hours}h {state.minutes}m
              </span>
            </div>
          </div>
        </div>

        {calc.best && calc.best.net > 0 && (
          <p className="mt-6 text-sm text-fg-2">
            Biggest earner:{" "}
            <span className="text-accent">{calc.best.name || "Unnamed item"}</span>{" "}
            &mdash; {formatGold(calc.best.net)} (
            {Math.round(calc.best.share * 100)}% of total)
          </p>
        )}
      </Card>

      {/* One polite announcement for screen readers: settled results, and copy feedback the buttons only show visually. */}
      <p role="status" aria-live="polite" className="sr-only">
        {copied === "link" ? "Share link copied." : copied === "summary" ? "Summary copied." : announcement}
      </p>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 text-sm">
        <button
          onClick={shareLink}
          className="btn btn-primary min-h-11"
        >
          {copied === "link" ? "Link copied" : "Copy share link"}
        </button>
        <button
          onClick={copySummary}
          className="btn min-h-11"
        >
          {copied === "summary" ? "Summary copied" : "Copy summary for Discord"}
        </button>
        <button
          onClick={resetAll}
          className="btn min-h-11 hover:border-danger hover:text-danger ml-auto"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
