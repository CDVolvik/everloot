"use client";

import { useEffect, useState } from "react";
import { testKey } from "@/lib/chat/agent";
import { CHAT_PROVIDERS, chatProvider, type ChatProviderKind } from "@/lib/chat/providers";
import { loadProviders, maskKey, pickModel, removeProvider, saveProvider, type SavedProvider } from "@/lib/chat/store";

const field = "w-full rounded-control border border-edge bg-canvas px-3 py-2 text-fg placeholder:text-muted focus:border-accent";
const small = "btn min-h-9 px-3 text-sm";

const providerName = (kind: ChatProviderKind) => chatProvider(kind)?.label.replace(/ \(.*\)$/, "") ?? kind;

/** Every model the saved providers offer, the saved one first when it is not a preset. */
export function modelOptions(providers: SavedProvider[]) {
  return providers.map((p) => {
    const preset = chatProvider(p.kind)!;
    const models = preset.models.some((m) => m.id === p.model) ? preset.models : [{ id: p.model, label: p.model, note: "" }, ...preset.models];
    return { kind: p.kind, label: preset.label, models };
  });
}

/**
 * The Chat keys section of /account: the player's provider keys and default model for /chat. Everything is
 * read from and written to this browser's localStorage (lib/chat/store.ts); nothing here talks to Everloot.
 * Test sends the key to its own provider only.
 */
export default function ChatKeys() {
  const [providers, setProviders] = useState<SavedProvider[]>([]);
  const [kind, setKind] = useState<ChatProviderKind>("openrouter");
  const [status, setStatus] = useState("");
  const [testing, setTesting] = useState<ChatProviderKind | null>(null);

  // localStorage only exists in the browser; read it after the first render.
  useEffect(() => { setProviders(loadProviders(localStorage)); }, []);

  function apply(next: SavedProvider[], message: string) {
    setProviders(next);
    setStatus(message);
  }

  function attempt(action: () => void) {
    try { action(); } catch (e) { setStatus(e instanceof Error ? e.message : String(e)); }
  }

  function onSave(form: HTMLFormElement) {
    const f = new FormData(form);
    const text = (k: string) => String(f.get(k) ?? "").trim();
    attempt(() => {
      const next = saveProvider(localStorage, { kind, model: text("model") || text("modelText"), key: text("key") });
      form.reset();
      apply(next, `Saved in this browser. Chat now uses ${next[0].model}.`);
    });
  }

  async function onTest(p: SavedProvider) {
    setTesting(p.kind);
    setStatus(`Testing ${providerName(p.kind)}…`);
    try { setStatus(await testKey(chatProvider(p.kind)!, p.model, p.key)); } catch (e) { setStatus(e instanceof Error ? e.message : String(e)); } finally { setTesting(null); }
  }

  const preset = chatProvider(kind)!;
  const saved = providers.find((p) => p.kind === kind);
  const active = providers[0] ?? null;

  return (
    <div className="space-y-4 text-sm">
      <p className="text-fg-2">
        Chat answers with your own model. Your keys are kept in this browser only and go from here straight to the
        provider; Everloot&apos;s servers never receive them. Another browser or device needs its own key, and clearing
        this site&apos;s data in your browser removes them.
      </p>

      {providers.length > 0 && (
        <>
          <ul aria-label="Saved keys" className="divide-y divide-line rounded-card border border-line">
            {providers.map((p, i) => (
              <li key={p.kind} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-0 text-fg">{providerName(p.kind)}</span>
                <span className="text-muted">{p.model} · {maskKey(p.key)}</span>
                {i === 0 && <span className="rounded-full border border-line px-2 text-xs text-fg-2">Default</span>}
                <span className="ml-auto flex gap-2">
                  <button type="button" className={small} disabled={testing !== null} onClick={() => void onTest(p)}>{testing === p.kind ? "Testing…" : "Test"}</button>
                  <button type="button" className={small} aria-label={`Remove ${providerName(p.kind)}`}
                    onClick={() => attempt(() => apply(removeProvider(localStorage, p.kind), `${providerName(p.kind)} removed from this browser.`))}>Remove</button>
                </span>
              </li>
            ))}
          </ul>
          <label className="block max-w-md text-fg-2">Default model
            <select className={`${field} mt-1`} value={active ? `${active.kind}|${active.model}` : ""}
              onChange={(e) => {
                const [k, ...rest] = e.target.value.split("|");
                attempt(() => apply(pickModel(localStorage, k as ChatProviderKind, rest.join("|")), `Chat now uses ${rest.join("|")}.`));
              }}>
              {modelOptions(providers).map((g) => (
                <optgroup key={g.kind} label={g.label}>
                  {g.models.map((m) => <option key={m.id} value={`${g.kind}|${m.id}`}>{m.label}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
        </>
      )}

      <form className="max-w-md space-y-3 rounded-card border border-line bg-panel p-4" autoComplete="off" aria-label="Add a key"
        onSubmit={(e) => { e.preventDefault(); onSave(e.currentTarget); }}>
        <label className="block text-fg-2">Provider
          <select className={`${field} mt-1`} value={kind} onChange={(e) => setKind(e.target.value as ChatProviderKind)}>
            {CHAT_PROVIDERS.map((p) => <option key={p.kind} value={p.kind}>{p.label}{providers.some((s) => s.kind === p.kind) ? " · saved" : ""}</option>)}
          </select>
        </label>
        {preset.keyPattern && (
          <label className="block text-fg-2">Key
            <input type="password" name="key" spellCheck={false} className={`${field} mt-1`} placeholder={saved ? "Saved. Paste a new one to replace it" : "Paste the key"} />
            <span className="mt-1 block text-xs text-muted">{preset.keyHint}</span>
          </label>
        )}
        <label className="block text-fg-2">Model
          {preset.models.length > 0 && (
            <select key={kind} name="model" className={`${field} mt-1`} defaultValue={saved?.model ?? preset.models[0].id}>
              {preset.models.map((m) => <option key={m.id} value={m.id}>{m.label} · {m.note}</option>)}
              <option value="">Another model id…</option>
            </select>
          )}
          <input name="modelText" spellCheck={false} className={`${field} mt-1`} placeholder={preset.models.length ? "Only if you picked Another model id" : "The model you pulled, like qwen3:8b"} />
        </label>
        <p className="text-xs text-muted">{preset.dataNote}</p>
        <button type="submit" className="btn btn-primary min-h-11 px-4 text-sm">Save in this browser</button>
      </form>

      <p role="status" aria-live="polite" className="min-h-5 text-fg-2">{status}</p>
    </div>
  );
}
