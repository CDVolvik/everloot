import { CATALOGUE, type CatalogueKind, type CatalogueModel, type CatalogueProvider } from "../../../web/src/lib/chat/catalogue";

/**
 * The providers the Chat page offers, shared by the page (the picker) and the Node side (what gets written to
 * config.json). They come from the catalogue the website reads too (web/src/lib/chat/catalogue.ts): every provider
 * there, since the app has no CORS check to pass, and "custom" for any other OpenAI-compatible server. Every one is
 * the player's own account: the key stays in a file in the data folder and the requests go from the player's
 * computer to that provider only. Anthropic and OpenAI allow API keys in third-party apps but not their consumer
 * sign-ins, so there is no "connect your Claude or ChatGPT account" here.
 */
export type ProviderKind = CatalogueKind | "custom";

/** A model, its label, and its price per million tokens in and out (or "free" with its catch) as a short note. */
export type ModelChoice = CatalogueModel;

export interface ProviderPreset {
  kind: ProviderKind;
  /** The provider's own name, on its tile and chips. */
  name: string;
  label: string;
  /** The monogram tile: its letters and the provider's colour. */
  mark: string;
  colour: string;
  /** The OpenAI-compatible base URL, or null for Anthropic's own API. "custom" takes it from the page. */
  baseUrl: string | null;
  /** The file in the data folder the key is written to; null when no key is needed (a local Ollama). */
  keyFile: string | null;
  /** What a pasted key must look like, when the provider has a recognisable prefix. */
  keyPattern: RegExp | null;
  keyHint: string;
  /** How the provider's own model list is read; a custom server is asked like any OpenAI-compatible one. */
  list: CatalogueProvider["list"];
  /** The catalogue's models: the shortlist, and the picker's list when the provider's own cannot be read. */
  models: ModelChoice[];
  /** What the player should know before sending questions there. */
  dataNote: string;
}

const fromCatalogue = (p: CatalogueProvider): ProviderPreset => ({
  kind: p.kind, name: p.name, label: p.label, mark: p.mark, colour: p.colour,
  baseUrl: p.api === "anthropic" ? null : p.baseUrl,
  keyFile: p.key ? `${p.kind}.key` : null,
  keyPattern: p.key?.pattern ?? null,
  keyHint: p.key?.hint ?? "",
  list: p.list,
  models: p.models,
  dataNote: p.kind === "openrouter" ? `${p.dataNote} Another model id must support tool calling (openrouter.ai/models?supported_parameters=tools).` : p.dataNote,
});

export const PROVIDER_PRESETS: ProviderPreset[] = [
  ...CATALOGUE.map(fromCatalogue),
  {
    kind: "custom",
    name: "Another server",
    label: "Another OpenAI-compatible server",
    mark: "+",
    colour: "#4B5563",
    baseUrl: null,
    keyFile: "custom.key",
    keyPattern: null,
    keyHint: "Optional; leave empty for a server without keys.",
    list: "openai",
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
