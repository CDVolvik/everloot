import type { AnalyticsConfig } from "./config";
import "./track";

export interface PrivacySignals { doNotTrack?: string | null; globalPrivacyControl?: boolean }

/** Browser opt-out signals: Do Not Track and Global Privacy Control. */
export function privacySignals(nav: Navigator): PrivacySignals {
  const n = nav as Navigator & { globalPrivacyControl?: boolean };
  return { doNotTrack: n.doNotTrack, globalPrivacyControl: n.globalPrivacyControl };
}
export const optedOutBySignal = (s: PrivacySignals) => s.doNotTrack === "1" || s.globalPrivacyControl === true;

const CF_ID = "everloot-cf-beacon";
const GA_ID = "everloot-ga";

/** Cloudflare Web Analytics: no cookies, no consent needed, skipped when the browser asks not to be tracked. */
export function loadCookieless(config: AnalyticsConfig, signals: PrivacySignals, doc: Document): void {
  if (!config.cfBeaconToken || optedOutBySignal(signals) || doc.getElementById(CF_ID)) return;
  const script = doc.createElement("script");
  script.id = CF_ID;
  script.defer = true;
  script.src = "https://static.cloudflareinsights.com/beacon.min.js";
  script.setAttribute("data-cf-beacon", JSON.stringify({ token: config.cfBeaconToken }));
  doc.head.appendChild(script);
}

/** Google Analytics 4 and PostHog use cookies or storage, so they start only after "accepted". */
export function loadConsented(config: AnalyticsConfig, win: Window, doc: Document): void {
  if (config.gaId && !doc.getElementById(GA_ID)) {
    const w = win as Window & { dataLayer?: unknown[] };
    w.dataLayer = w.dataLayer ?? [];
    // gtag.js reads the dataLayer entries as `arguments` objects, so this cannot be an arrow function.
    const gtag = function (..._args: unknown[]) { w.dataLayer!.push(arguments); };
    win.gtag = gtag as unknown as Window["gtag"];
    gtag("js", new Date());
    gtag("config", config.gaId);
    const script = doc.createElement("script");
    script.id = GA_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.gaId)}`;
    doc.head.appendChild(script);
  }
  if (config.posthogKey) void startPosthog(config, win);
}

async function startPosthog(config: AnalyticsConfig, win: Window): Promise<void> {
  const { default: posthog } = await import("posthog-js");
  if (!posthog.__loaded) {
    posthog.init(config.posthogKey!, {
      api_host: config.posthogHost,
      autocapture: false,
      disable_session_recording: true,
      capture_pageview: "history_change",
      person_profiles: "identified_only",
    });
  }
  posthog.opt_in_capturing();
  win.posthog = posthog;
}

/**
 * Called when analytics consent is not "accepted". Removes the tag and stops PostHog. Code that
 * already ran cannot be recalled, so the banner reloads the page after a withdrawal.
 */
export function unloadConsented(doc: Document, win: Window): void {
  doc.getElementById(GA_ID)?.remove();
  delete win.gtag;
  win.posthog?.opt_out_capturing?.();
  delete win.posthog;
}
