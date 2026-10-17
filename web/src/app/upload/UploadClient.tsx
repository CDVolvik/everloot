"use client";
import { useMemo, useRef, useState } from "react";
import { parseEverlootLua } from "@/lib/sv-parse";
import { prepareUpload, sendBatches, type SharingChoices, type UploadSession } from "@/lib/upload-batches";
import type { SharingCategory } from "../../../../kb/src/publication";

const categories: { key: SharingCategory; label: string }[] = [
  { key: "guild", label: "Guild roster, attendance, progression and loot" },
  { key: "gear", label: "My character's gear" },
  { key: "gold", label: "My character's gold and money events" },
  { key: "collection", label: "My collection ownership" },
];
const button = "btn btn-primary disabled:opacity-50";
const outlineButton = "btn";
const input = "w-full rounded-lg border border-line bg-canvas p-3 text-base text-fg";

export default function UploadClient() {
  const [payload, setPayload] = useState<unknown>(null);
  const [choices, setChoices] = useState<SharingChoices>({});
  const [tokens, setTokens] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<UploadSession | null>(null);
  const [, refresh] = useState(0);
  const saved = useRef<UploadSession | null>(null);
  const loadId = useRef(0);
  const [withdrawToken, setWithdrawToken] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawStatus, setWithdrawStatus] = useState("");
  const prepared = useMemo(() => {
    if (!payload) return { value: null, error: null };
    try { return { value: prepareUpload(payload, choices, tokens.split(/\s+/).filter(Boolean)), error: null }; }
    catch (e) { return { value: null, error: e instanceof Error ? e.message : "Could not prepare this file." }; }
  }, [payload, choices, tokens]);
  const busy = sending || loading;
  function resetSession() { saved.current = null; setSession(null); setError(null); }
  async function loadFile(file: File) {
    if (busy) return;
    const id = ++loadId.current;
    resetSession(); setPayload(null); setChoices({}); setTokens(""); setLoading(true);
    try {
      if (file.size > 20_000_000) throw new Error("This file exceeds 20 MB. Keep the original and split it before uploading.");
      const text = await file.text();
      let value: unknown;
      if (/\.lua$/i.test(file.name) || /EverlootDB\s*=/.test(text.slice(0, 500))) {
        const parsed = parseEverlootLua(text);
        value = { addonVersion: parsed.version, records: parsed.records };
      } else value = JSON.parse(text);
      prepareUpload(value, {}, []);
      if (loadId.current === id) setPayload(value);
    } catch (e) { if (loadId.current === id) setError(e instanceof Error ? e.message : "Could not read this file."); }
    finally { if (loadId.current === id) setLoading(false); }
  }
  function sample() {
    if (busy) return;
    resetSession(); setChoices({}); setTokens("");
    const base = { installId: `sample-${crypto.randomUUID()}`, capturedAt: new Date().toISOString() };
    setPayload({ addonVersion: "0.2.0", records: [
      { ...base, eventId: "sample:1", kind: "npc_sighting", npcId: 1234, name: "Forest Spider", mapId: 141, x: 42.5, y: 61, level: 60, reaction: "hostile" },
      { ...base, eventId: "sample:2", kind: "loot", sourceNpcId: 1234, items: [{ itemId: 456, count: 2 }] },
    ] });
  }
  async function send() {
    if (!prepared.value || busy) return;
    const active = saved.current ?? prepared.value;
    saved.current = active; setSession(active); setSending(true); setError(null);
    try { await sendBatches(active, fetch, () => refresh((n) => n + 1)); }
    catch (e) { setError(e instanceof Error ? e.message : "Network error. Keep your file and retry."); }
    finally { setSending(false); refresh((n) => n + 1); }
  }
  async function withdraw(action: "revoke" | "opt-out") {
    setWithdrawing(true); setWithdrawStatus("");
    try {
      const response = await fetch(`/api/sharing/revoke?action=${action}`, { method: "POST", headers: { Authorization: `Bearer ${withdrawToken.trim()}` } });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Withdrawal was not confirmed.");
      setWithdrawStatus(action === "revoke" ? "Grant revoked. It no longer authorizes public records." : "Character opted out. Named records are withheld across guild and character views.");
      setWithdrawToken(""); resetSession();
    } catch (e) { setWithdrawStatus(e instanceof Error ? e.message : "Network error. Retry withdrawal."); }
    finally { setWithdrawing(false); }
  }
  const accepted = session?.receipts.reduce((n, receipt) => n + (receipt.accepted?.length ?? 0), 0) ?? 0;
  const rejected = session?.receipts.reduce((n, receipt) => n + (receipt.rejected?.length ?? 0), 0) ?? 0;
  const complete = !!session && session.next === session.batches.length;
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-dashed border-line bg-panel p-6 text-center"
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (!busy && e.dataTransfer.files[0]) void loadFile(e.dataTransfer.files[0]); }}>
        <p className="text-fg-2">Drop your Everloot.lua or payload JSON here.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <label className={button}>Choose file
            <input aria-label="Choose Everloot file" type="file" accept="application/json,.json,.lua" className="sr-only" disabled={busy}
              onChange={(e) => { const file = e.target.files?.[0]; if (file) void loadFile(file); e.target.value = ""; }} />
          </label>
          <button className={outlineButton} disabled={busy} onClick={sample}>Load sample</button>
        </div>
        <p className="mt-4 text-sm text-muted">{loading ? "Reading your file…" : "Your original file stays on your computer. Reloading and reselecting it safely retries the same events."}</p>
      </div>
      <fieldset disabled={busy} className="rounded-xl border border-line bg-panel p-5 space-y-3">
        <legend className="text-lg text-fg">Named sharing choices</legend>
        <p className="text-sm text-fg-2">Anonymous sightings are included. Named categories start unchecked. Guild sharing requires verified officer authority; character sharing requires verified ownership.</p>
        {categories.map(({ key, label }) => <label key={key} className="flex gap-3 items-center text-sm text-fg">
          <input type="checkbox" checked={choices[key] === true} onChange={(e) => { resetSession(); setChoices({ ...choices, [key]: e.target.checked }); }} />{label}
        </label>)}
        <label className="block text-sm text-fg-2">Verification grants (separate multiple grants with spaces)
          <input type="password" autoComplete="off" className={input + " mt-2"} value={tokens}
            onChange={(e) => { resetSession(); setTokens(e.target.value); }} />
        </label>
        <p className="text-xs text-muted">Everloot issues scoped grants after reviewing officer or owner evidence. An addon claim token is not verification. No account credentials belong here.</p>
      </fieldset>
      {(error || prepared.error) && <p role="alert" className="text-sm text-danger">{error ?? prepared.error}</p>}
      {prepared.value && <div className="rounded-xl border border-line bg-panel p-5">
        <h2 className="text-lg font-semibold text-fg">Preview — selected records to send</h2>
        <ul className="mt-3 grid sm:grid-cols-2 gap-2 text-sm">
          {Object.entries(prepared.value.counts).map(([kind, count]) => <li key={kind} className="flex justify-between rounded-lg bg-canvas/60 px-3 py-2">
            <span className="text-fg-2">{kind}</span><span className="text-accent font-semibold">{count}</span>
          </li>)}
        </ul>
        <p className="mt-3 text-sm text-fg-2">{prepared.value.held.legacy} legacy records without event IDs, {prepared.value.held.named} unchecked named records, and {prepared.value.held.invalid} invalid records stay out of this upload. Keep your original file.</p>
        <p className="mt-2 text-sm text-fg-2">{prepared.value.batches.length} batches. Only a confirmed storage receipt advances progress. Named choices are checked against the grant on the server.</p>
        <button disabled={busy || !prepared.value.batches.length || complete} onClick={() => void send()} className={outlineButton + " mt-4"}>
          {sending ? "Sending…" : complete ? "Upload complete" : session?.next ? "Resume upload" : "Send upload"}
        </button>
      </div>}
      {session && <div role="status" className="rounded-xl border border-line bg-panel p-5 text-sm text-fg-2">
        <p className={complete ? "text-q-uncommon font-semibold" : "font-semibold"}>{complete ? "Upload processed — thank you." : error ? "Upload paused — keep your file." : "Uploading…"}</p>
        <p className="mt-2">{session.next} of {session.batches.length} batches confirmed; {accepted} records saved{rejected ? `, ${rejected} records rejected` : ""}.</p>
        <progress aria-label="Confirmed upload batches" value={session.next} max={session.batches.length} className="mt-3 w-full" />
        {error && <p className="mt-2">Retry resumes at the first unconfirmed batch. Previously confirmed batches are retained.</p>}
        {!!rejected && <ul className="mt-2">{session.receipts.flatMap((receipt, batch) => (receipt.rejected ?? []).map((item) =>
          <li key={`${batch}-${item.index}`}>Batch {batch + 1}, record {item.index}: {item.reason}</li>))}</ul>}
      </div>}
      <details className="rounded-xl border border-line bg-panel p-5 text-sm text-fg-2">
        <summary className="cursor-pointer font-semibold">Withdraw named sharing</summary>
        <p className="mt-3">Revoke a grant to withdraw the records it authorized. A verified character owner can also opt out across guild rosters, attendance, loot, gear and gold. An opt-out stays in effect for later uploads.</p>
        <label className="block mt-3">Grant to withdraw
          <input type="password" autoComplete="off" className={input + " mt-2"} value={withdrawToken} onChange={(e) => setWithdrawToken(e.target.value)} disabled={withdrawing} />
        </label>
        <div className="mt-3 flex flex-wrap gap-3">
          <button className={outlineButton} disabled={withdrawing || !/^[a-f0-9]{64}$/.test(withdrawToken.trim())} onClick={() => void withdraw("revoke")}>Revoke grant</button>
          <button className={outlineButton} disabled={withdrawing || !/^[a-f0-9]{64}$/.test(withdrawToken.trim())} onClick={() => void withdraw("opt-out")}>Opt out character</button>
        </div>
        {withdrawStatus && <p role="status" className="mt-3">{withdrawStatus}</p>}
      </details>
    </div>
  );
}
