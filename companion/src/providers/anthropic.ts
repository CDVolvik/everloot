import Anthropic from "@anthropic-ai/sdk";
import { ProviderError, type Provider } from "./chain";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

/** Statuses another provider might survive: auth, billing, permission, rate limit, and server or overload errors. */
const FALLTHROUGH = new Set([401, 402, 403, 429]);

/**
 * Claude through the official SDK with the user's own API key. Low effort suits a two-sentence grounded
 * answer; server-side fallback re-runs a policy decline on another model inside the same call.
 */
export function createAnthropicProvider(options: { apiKey: string; model?: string; client?: Anthropic }): Provider {
  const model = options.model ?? DEFAULT_ANTHROPIC_MODEL;
  const client = options.client ?? new Anthropic({ apiKey: options.apiKey, timeout: 60_000, maxRetries: 1 });
  const name = `anthropic:${model}`;
  return {
    name,
    async complete(system, user) {
      let response;
      try {
        response = await client.beta.messages.create({
          model,
          max_tokens: 4000,
          system,
          output_config: { effort: "low" },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          messages: [{ role: "user", content: user }],
        });
      } catch (err) {
        // APIConnectionError (including timeouts) subclasses APIError in this SDK, so it is checked first.
        if (err instanceof Anthropic.APIConnectionError) throw new ProviderError(name, err.message, true);
        if (err instanceof Anthropic.APIError) {
          const status = err.status ?? 0;
          throw new ProviderError(name, `HTTP ${status}: ${err.message}`, FALLTHROUGH.has(status) || status >= 500);
        }
        throw err;
      }
      if (response.stop_reason === "refusal") throw new ProviderError(name, "declined to answer", false);
      const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join(" ").trim();
      if (!text) throw new ProviderError(name, "returned no text", false);
      return { text, model: response.model };
    },
  };
}
