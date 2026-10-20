"use client";

import { useEffect, useState } from "react";

interface Key { id: string; hint: string; label: string; created_at: string; last_used_at: string | null; revoked_at: string | null }
type State =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "off" }
  | { status: "error"; message: string }
  | { status: "ready"; keys: Key[]; limit: number };

const button = "inline-flex items-center min-h-11 px-3 rounded-lg border border-line text-sm text-fg hover:text-accent disabled:opacity-60";
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "never");

/** The signed-in player's keys on /connect: make one, see when each was last used, revoke one, delete a revoked one. */
export default function ApiKeys() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch("/api/keys", { cache: "no-store" });
        const body = await response.json();
        if (!active) return;
        if (response.status === 401) setState({ status: "signed-out" });
        else if (response.status === 503 && body.error === "API keys are not switched on yet.") setState({ status: "off" });
        else if (!response.ok) setState({ status: "error", message: body.error ?? "Keys are unavailable." });
        else setState({ status: "ready", keys: body.keys, limit: body.limit });
      } catch {
        if (active) setState({ status: "error", message: "Keys are unavailable. Try again." });
      }
    })();
    return () => { active = false; };
  }, [reload]);

  async function send(method: "POST" | "DELETE", url: string, body?: object) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "That did not work. Try again.");
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work. Try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    const made = await send("POST", "/api/keys", { label });
    if (made) { setFresh(made.token); setLabel(""); setReload(reload + 1); }
  }

  async function revoke(id: string, erase = false) {
    if (await send("DELETE", `/api/keys?id=${encodeURIComponent(id)}${erase ? "&erase=1" : ""}`)) setReload(reload + 1);
  }

  if (state.status === "loading") return <p className="text-sm text-muted">Checking your account…</p>;
  if (state.status === "off") return <p className="text-sm text-muted">Keys are not switched on yet. Until they are, every endpoint works without one.</p>;
  if (state.status === "error") return <p role="alert" className="text-sm text-fg">{state.message}</p>;
  if (state.status === "signed-out") {
    return <p className="text-fg-2"><a href="/sign-in" className="text-accent hover:underline underline-offset-4">Sign in</a> to make a key.</p>;
  }
  const live = state.keys.filter((k) => !k.revoked_at);
  return (
    <div className="space-y-4">
      {fresh && (
        <div role="status" className="rounded-xl border border-line bg-panel p-4 space-y-2">
          <p className="text-sm text-fg">Your new key. Copy it now: it is not shown again.</p>
          <code className="block break-all font-mono text-sm text-fg">{fresh}</code>
        </div>
      )}
      {state.keys.length > 0 && (
        <ul className="divide-y divide-line border-y border-line">
          {state.keys.map((k) => (
            <li key={k.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-fg-2">
                <code className="font-mono text-fg">evl_…{k.hint}</code> {k.label && <>· {k.label} </>}· made {day(k.created_at)} · last used {day(k.last_used_at)}
                {k.revoked_at && <> · revoked {day(k.revoked_at)}</>}
              </span>
              {k.revoked_at
                ? <button type="button" className={button} disabled={busy} onClick={() => revoke(k.id, true)}>Delete</button>
                : <button type="button" className={button} disabled={busy} onClick={() => revoke(k.id)}>Revoke</button>}
            </li>
          ))}
        </ul>
      )}
      {live.length < state.limit ? (
        <div className="flex flex-wrap gap-2 items-center">
          <label className="sr-only" htmlFor="key-label">What the key is for</label>
          <input id="key-label" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="What it is for (optional)"
            className="min-h-11 flex-1 min-w-48 rounded-lg border border-line bg-canvas px-3 text-sm text-fg" />
          <button type="button" className={button} disabled={busy} aria-busy={busy} onClick={create}>Make a key</button>
        </div>
      ) : <p className="text-sm text-muted">You have {state.limit} keys. Revoke one to make another.</p>}
      {error && <p role="alert" className="text-sm text-fg">{error}</p>}
    </div>
  );
}
