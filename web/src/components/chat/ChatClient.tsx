"use client";

import { useEffect, useRef, useState } from "react";
import { answer, loadTools, NO_SOURCED_ANSWER, searchOnly, signedIn, type ChatProgress, type ToolDef } from "@/lib/chat/agent";
import { CHAT_PROVIDERS, chatProvider, type ChatProviderKind } from "@/lib/chat/providers";
import { loadProviders, loadThread, pickModel, removeProvider, saveProvider, saveThread, type ChatMessage, type SavedProvider } from "@/lib/chat/store";
import { askPrefill, validCharacterId } from "@/lib/profiles";
import type { AccountBuilds, BuildCharacter, SavedBuild } from "@/lib/saved-builds";

const STARTERS = ["Who is Leeroy Jenkins?", "What drops the Bindings of the Windseeker?", "Where do I learn Enchanting past 225?", "What changed in the last build?"];
const field = "w-full rounded-lg bg-canvas border border-edge px-3 py-2 text-fg placeholder:text-muted focus:border-accent";

/** "https://… (licence, retrieved …)" as a link and its note; anything else as text. */
function Source({ text }: { text: string }) {
  const m = /^(https:\/\/\S+)\s*(.*)$/.exec(text);
  if (!m) return <span>{text}</span>;
  return <span><a href={m[1]} target="_blank" rel="noopener noreferrer" className="underline hover:text-accent break-all">{decodeURIComponent(m[1].replace(/^https:\/\/(www\.)?/, ""))}</a> {m[2]}</span>;
}

/** `savedBuilds`: the saved-builds switch; with it on, a signed-in visitor's model also gets my_builds. */
export default function ChatClient({ savedBuilds = false }: { savedBuilds?: boolean }) {
  const [providers, setProviders] = useState<SavedProvider[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<ChatProgress | null>(null);
  const [error, setError] = useState("");
  const [formKind, setFormKind] = useState<ChatProviderKind | null>(null);
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState<number | null>(null);
  const tools = useRef<ToolDef[] | null>(null);
  const stop = useRef<AbortController | null>(null);
  const thread = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  // localStorage only exists in the browser; read it after the first render.
  useEffect(() => { setProviders(loadProviders(localStorage)); setMessages(loadThread(localStorage)); setReady(true); }, []);
  useEffect(() => { if (ready) saveThread(localStorage, messages); }, [messages, ready]);
  // From the home's Ask box: /chat?q=<question>&character=<id> fills the question box, with the character and its
  // saved builds when the visitor is signed in. Nothing is sent until the player presses Send.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q") ?? "";
    const characterId = params.get("character");
    if (!q && !characterId) return;
    let cancelled = false;
    void (async () => {
      let character: BuildCharacter | null = null;
      let builds: SavedBuild[] = [];
      if (savedBuilds && validCharacterId(characterId)) {
        try {
          const res = await fetch("/api/me/builds", { cache: "no-store" });
          if (res.ok) {
            const own = (await res.json()) as AccountBuilds;
            character = own.characters.find((c) => c.id === characterId) ?? null;
            builds = character ? own.builds.filter((b) => b.characterId === characterId) : [];
          }
        } catch { /* signed out or offline: the question alone */ }
      }
      const text = askPrefill(q, character, builds);
      if (!cancelled && text && box.current && !box.current.value) { box.current.value = text; box.current.focus(); }
    })();
    return () => { cancelled = true; };
  }, [savedBuilds]);
  useEffect(() => { const t = thread.current; if (t && t.scrollHeight - t.scrollTop - t.clientHeight < 80) t.scrollTop = t.scrollHeight; }, [messages, live]);

  const active = providers[0] ?? null;

  async function ask(question: string) {
    const q = question.trim().slice(0, 2000);
    if (!q || busy) return;
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    setMessages((list) => [...list, { role: "user", text: q, at: new Date().toISOString(), model: null, sources: [], steps: [] }]);
    setBusy(true); setError(""); setLive(null);
    const ctl = new AbortController();
    stop.current = ctl;
    try {
      let r;
      if (!active) r = await searchOnly(q);
      else {
        tools.current ??= await loadTools(fetch, savedBuilds && await signedIn());
        const preset = chatProvider(active.kind)!;
        r = await answer({ provider: preset, model: active.model, key: active.key, history, question: q, tools: tools.current, onProgress: setLive, signal: ctl.signal });
      }
      setMessages((list) => [...list, { role: "assistant", text: r.text, at: new Date().toISOString(), model: r.model, sources: r.sources, steps: r.steps }]);
    } catch (err) {
      setError(ctl.signal.aborted ? "Stopped." : err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false); setLive(null); stop.current = null;
    }
  }

  function openForm(kind: ChatProviderKind | null) {
    const saved = new Set(providers.map((p) => p.kind));
    setFormKind(kind ?? CHAT_PROVIDERS.find((p) => !saved.has(p.kind))?.kind ?? "openrouter");
    setNotice("");
  }

  function onModelPick(value: string) {
    if (value === "add") return openForm(null);
    if (value === "manage") return openForm(active?.kind ?? null);
    const [kind, ...rest] = value.split("|");
    if (!kind || !rest.length) return;
    try { setProviders(pickModel(localStorage, kind as ChatProviderKind, rest.join("|"))); } catch (e) { setNotice(e instanceof Error ? e.message : String(e)); }
  }

  function onSaveProvider(form: HTMLFormElement) {
    const f = new FormData(form);
    const text = (k: string) => String(f.get(k) ?? "").trim();
    try {
      const next = saveProvider(localStorage, { kind: formKind!, model: text("model") || text("modelText"), key: text("key") });
      setProviders(next); setFormKind(null);
      setNotice(`Saved in this browser. Chat now uses ${next[0].model}.`);
    } catch (e) { setNotice(e instanceof Error ? e.message : String(e)); }
  }

  async function copy(i: number, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(i); setTimeout(() => setCopied(null), 1500); } catch { /* the browser refused; nothing to undo */ }
  }

  const preset = formKind ? chatProvider(formKind) : null;
  const savedKind = (k: ChatProviderKind) => providers.some((p) => p.kind === k);

  return (
    <div className="space-y-4">
      {!active && ready && (
        <p className="text-sm text-fg-2">
          No model yet, so you get Everloot&apos;s search hits as they are.{" "}
          <button type="button" className="underline text-accent" onClick={() => openForm(null)}>Add your own key or a free model</button>
        </p>
      )}
      {notice && <p role="status" className="text-sm text-fg-2">{notice}</p>}

      {preset && (
        <form className="rounded-xl border border-line bg-panel p-4 space-y-3" autoComplete="off" onSubmit={(e) => { e.preventDefault(); onSaveProvider(e.currentTarget); }}>
          {providers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">Saved in this browser:</span>
              {providers.map((p) => (
                <span key={p.kind} className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1">
                  {chatProvider(p.kind)?.label}
                  <button type="button" className="underline text-muted hover:text-danger" aria-label={`Remove ${chatProvider(p.kind)?.label}`} onClick={() => { setProviders(removeProvider(localStorage, p.kind)); setNotice("Removed from this browser."); }}>remove</button>
                </span>
              ))}
            </div>
          )}
          <label className="block text-sm text-fg-2">Provider
            <select className={`${field} mt-1`} value={preset.kind} onChange={(e) => setFormKind(e.target.value as ChatProviderKind)}>
              {CHAT_PROVIDERS.map((p) => <option key={p.kind} value={p.kind}>{p.label}{savedKind(p.kind) ? " · saved" : ""}</option>)}
            </select>
          </label>
          {preset.keyPattern && (
            <label className="block text-sm text-fg-2">Key
              <input type="password" name="key" spellCheck={false} className={`${field} mt-1`} placeholder={savedKind(preset.kind) ? "saved; paste a new one to replace it" : "paste the key"} />
              <span className="block mt-1 text-xs text-muted">{preset.keyHint}</span>
            </label>
          )}
          <label className="block text-sm text-fg-2">Model
            {preset.models.length > 0 && (
              <select name="model" className={`${field} mt-1`} defaultValue={providers.find((p) => p.kind === preset.kind)?.model ?? preset.models[0].id}>
                {preset.models.map((m) => <option key={m.id} value={m.id}>{m.label} · {m.note}</option>)}
                <option value="">Another model id…</option>
              </select>
            )}
            <input name="modelText" spellCheck={false} className={`${field} mt-1`} placeholder={preset.models.length ? "only if you picked Another model id" : "the model you pulled, like qwen3:8b"} />
          </label>
          <p className="text-xs text-muted">{preset.dataNote} Your key is kept in this browser only and sent only to {preset.label.replace(/ \(.*\)$/, "")}, with your questions and the tool results. Everloot never receives it.</p>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary min-h-11 px-4 text-sm">Save</button>
            <button type="button" className="btn min-h-11 px-4 text-sm" onClick={() => setFormKind(null)}>Cancel</button>
          </div>
        </form>
      )}

      <div ref={thread} className="rounded-xl border border-line bg-panel p-4 min-h-[16rem] max-h-[60vh] overflow-y-auto space-y-3">
        {messages.length === 0 && !busy && (
          <div className="space-y-3">
            <p className="text-muted">Ask anything about WoW: Forever: a drop, a vendor, a recipe, a price, a quest, the lore.</p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((q) => <button key={q} type="button" className="btn min-h-9 px-3 text-sm" onClick={() => void ask(q)}>{q}</button>)}
            </div>
          </div>
        )}
        {messages.map((m, i) => m.role === "user" ? (
          <div key={i} className="ml-auto max-w-[80%] w-fit rounded-xl border border-edge bg-canvas px-3 py-2 whitespace-pre-wrap">{m.text}</div>
        ) : (
          <div key={i} className="max-w-[90%] w-fit rounded-xl border border-line bg-canvas px-3 py-2">
            <div className="whitespace-pre-wrap break-words">{m.text}</div>
            <div className="mt-2 text-xs text-muted space-y-1">
              <div className="flex flex-wrap items-center gap-x-2">
                <b className="text-fg-2 font-medium">{m.model ?? "search only"}</b>
                {m.steps.length > 0 && <span>· {m.steps.length} lookup{m.steps.length === 1 ? "" : "s"}: {m.steps.map((s) => s.tool).join(", ")}</span>}
                <button type="button" className="ml-auto underline hover:text-accent" onClick={() => void copy(i, m.text)}>{copied === i ? "Copied" : "Copy"}</button>
              </div>
              {m.sources.length > 0 ? (
                <details>
                  <summary className="cursor-pointer">Sources ({m.sources.length})</summary>
                  <ul className="mt-1 space-y-1">{m.sources.map((s) => <li key={s}><Source text={s} /></li>)}</ul>
                </details>
              ) : m.model && m.text !== NO_SOURCED_ANSWER ? <div>No source in Everloot&apos;s data; the model&apos;s own knowledge.</div> : null}
              {!m.model && m.text === NO_SOURCED_ANSWER && !active && (
                <div>Search alone only matches names in Everloot&apos;s data. A model reads the question, fixes the spelling and looks it up for you.{" "}
                  <button type="button" className="underline text-accent" onClick={() => openForm(null)}>Add a key or a free model</button>
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="max-w-[90%] w-fit rounded-xl border border-line bg-canvas px-3 py-2">
            {live?.text && <div className="whitespace-pre-wrap break-words">{live.text}</div>}
            <div className="text-xs text-muted">{live?.tool ? `Looking up ${live.tool}…` : live?.text ? "" : "Answering…"}</div>
          </div>
        )}
        {error && <div role="alert" className="text-sm text-danger">{error}</div>}
      </div>

      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); const q = box.current?.value ?? ""; if (box.current) box.current.value = ""; void ask(q); }}>
        <textarea ref={box} rows={2} aria-label="Your question" placeholder="Ask about Forever. Enter sends, Shift+Enter is a new line." disabled={busy}
          className={`${field} min-h-11 text-base resize-y`}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
        <div className="flex flex-wrap items-center justify-end gap-2">
          {messages.length > 0 && !busy && <button type="button" className="mr-auto text-sm text-muted underline hover:text-fg" onClick={() => { setMessages([]); setError(""); }}>Clear chat</button>}
          <select aria-label="Model" className="min-h-11 max-w-full sm:max-w-xs rounded-lg bg-panel border border-line px-2 text-sm text-fg-2 hover:border-edge focus:border-accent" disabled={busy}
            value={active ? `${active.kind}|${active.model}` : ""} onChange={(e) => onModelPick(e.target.value)}>
            {!active && <option value="">Search only, no model</option>}
            {providers.map((p) => {
              const pr = chatProvider(p.kind)!;
              const models = pr.models.some((m) => m.id === p.model) ? pr.models : [{ id: p.model, label: p.model, note: "" }, ...pr.models];
              return <optgroup key={p.kind} label={pr.label}>{models.map((m) => <option key={m.id} value={`${p.kind}|${m.id}`}>{m.label}</option>)}</optgroup>;
            })}
            <option value="add">Add a provider key…</option>
            {providers.length > 0 && <option value="manage">Manage saved keys…</option>}
          </select>
          {busy
            ? <button type="button" className="btn min-h-11 px-4 text-sm" onClick={() => stop.current?.abort()}>Stop</button>
            : <button type="submit" className="btn btn-primary min-h-11 px-4 text-sm">Send</button>}
        </div>
      </form>
    </div>
  );
}
