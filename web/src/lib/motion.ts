// Motion started from JavaScript (smooth scrolling, Leaflet's zoom) is out of reach of the reduced-motion rule
// in globals.css, so it asks the browser itself (visual identity spec, item 12).

/** True when the visitor asked for reduced motion. False on the server. */
export const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** `behavior` for scrollTo and scrollIntoView: smooth, unless the visitor asked for reduced motion. */
export const scrollBehavior = (): ScrollBehavior => (reducedMotion() ? "auto" : "smooth");
