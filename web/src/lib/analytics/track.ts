import type { EventMap, EventName } from "./events";

type Gtag = (command: "event", name: string, props?: Record<string, unknown>) => void;
declare global {
  interface Window {
    posthog?: { capture?: (name: string, props?: Record<string, unknown>) => void; opt_out_capturing?: () => void };
    gtag?: Gtag;
  }
}

/**
 * Sends a product event to whichever tools consent has already loaded. With nothing loaded (no env
 * vars, no consent, server render) it does nothing, so call sites never need to check.
 */
export function track<E extends EventName>(name: E, props: EventMap[E]): void {
  if (typeof window === "undefined") return;
  try {
    window.posthog?.capture?.(name, props);
    window.gtag?.("event", name, props);
  } catch {
    // Analytics must never break the page.
  }
}
