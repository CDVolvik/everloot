// Motion started from JavaScript (smooth scrolling, Leaflet's zoom, the raid planner's glide) is out of reach of the
// reduced-motion rule in globals.css, so it asks the browser itself (visual identity spec, item 12).

import { MOTION } from "@/design/tokens";

/** True when the visitor asked for reduced motion. False on the server. */
export const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** `behavior` for scrollTo and scrollIntoView: smooth, unless the visitor asked for reduced motion. */
export const scrollBehavior = (): ScrollBehavior => (reducedMotion() ? "auto" : "smooth");

/**
 * FLIP: `el` now shows something that was at `first` (a rect read before the change, which includes any glide still
 * running there), and it glides from there into place over MOTION.duration.panel. A glide already running on `el`
 * is replaced, so a second move mid-way starts from where the eye is. Nothing moves under reduced motion, without
 * layout (a hidden element) or when the place did not change.
 */
export function glide(el: HTMLElement, first: DOMRect) {
  if (reducedMotion() || typeof el.animate !== "function") return;
  el.getAnimations?.().forEach((animation) => animation.cancel());
  const last = el.getBoundingClientRect();
  if (!first.width || !last.width) return;
  const dx = first.left - last.left;
  const dy = first.top - last.top;
  if (!dx && !dy) return;
  el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: MOTION.duration.panel, easing: MOTION.ease.inOut });
}
