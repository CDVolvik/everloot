import type { ChatStep } from "./agent";
import { chatProvider, MODEL_ID, type ChatProviderKind } from "./providers";

/**
 * What the /chat page keeps in this browser's localStorage, and nowhere else: the providers the
 * player saved (their keys included) and the transcript. Nothing here is sent to Everloot; a key
 * goes only to its own provider. Clearing the site's data in the browser removes all of it.
 */

export interface SavedProvider { kind: ChatProviderKind; model: string; key: string }
export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  at: string;
  /** The model that wrote an assistant message; null for search only. */
  model: string | null;
  sources: string[];
  steps: ChatStep[];
}

const PROVIDERS = "everloot.chat.providers.v1";
const THREAD = "everloot.chat.thread.v1";
const MAX_MESSAGES = 60;

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

function read<T>(storage: Storage, name: string, fallback: T): T {
  try { const raw = storage.getItem(name); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}

/** The saved providers, the one in use first. Entries that no longer make sense are dropped. */
export function loadProviders(storage: Storage): SavedProvider[] {
  const list = read<unknown[]>(storage, PROVIDERS, []);
  if (!Array.isArray(list)) return [];
  return list.flatMap((raw) => {
    const p = raw as Partial<SavedProvider>;
    const preset = chatProvider(String(p.kind));
    if (!preset || typeof p.model !== "string" || !MODEL_ID.test(p.model) || typeof p.key !== "string") return [];
    return [{ kind: preset.kind, model: p.model, key: p.key }];
  });
}

/**
 * Saves a provider and puts it first. A provider already saved keeps its key when none is pasted,
 * so changing the model does not mean pasting the key again.
 */
export function saveProvider(storage: Storage, choice: { kind: ChatProviderKind; model: string; key?: string }): SavedProvider[] {
  const preset = chatProvider(choice.kind);
  if (!preset) throw new Error("Pick a provider");
  const model = choice.model.trim();
  if (!MODEL_ID.test(model)) throw new Error(model ? "That does not look like a model id" : "Pick or type a model");
  const list = loadProviders(storage);
  const old = list.find((p) => p.kind === preset.kind);
  const key = (choice.key ?? "").trim() || old?.key || "";
  if (preset.keyPattern && !preset.keyPattern.test(key)) throw new Error(key ? `That does not look like the right key. ${preset.keyHint}` : `Paste the key first. ${preset.keyHint}`);
  if (key.length > 500) throw new Error("That is too long for a key");
  const next = [{ kind: preset.kind, model, key }, ...list.filter((p) => p !== old)];
  storage.setItem(PROVIDERS, JSON.stringify(next));
  return next;
}

/** Switches to a saved provider's model, from the model menu. */
export function pickModel(storage: Storage, kind: ChatProviderKind, model: string): SavedProvider[] {
  const list = loadProviders(storage);
  const own = list.find((p) => p.kind === kind);
  if (!own) throw new Error("That provider is not saved here");
  if (!MODEL_ID.test(model)) throw new Error("That does not look like a model id");
  const next = [{ ...own, model }, ...list.filter((p) => p !== own)];
  storage.setItem(PROVIDERS, JSON.stringify(next));
  return next;
}

export function removeProvider(storage: Storage, kind: ChatProviderKind): SavedProvider[] {
  const next = loadProviders(storage).filter((p) => p.kind !== kind);
  if (next.length) storage.setItem(PROVIDERS, JSON.stringify(next)); else storage.removeItem(PROVIDERS);
  return next;
}

export function loadThread(storage: Storage): ChatMessage[] {
  const list = read<unknown>(storage, THREAD, []);
  return Array.isArray(list) ? (list as ChatMessage[]).filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string").slice(-MAX_MESSAGES) : [];
}

export function saveThread(storage: Storage, messages: ChatMessage[]): void {
  if (messages.length) storage.setItem(THREAD, JSON.stringify(messages.slice(-MAX_MESSAGES))); else storage.removeItem(THREAD);
}
