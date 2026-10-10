/** A provider failure. `fallthrough` means another provider might still answer (auth, credit, rate limit, timeout, 5xx). */
export class ProviderError extends Error {
  constructor(readonly provider: string, message: string, readonly fallthrough: boolean) {
    super(`${provider}: ${message}`);
  }
}

export interface Reply { text: string; model: string }

export interface Provider {
  name: string;
  complete(system: string, user: string): Promise<Reply>;
}

/**
 * Try the user's enabled providers in their order (design section 6.5). Fall through only on a provider
 * failure, never on answer quality; nothing the user did not enable is ever tried.
 */
export async function completeWithFallback(providers: Provider[], system: string, user: string): Promise<Reply> {
  if (providers.length === 0) throw new Error("No provider is enabled.");
  const failures: string[] = [];
  for (const provider of providers) {
    try {
      return await provider.complete(system, user);
    } catch (err) {
      if (err instanceof ProviderError && err.fallthrough) {
        failures.push(err.message);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`All providers failed: ${failures.join("; ")}`);
}
