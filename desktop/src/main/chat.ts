import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadProviders } from "../../../companion/src/providers/config";
import type { ChatInfo, ChatMessage, Settings } from "../shared/types";
import { answer, readProviderEntries } from "./agent";
import { DEFAULT_MODEL, hasOwnAnthropicKey, removeAnthropicKey, setAnthropicKey } from "./providers";

const MAX_MESSAGES = 100;

/**
 * The Chat page's state: a transcript kept in chat.json in the data folder (private, never
 * uploaded), one question at a time, answered by the agent over Everloot's MCP server.
 */
export function createChat(dataFolder: string, current: () => Settings) {
  const path = join(dataFolder, "chat.json");
  let messages: ChatMessage[] = [];
  try { if (existsSync(path)) messages = (JSON.parse(readFileSync(path, "utf8")) as ChatMessage[]).slice(-MAX_MESSAGES); } catch { messages = []; }
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
  /** The token endpoint when a token is set, else the public read-only mount of the same site. */
  const target = () => {
    const s = current();
    const t = token();
    return t ? { url: s.ask.mcpUrl, token: t } : { url: `${s.endpoint}/mcp/public`, token: null };
  };
  const mode = (): string => {
    try {
      const entries = readProviderEntries(join(dataFolder, "config.json"));
      const a = entries.find((e) => e.type === "anthropic");
      if (a) return `anthropic:${a.model ?? DEFAULT_MODEL} with tools`;
      if (entries.length) return `${entries[0].type}${entries[0].model ? `:${entries[0].model}` : ""} (summary of search hits)`;
    } catch (err) { return `config.json: ${err instanceof Error ? err.message : String(err)}`; }
    return "plain search";
  };
  const info = (): ChatInfo => {
    const t = target();
    return { messages: [...messages], mode: mode(), mcpUrl: t.url, withToken: t.token !== null, ownKey: hasOwnAnthropicKey(dataFolder), busy, error };
  };

  return {
    info,
    clear(): ChatInfo { messages = []; error = null; save(); return info(); },
    setKey(key: string, model?: string): ChatInfo { setAnthropicKey(dataFolder, key, model); error = null; return info(); },
    removeKey(): ChatInfo { removeAnthropicKey(dataFolder); return info(); },
    async send(text: string): Promise<ChatInfo> {
      const question = text.trim().slice(0, 2000);
      if (!question || busy) return info();
      busy = true; error = null;
      const history = [...messages];
      messages.push({ role: "user", text: question, at: new Date().toISOString(), model: null, sources: [], steps: [] });
      try {
        const config = join(dataFolder, "config.json");
        const entries = readProviderEntries(config);
        const providers = entries.some((e) => e.type === "anthropic") ? [] : loadProviders(config);
        const r = await answer({ mcp: target(), entries, providers, history, question });
        messages.push({ role: "assistant", text: r.text, at: new Date().toISOString(), model: r.model, sources: r.sources, steps: r.steps });
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      } finally {
        busy = false;
        messages = messages.slice(-MAX_MESSAGES);
        save();
      }
      return info();
    },
  };
}
