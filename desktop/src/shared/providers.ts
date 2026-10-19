/**
 * The providers the Chat page offers, shared by the page (the picker) and the Node side (what gets
 * written to config.json). Every one is the player's own account: the key stays in a file in the
 * data folder and the requests go from the player's computer to that provider only. Anthropic and
 * OpenAI allow API keys in third-party apps but not their consumer sign-ins, so there is no "connect
 * your Claude or ChatGPT account" here.
 */
export type ProviderKind = "anthropic" | "openrouter" | "opencode" | "ollama" | "custom";

export interface ModelChoice {
  id: string;
  label: string;
  /** Price per million tokens in and out, or "free" with its catch, as a short note for the picker. */
  note: string;
}

export interface ProviderPreset {
  kind: ProviderKind;
  label: string;
  /** The OpenAI-compatible base URL, or null for Anthropic's own API. "custom" takes it from the page. */
  baseUrl: string | null;
  /** The file in the data folder the key is written to; null when no key is needed (a local Ollama). */
  keyFile: string | null;
  /** What a pasted key must look like, when the provider has a recognisable prefix. */
  keyPattern: RegExp | null;
  keyHint: string;
  models: ModelChoice[];
  /** What the player should know before sending questions there. */
  dataNote: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    kind: "anthropic",
    label: "Anthropic (Claude)",
    baseUrl: null,
    keyFile: "anthropic.key",
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
    kind: "openrouter",
    label: "OpenRouter (one key, many models)",
    baseUrl: "https://openrouter.ai/api/v1",
    keyFile: "openrouter.key",
    keyPattern: /^sk-or-[A-Za-z0-9_-]{20,}$/,
    keyHint: "A key from openrouter.ai/keys (sk-or-…).",
    models: [
      { id: "deepseek/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash", note: "$0.05 / $0.12, tool calling" },
      { id: "qwen/qwen3.7-flash", label: "Qwen 3.7 Flash", note: "$0.03 / $0.13" },
      { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", note: "$0.15 / $0.60" },
      { id: "google/gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite", note: "$0.30 / $2.50" },
      { id: "anthropic/claude-haiku-5.5", label: "Claude Haiku 5.5", note: "$0.10 / $0.50" },
      { id: "nvidia/nemotron-3.5-lightning:free", label: "Nemotron 3.5 Lightning (free)", note: "free, 50 requests a day until you buy $10 of credits" },
      { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B (free)", note: "free, 50 requests a day until you buy $10 of credits" },
    ],
    dataNote: "OpenRouter skips providers that log prompts unless you allow it in your account settings.",
  },
  {
    kind: "opencode",
    label: "OpenCode Zen (free models)",
    baseUrl: "https://opencode.ai/inference/openai/v1",
    keyFile: "opencode.key",
    keyPattern: null,
    keyHint: "A key from opencode.ai/zen. The free models are free for a limited time.",
    models: [
      { id: "glm-5.3-flash-free", label: "GLM 5.3 Flash (free)", note: "free, zero retention" },
      { id: "deepseek-v4.1-flash-free", label: "DeepSeek V4.1 Flash (free)", note: "free, zero retention" },
      { id: "space-bunny-free", label: "Space Bunny (free)", note: "free, zero retention" },
      { id: "longcat-2.5-preview-free", label: "LongCat 2.5 Preview (free)", note: "free, zero retention" },
    ],
    dataNote: "Only Zen's zero-retention free models are listed; its other free models may train on your prompts.",
  },
  {
    kind: "ollama",
    label: "Ollama on this computer",
    baseUrl: "http://localhost:11434/v1",
    keyFile: null,
    keyPattern: null,
    keyHint: "",
    models: [],
    dataNote: "Nothing leaves your computer. Pick a model you pulled that supports tool calling, such as qwen3 or llama3.1.",
  },
  {
    kind: "custom",
    label: "Another OpenAI-compatible server",
    baseUrl: null,
    keyFile: "custom.key",
    keyPattern: null,
    keyHint: "Optional; leave empty for a server without keys.",
    models: [],
    dataNote: "Read that server's data policy before sending questions to it.",
  },
];

export function presetFor(kind: string): ProviderPreset | null {
  return PROVIDER_PRESETS.find((p) => p.kind === kind) ?? null;
}

/** What the page sends when the player saves a provider. */
export interface ProviderChoice {
  kind: ProviderKind;
  key?: string;
  model?: string;
  baseUrl?: string;
}

/** The provider the app wrote to config.json, without the key, for the page to show. */
export interface ProviderInUse { kind: ProviderKind; model: string; baseUrl: string | null }

/** Model ids are provider/model names with the odd colon or dot; anything else is a paste of the wrong thing. */
export const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,120}$/;
