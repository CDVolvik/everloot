"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MOTION } from "@/design/tokens";

// Feedback while a filter, sort header, pager or link tab loads its page (motion audit 2026-10-20, H1). Those
// controls are links to server-rendered pages, so without this a slow click looks like one that did not register.
// The links say when they start (ui/PendingLink); the page's address changing says the new page has arrived.

/** If the address never changes (a link that ends where it started), the bar gives up after this long. */
const GIVE_UP_MS = 10_000;

let pending = false;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const isPending = () => pending;
const set = (on: boolean) => {
  if (pending === on) return;
  pending = on;
  listeners.forEach((listener) => listener());
};

/** A link started a client-side navigation to `href`. A link to the page already shown (its own tab) is ignored. */
export function navigationStarted(href: string) {
  const to = new URL(href, window.location.href);
  if (to.pathname === window.location.pathname && to.search === window.location.search) return;
  set(true);
}

/** How long the bar takes to complete and fade once the page is in (`.nav-pending[data-state="done"]`). */
export const DONE_MS = MOTION.duration.exit + MOTION.duration.fade;

/** idle: not there. on: shown, growing. done: the page arrived; it completes and fades, then is idle again. */
type Phase = "idle" | "on" | "done";

function Bar() {
  const path = usePathname();
  const search = useSearchParams()?.toString();
  const busy = useSyncExternalStore(subscribe, isPending, () => false);
  const [phase, setPhase] = useState<Phase>("idle");
  const gaveUp = useRef(false);

  // The new page is in: whatever was loading has finished.
  useEffect(() => set(false), [path, search]);

  useEffect(() => {
    const main = document.getElementById("main-content");
    if (!busy) {
      main?.removeAttribute("aria-busy");
      // A bar that was showing completes, unless it gave up (nothing arrived); one that never showed stays away.
      const finish = !gaveUp.current;
      setPhase((p) => (p === "on" && finish ? "done" : "idle"));
      return;
    }
    gaveUp.current = false;
    main?.setAttribute("aria-busy", "true");
    // A new load during the finish starts again from the bar's 10 %.
    setPhase("idle");
    const show = window.setTimeout(() => setPhase("on"), MOTION.duration.pendingDelay);
    const giveUp = window.setTimeout(() => { gaveUp.current = true; set(false); }, GIVE_UP_MS);
    return () => { window.clearTimeout(show); window.clearTimeout(giveUp); };
  }, [busy]);

  useEffect(() => {
    if (phase !== "done") return;
    const reset = window.setTimeout(() => setPhase("idle"), DONE_MS);
    return () => window.clearTimeout(reset);
  }, [phase]);

  return <div aria-hidden="true" data-state={phase} className="nav-pending pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 bg-accent" />;
}

/**
 * A 2 px accent bar across the top of the window, and `aria-busy` on <main>, while a PendingLink's page loads. The
 * bar waits MOTION.duration.pendingDelay first, so a page that arrives quickly never flashes it, then fades in and
 * grows towards 90 % (CSS, `.nav-pending`); when the page arrives it completes and fades. If nothing arrives it gives
 * up after 10 s and goes at once. Nothing is dimmed and no skeleton replaces the data.
 */
export function NavPendingBar() {
  return <Suspense fallback={null}><Bar /></Suspense>;
}
