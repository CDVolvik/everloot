/**
 * The providers the /chat page offers. The player brings their own key; it is kept in this
 * browser (localStorage) and sent from the page straight to that provider, never to Everloot.
 * Only providers whose APIs accept calls from a web page are listed: Anthropic and OpenRouter
 * answer the browser's CORS check, and a local Ollama does once it allows the site's origin.
 * OpenCode Zen does not, so it stays in the Desktop App only.
 */
export type ChatProviderKind = "anthropic" | "openrouter" | "ollama";

export interface ChatModel { id: string; label: string; note: string }

export interface ChatProviderPreset {
  kind: ChatProviderKind;
  label: string;
  /** Anthropic's Messages API, or an OpenAI-compatible base URL. */
  api: "anthropic" | "openai";
  baseUrl: string;
  /** What a pasted key must look like; null when no key is needed. */
  keyPattern: RegExp | null;
  keyHint: string;
  models: ChatModel[];
  /** What the player should know before sending questions there. */
  dataNote: string;
}

export const CHAT_PROVIDERS: ChatProviderPreset[] = [
  {
    kind: "openrouter",
    label: "OpenRouter (one key, many models)",
    api: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    keyPattern: /^sk-or-[A-Za-z0-9_-]{20,}$/,
    keyHint: "A key from openrouter.ai/keys (sk-or-…). The free model needs no credits.",
    models: [
      { id: "deepseek/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash", note: "$0.05 / $0.12 per million tokens" },
      { id: "qwen/qwen3.7-flash", label: "Qwen 3.7 Flash", note: "$0.03 / $0.13" },
      { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", note: "$0.15 / $0.60" },
      { id: "google/gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite", note: "$0.30 / $2.50" },
      { id: "anthropic/claude-haiku-5.5", label: "Claude Haiku 5.5", note: "$0.10 / $0.50" },
      { id: "nvidia/nemotron-3.5-lightning:free", label: "Nemotron 3.5 Lightning (free)", note: "free, 50 requests a day" },
    ],
    dataNote: "OpenRouter skips providers that log prompts unless you allow it in your OpenRouter settings.",
  },
  {
    kind: "anthropic",
    label: "Anthropic (Claude)",
    api: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    keyPattern: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
    keyHint: "An API key from console.anthropic.com (sk-ant-…). A Claude.ai subscription cannot be used here.",
    models: [
      { id: "claude-sonnet-5-5", label: "Sonnet 5.5", note: "$3 / $15 per million tokens" },
      { id: "claude-haiku-5-5", label: "Haiku 5.5", note: "$1 / $5, fast" },
      { id: "claude-opus-5-5", label: "Opus 5.5", note: "$15 / $75, best" },
    ],
    dataNote: "API traffic is not used to train Anthropic's models.",
  },
  {
    kind: "ollama",
    label: "Ollama on this computer",
    api: "openai",
    baseUrl: "http://localhost:11434/v1",
    keyPattern: null,
    keyHint: "",
    models: [],
    dataNote: "Nothing leaves your computer. Start Ollama with OLLAMA_ORIGINS=https://everloot.app so this page may reach it, and pick a model that supports tool calling, such as qwen3.",
  },
];

export function chatProvider(kind: string): ChatProviderPreset | null {
  return CHAT_PROVIDERS.find((p) => p.kind === kind) ?? null;
}

/** Model ids are provider/model names with the odd colon or dot; anything else is a paste of the wrong thing. */
export const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,120}$/;
