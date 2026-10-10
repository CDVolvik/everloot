import { ProviderError, type Provider } from "./chain";

/** Any OpenAI-compatible chat endpoint: DeepSeek, OpenRouter, or a local Ollama (no key needed). */
export function createOpenAICompatibleProvider(options: {
  baseUrl: string; model: string; apiKey?: string; fetch?: typeof fetch;
}): Provider {
  const send = options.fetch ?? fetch;
  const name = `openai-compatible:${options.model}`;
  return {
    name,
    async complete(system, user) {
      let response: Response;
      try {
        response = await send(`${options.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: options.model,
            // Reasoning models spend tokens before answering; a small cap returned empty text in testing.
            max_tokens: 2000,
            messages: [{ role: "system", content: system }, { role: "user", content: user }],
          }),
          signal: AbortSignal.timeout(60_000),
        });
      } catch (err) {
        throw new ProviderError(name, err instanceof Error ? err.message : String(err), true);
      }
      if (!response.ok) {
        const s = response.status;
        throw new ProviderError(name, `HTTP ${s}`, s === 401 || s === 402 || s === 403 || s === 429 || s >= 500);
      }
      const body = (await response.json()) as {
        model?: string; choices?: { finish_reason?: string; message?: { content?: string } }[];
      };
      const choice = body.choices?.[0];
      const text = choice?.message?.content?.trim();
      // Out of tokens before any answer: another provider (or a larger model) may still answer.
      if (!text && choice?.finish_reason === "length") throw new ProviderError(name, "hit its token limit before answering", true);
      if (!text) throw new ProviderError(name, "returned no text", false);
      return { text, model: body.model ?? options.model };
    },
  };
}
