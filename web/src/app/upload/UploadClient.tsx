"use client";

import { useState, useCallback } from "react";
import { LuaParseError, parseEverlootLua } from "@/lib/sv-parse";

interface Receipt {
  ok: boolean;
  uploadId?: string;
  persisted?: boolean;
  accepted?: Array<{ index: number; kind: string }>;
  rejected?: Array<{ index: number; reason: string }>;
  error?: string;
}

interface BatchProgress {
  totalRecords: number;
  sentRecords: number;
  currentBatch: number;
  totalBatches: number;
  hasMore: boolean;
  lastReceipt?: Receipt;
}

const base = { installId: "browser-upload-demo", capturedAt: new Date().toISOString() };

const SAMPLE = {
  addonVersion: "0.1.0",
  records: [
    { ...base, kind: "npc_sighting", npcId: 1234, name: "Forest Spider", mapId: 141, x: 42.5, y: 61.0, level: 60, reaction: "hostile" },
    { ...base, kind: "loot", sourceNpcId: 1234, items: [{ itemId: 456, count: 2 }] },
  ],
};

const BATCH_SIZE = 500;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export default function UploadClient() {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Record<string, number> | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [parsedRecords, setParsedRecords] = useState<unknown[] | null>(null);
  const [addonVersion, setAddonVersion] = useState("0.1.0");

  function loadFile(file: File) {
    setReceipt(null);
    setError(null);
    setBatchProgress(null);
    setParsedRecords(null);
    file.text().then(
      (t) => {
        if (/\.lua$/i.test(file.name) || /EverlootDB\s*=/.test(t.slice(0, 500))) {
          try {
            const parsed = parseEverlootLua(t);
            setAddonVersion(parsed.version);
            setParsedRecords(parsed.records);
            const payload = JSON.stringify({ addonVersion: parsed.version, records: parsed.records }, null, 2);
            setText(payload);
            summarize(payload);
          } catch (e) {
            setPreview(null);
            setError(e instanceof LuaParseError ? e.message : "Could not parse that Lua file.");
          }
          return;
        }
        try {
          const parsed = JSON.parse(t);
          if (parsed.records) {
            setParsedRecords(parsed.records);
            setAddonVersion(parsed.addonVersion || "0.1.0");
          }
        } catch {
          // ignore
        }
        setText(t);
        summarize(t);
      },
      () => setError("Could not read that file."),
    );
  }

  function summarize(t: string) {
    try {
      const payload = JSON.parse(t) as { records?: Array<{ kind?: unknown }> };
      if (!Array.isArray(payload.records)) throw new Error("bad shape");
      const counts: Record<string, number> = {};
      for (const r of payload.records) {
        const k = typeof r?.kind === "string" ? r.kind : "unknown";
        counts[k] = (counts[k] ?? 0) + 1;
      }
      setPreview(counts);
      setError(null);
    } catch {
      setPreview(null);
      setError("That file is not an Everloot payload (JSON with a records array).");
    }
  }

  const sendBatch = useCallback(async (batchRecords: unknown[], batchNum: number, totalBatches: number): Promise<Receipt> => {
    const payload = { addonVersion, records: batchRecords };
    const res = await fetch("/api/intake", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json()) as Receipt;
    if (!res.ok) {
      throw new Error(body.error ?? `Batch ${batchNum} failed`);
    }
    return body;
  }, [addonVersion]);

  async function send() {
    if (!parsedRecords || parsedRecords.length === 0) {
      setError("No records to send. Load a file first.");
      return;
    }

    setSending(true);
    setReceipt(null);
    setError(null);
    setBatchProgress({
      totalRecords: parsedRecords.length,
      sentRecords: 0,
      currentBatch: 0,
      totalBatches: Math.ceil(parsedRecords.length / BATCH_SIZE),
      hasMore: true,
    });

    const batches = chunkArray(parsedRecords, BATCH_SIZE);
    let allAccepted = 0;
    let allRejected = 0;
    let lastReceipt: Receipt = { ok: true, accepted: [], rejected: [] };

    try {
      for (let i = 0; i < batches.length; i++) {
        setBatchProgress(prev => prev ? { ...prev, currentBatch: i + 1 } : null);
        
        const batchReceipt = await sendBatch(batches[i], i + 1, batches.length);
        
        if (batchReceipt.accepted) allAccepted += batchReceipt.accepted.length;
        if (batchReceipt.rejected) allRejected += batchReceipt.rejected.length;
        lastReceipt = batchReceipt;

        setBatchProgress(prev => prev ? { ...prev, sentRecords: prev.sentRecords + batches[i].length } : null);
        
        // Small delay to avoid rate limiting
        if (i < batches.length - 1) {
          await new Promise(r => setTimeout(r, 100));
        }
      }

      setReceipt({
        ok: true,
        uploadId: lastReceipt.uploadId,
        persisted: true,
        accepted: [{ index: 0, kind: "batch" }], // summary
        rejected: [],
      });
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setReceipt({
        ok: false,
        persisted: false,
        accepted: [],
        rejected: [],
        error: msg,
      });
      setError(msg);
    } finally {
      setSending(false);
      setBatchProgress(prev => prev ? { ...prev, hasMore: false, lastReceipt } : null);
    }
  }

  return (
    <div className="space-y-6">
      <div
        className="rounded-xl border border-dashed border-parchment-100/25 bg-parchment-900 p-8 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) loadFile(f);
        }}
      >
        <p className="text-parchment-100/80">Drop your Everloot.lua or payload JSON here, or</p>
        <div className="mt-4 flex items-center justify-center gap-3">
          <label className="cursor-pointer px-4 py-2 rounded-lg bg-gold-500 text-parchment-950 font-semibold hover:bg-gold-400 transition">
            Choose file
            <input
              type="file"
              accept="application/json,.json,.lua"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadFile(f);
              }}
            />
          </label>
          <button
            className="px-4 py-2 rounded-lg border border-parchment-100/20 hover:border-gold-400/60 transition text-parchment-100/90"
            onClick={() => {
              const t = JSON.stringify(SAMPLE, null, 2);
              setText(t);
              summarize(t);
              setReceipt(null);
            }}
          >
            Load sample
          </button>
        </div>
        <p className="mt-4 text-xs text-parchment-100/50">
          The addon writes Everloot.lua to your SavedVariables — drop that file straight in.
        </p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {preview && (
        <div className="rounded-xl border border-parchment-100/10 bg-parchment-900 p-5">
          <h2 className="font-display text-lg font-semibold text-parchment-100">Preview — this is everything that goes out</h2>
          <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
            {Object.entries(preview).map(([kind, n]) => (
              <li key={kind} className="flex justify-between rounded-lg bg-parchment-950/60 px-3 py-2">
                <span className="text-parchment-100/80">{kind}</span>
                <span className="text-gold-400 font-semibold">{n}</span>
              </li>
            ))}
          </ul>
          {batchProgress && (
            <div className="mt-4 p-3 rounded-lg bg-parchment-950/60">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-parchment-100/80">Batch {batchProgress.currentBatch} / {batchProgress.totalBatches}</span>
                <span className="text-gold-400">{batchProgress.sentRecords} / {batchProgress.totalRecords} records</span>
              </div>
              <div className="h-2 bg-parchment-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gold-500 transition-all duration-300"
                  style={{ width: `${batchProgress.totalRecords > 0 ? (batchProgress.sentRecords / batchProgress.totalRecords) * 100 : 0}%` }}
                />
              </div>
              {batchProgress.hasMore && <p className="mt-1 text-xs text-parchment-100/60">Sending batch {batchProgress.currentBatch} of {batchProgress.totalBatches}…</p>}
            </div>
          )}
          <button
            disabled={sending}
            onClick={send}
            className="mt-4 px-5 py-3 rounded-lg bg-gold-500 text-parchment-950 font-semibold hover:bg-gold-400 transition disabled:opacity-50 w-full"
          >
            {sending ? "Sending…" : batchProgress ? "Resume upload" : "Send upload"}
          </button>
        </div>
      )}

      {receipt && (
        <div className="rounded-xl border border-parchment-100/10 bg-parchment-900 p-5 text-sm">
          {receipt.persisted === false ? (
            <>
              <p className="text-red-400 font-semibold">Not saved — nothing was stored.</p>
              <p className="mt-1 text-parchment-100/70">
                Your file is still loaded and the records validated, but the upload was not stored.
                Press Send upload again to retry.
              </p>
              {!!receipt.rejected?.length && (
                <ul className="mt-2 text-parchment-100/60">
                  {receipt.rejected.map((r) => (
                    <li key={r.index}>Record {r.index}: {r.reason}</li>
                  ))}
                </ul>
              )}
            </>
          ) : receipt.ok ? (
            <>
              <p className="text-uncommon font-semibold">Received — thank you.</p>
              <p className="mt-1 text-parchment-100/70">
                Upload <span className="text-parchment-100">{receipt.uploadId ?? "batch"}</span>:{" "}
                {receipt.accepted?.length ?? 0} batch(es) accepted
                {receipt.rejected?.length ? `, ${receipt.rejected.length} rejected` : ""}.
              </p>
              {!!receipt.rejected?.length && (
                <ul className="mt-2 text-parchment-100/60">
                  {receipt.rejected.map((r) => (
                    <li key={r.index}>Record {r.index}: {r.reason}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-red-400">Rejected: {receipt.error ?? `${receipt.rejected?.length ?? 0} record(s) invalid.`}</p>
          )}
        </div>
      )}
    </div>
  );
}
