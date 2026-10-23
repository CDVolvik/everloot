import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { explainKeyError, readAccountKey } from "./account";
import { readJsonFile } from "./json-file";
import type { ChatInfo, ChatMessage, ChatProgress, Settings } from "../shared/types";
import { answer, readProviderEntries } from "./agent";
import type { LocalTool } from "./local-tools";
import { DEFAULT_MODEL, modelsFor, ownProvider, ownProviders, removeProvider, setProvider, useModel } from "./providers";
import type { ProviderChoice, ProviderKind } from "../shared/providers";

const MAX_MESSAGES = 100;

/**
 * The Chat page's state: a transcript kept in chat.json in the data folder (private, never
 * uploaded), one question at a time, answered by the agent over Everloot's MCP server, and the
 * provider picker's writes to config.json. The local tools, when given, let the model read the
 * player's own characters and scans beside Everloot's data.
 */
export function createChat(dataFolder: string, current: () => Settings, local: LocalTool[] = []) {
  const path = join(dataFolder, "chat.json");
  let messages: ChatMessage[] = [];
  try { if (existsSync(path)) messages = (readJsonFile(path) as ChatMessage[]).slice(-MAX_MESSAGES); } catch { messages = []; }
  let busy = false;
  let error: string | null = null;

  const save = () => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(`${path}.tmp`, JSON.stringify(messages));
    renameSync(`${path}.tmp`, path);
  };
  const token = (): string | null => {
    const file = current().ask.tokenFile;
    if (!file) return null;
    try { const t = readFileSync(file, "utf8").trim(); return t || null; } catch { return null; }
  };
  /** The token endpoint when a token is set, else the public read-only mount of the same site, with the account key when signed in. */
  const target = () => {
    const s = current();
    const t = token();
    return t ? { url: s.ask.mcpUrl, token: t } : { url: `${s.endpoint}/mcp/public`, token: readAccountKey(dataFolder) };
  };
  const mode = (): string => {
    try {
      const first = readProviderEntries(join(dataFolder, "config.json"))[0];
      if (!first) return "plain search";
      return `${first.type === "anthropic" ? "anthropic" : new URL(first.baseUrl ?? "http://unknown").hostname}:${first.model ?? DEFAULT_MODEL} with tools`;
    } catch (err) { return `config.json: ${err instanceof Error ? err.message : String(err)}`; }
  };
  const info = (): ChatInfo => {
    const t = target();
    return { messages: [...messages], mode: mode(), mcpUrl: t.url, withToken: token() !== null, provider: ownProvider(dataFolder), providers: ownProviders(dataFolder), busy, error };
  };

  return {
    info,
    // Not while an answer is being written: its question would go and the answer land alone.
    clear(): ChatInfo { if (busy) return info(); messages = []; error = null; save(); return info(); },
    setProvider(choice: ProviderChoice): ChatInfo { setProvider(dataFolder, choice); error = null; return info(); },
    useModel(kind: ProviderKind, model: string): ChatInfo { useModel(dataFolder, kind, model); error = null; return info(); },
    removeProvider(kind?: ProviderKind): ChatInfo { removeProvider(dataFolder, kind); return info(); },
    models: (kind: ProviderKind) => modelsFor(dataFolder, kind),
    async send(text: string, onProgress?: (progress: ChatProgress) => void): Promise<ChatInfo> {
      const question = text.trim().slice(0, 2000);
      if (!question || busy) return info();
      busy = true; error = null;
      const history = [...messages];
      messages.push({ role: "user", text: question, at: new Date().toISOString(), model: null, sources: [], steps: [] });
      try {
        const entries = readProviderEntries(join(dataFolder, "config.json"));
        const r = await answer({ mcp: target(), entries, history, question, local, onProgress });
        messages.push({ role: "assistant", text: r.text, at: new Date().toISOString(), model: r.model, sources: r.sources, steps: r.steps });
      } catch (err) {
        error = explainKeyError(err instanceof Error ? err.message : String(err));
      } finally {
        busy = false;
        messages = messages.slice(-MAX_MESSAGES);
        save();
      }
      return info();
    },
  };
}
