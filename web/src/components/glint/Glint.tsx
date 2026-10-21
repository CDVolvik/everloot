"use client";

import { useEffect, useId, useRef } from "react";
import { GLINT, MOTION, type QUALITIES, tokens } from "@/design/tokens";
import { reducedMotion } from "@/lib/motion";
import "./glint.css";

export type GlintPose = "idle" | "cheer" | "sad";
/** The gem's colour: Everloot green (the logo's), or an item quality's. */
export type GlintGem = "everloot" | (typeof QUALITIES)[number];

export interface GlintProps {
  /** Width and height in px. CSS width and height classes override it. */
  size?: number;
  pose?: GlintPose;
  gem?: GlintGem;
  /** Names the drawing for screen readers. Without it Glint is decorative and hidden from them. */
  label?: string;
  /** No blinking and no observers: a drawing that never moves. */
  still?: boolean;
  /** Each new value flaps the wings once (hover or click on whatever holds him). */
  flap?: number;
  className?: string;
}

export const gemColour = (gem: GlintGem): string => (gem === "everloot" ? tokens.dark.accent : tokens.dark[`q-${gem}`]);

/** `hex` moved `t` of the way to `toward`: the gem's lit and shaded facets. */
function mix(hex: string, toward: string, t: number): string {
  const c = (s: string, i: number) => parseInt(s.slice(i, i + 2), 16);
  return "#" + [1, 3, 5].map((i) => Math.round(c(hex, i) + (c(toward, i) - c(hex, i)) * t).toString(16).padStart(2, "0")).join("");
}

// Pivots in the drawing's own units (the inner viewBox 0 0 200 200), for transforms set here and in glint.css.
const pivot = (x: number, y: number) => ({ transformBox: "view-box", transformOrigin: `${x}px ${y}px` }) as const;
const WING_L = pivot(64, 104);
const WING_R = pivot(136, 104);
const HEAD = pivot(102, 100);
const LID = pivot(120, 38.5);
const SPARKLE = pivot(117, 124);

const POSE = {
  idle: { wing: 0, head: 0, lid: 0 },
  cheer: { wing: 72, head: -6, lid: 0 },
  sad: { wing: 0, head: 10, lid: 0.55 },
} as const;

const line = { stroke: GLINT.outline, strokeWidth: 4, strokeLinejoin: "round", strokeLinecap: "round" } as const;

/**
 * Glint, the loot raven: a flat sticker drawing, hand-coded (brand brief: thick outline, near-black body with
 * blue-black sheen, gold beak and talons, green eyes and gem, a leather satchel). Each part is its own group so
 * glint.css can move it: the body breathes, the head tilts now and then, the eye blinks at random, the gem sparkles,
 * and the wings flap when `flap` changes. A pose sits on an outer group and the motion on an inner one, so the two
 * never fight over one transform. Under `prefers-reduced-motion` he holds still. The loops pause while he is
 * off-screen or the tab is hidden.
 */
export default function Glint({ size = 160, pose = "idle", gem = "everloot", label, still = false, flap = 0, className }: GlintProps) {
  const ref = useRef<SVGSVGElement>(null);
  const edge = `glint-edge-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const p = POSE[pose];
  const base = gemColour(gem);

  useEffect(() => {
    const svg = ref.current;
    if (still || !svg) return;
    const { blink, blinkMin, blinkMax } = MOTION.glint.duration;
    let onScreen = true;
    let next: number | undefined;
    let open: number | undefined;
    const paused = () => !onScreen || document.hidden;
    const sync = () => svg.toggleAttribute("data-paused", paused());
    const schedule = () => {
      next = window.setTimeout(() => {
        if (!paused() && !reducedMotion()) {
          svg.setAttribute("data-blink", "");
          open = window.setTimeout(() => svg.removeAttribute("data-blink"), blink);
        }
        schedule();
      }, blinkMin + Math.random() * (blinkMax - blinkMin));
    };
    const observer = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync(); })
      : null;
    observer?.observe(svg);
    document.addEventListener("visibilitychange", sync);
    schedule();
    return () => {
      window.clearTimeout(next);
      window.clearTimeout(open);
      observer?.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [still]);

  useEffect(() => {
    const svg = ref.current;
    if (!flap || still || !svg) return;
    // Restart the flap if one is running: drop the attribute, let the browser see it gone, set it again.
    svg.removeAttribute("data-flap");
    void svg.getBoundingClientRect();
    svg.setAttribute("data-flap", "");
    const done = window.setTimeout(() => svg.removeAttribute("data-flap"), MOTION.glint.duration.flap);
    return () => window.clearTimeout(done);
  }, [flap, still]);

  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };
  return (
    <svg
      ref={ref}
      viewBox="0 0 216 216"
      width={size}
      height={size}
      overflow="visible"
      focusable="false"
      data-glint=""
      data-pose={pose}
      className={className ? `glint ${className}` : "glint"}
      {...a11y}
    >
      {/* The drawing is in its own 200-unit box, nudged so the beak, tufts and sticker edge fit the outer one. */}
      <svg x="-6" y="8" width="200" height="200" viewBox="0 0 200 200" overflow="visible">
        <defs>
          {/* The sticker edge: the drawing's shape, grown and filled cream, behind it. */}
          <filter id={edge} filterUnits="userSpaceOnUse" x="-60" y="-50" width="320" height="300" colorInterpolationFilters="sRGB">
            <feMorphology in="SourceAlpha" operator="dilate" radius="5" result="grown" />
            <feFlood floodColor={GLINT.sticker} />
            <feComposite in2="grown" operator="in" result="edge" />
            <feMerge>
              <feMergeNode in="edge" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g filter={`url(#${edge})`}>
          <g data-part="feet" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M82 174v10m0 0-10 8m10-8v10m0-10 10 8M118 174v10m0 0-10 8m10-8v10m0-10 10 8" stroke={GLINT.outline} strokeWidth="10" />
            <path d="M82 174v10m0 0-10 8m10-8v10m0-10 10 8M118 174v10m0 0-10 8m10-8v10m0-10 10 8" stroke={GLINT.gold} strokeWidth="5" />
          </g>
          <g className="glint-bob">
            <path data-part="body" d="M64 98C44 112 38 146 48 168c10 20 94 20 104 0 10-22 4-56-16-70Z" fill={GLINT.body} {...line} />
            <g style={{ ...WING_L, transform: `rotate(${p.wing}deg)` }}>
              <g className="glint-wing glint-wing-l" data-part="wing" style={WING_L}>
                <path d="M64 102C42 110 32 136 36 160c2 10 6 16 10 20l4-10 6 10 4-12 6 6c6-24 10-54-2-72Z" fill={GLINT.body} {...line} />
                <path d="M57 113c-10 12-14 28-12 44" fill="none" stroke={GLINT.sheen} strokeWidth="4" strokeLinecap="round" />
              </g>
            </g>
            <g style={{ ...WING_R, transform: `rotate(${-p.wing}deg)` }}>
              <g className="glint-wing glint-wing-r" data-part="wing" style={WING_R}>
                <path d="M136 102c22 8 32 34 28 58-2 10-6 16-10 20l-4-10-6 10-4-12-6 6c-6-24-10-54 2-72Z" fill={GLINT.body} {...line} />
                <path d="M143 113c10 12 14 28 12 44" fill="none" stroke={GLINT.sheen} strokeWidth="4" strokeLinecap="round" />
              </g>
            </g>
            <g data-part="satchel">
              <path d="M64 124 124 94l10 8-58 28Z" fill={GLINT.leather} {...line} strokeWidth={3.5} />
              <path d="M73 122h58q9 0 9 9v28q0 9-9 9H73q-9 0-9-9v-28q0-9 9-9Z" fill={GLINT.leatherShade} {...line} />
              <path d="M74 146h8v16h-8zM118 146h8v16h-8z" fill={GLINT.leather} {...line} strokeWidth={3} />
              <path d="M62 130q0-12 12-12h56q12 0 12 12v14q0 8-8 9l-32 3-32-3q-8-1-8-9Z" fill={GLINT.leather} {...line} />
              <path d="M72 155h12v8H72zM116 155h12v8h-12z" fill={GLINT.gold} {...line} strokeWidth={3} />
              {pose !== "sad" && (
                <g data-part="gem">
                  <path d="M93 127h18l7 8-16 17-16-17Z" fill={base} />
                  <path d="M93 127h18l-4 8H97Z" fill={mix(base, "#FFFFFF", 0.5)} />
                  <path d="M102 135h16l-16 17ZM111 127l7 8h-11Z" fill={mix(base, "#000000", 0.32)} />
                  <path d="M93 127h18l7 8-16 17-16-17Z" fill="none" {...line} strokeWidth={3.5} />
                  <path className="glint-sparkle" style={{ ...SPARKLE, transform: "scale(0)" }} d="M117 116l2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" fill={GLINT.shine} />
                </g>
              )}
            </g>
            <g style={{ ...HEAD, transform: `rotate(${p.head}deg)` }}>
              <g className="glint-head" data-part="head" style={HEAD}>
                <path d="M66 40 52 22l18 6-4-20 18 14 6-16 10 16Z" fill={GLINT.body} {...line} />
                <path d="M56 70c-4-30 18-54 48-54 28 0 46 18 46 42s-16 46-46 48c-26 2-44-12-48-36Z" fill={GLINT.body} {...line} />
                <path d="M66 62c0-18 12-31 28-36" fill="none" stroke={GLINT.sheen} strokeWidth="5" strokeLinecap="round" />
                <path data-part="beak" d="m132 72 40-3c-4 9-16 15-38 15Z" fill={GLINT.goldShade} {...line} />
                <path data-part="beak" d="M128 50c18-8 42-6 58 4 8 5 10 14 6 26-4-8-12-12-22-12l-40 4Z" fill={GLINT.gold} {...line} />
                <circle cx="143" cy="57" r="2" fill={GLINT.outline} />
                <g data-part="eye">
                  <circle cx="120" cy="52" r="12" fill={GLINT.eye} stroke={GLINT.outline} strokeWidth="3.5" />
                  <circle cx="122" cy="52.5" r="5.5" fill={GLINT.outline} />
                  <circle cx="117.5" cy="48" r="2.6" fill={GLINT.shine} />
                  <circle className="glint-lid" style={{ ...LID, transform: `scaleY(${p.lid})` }} cx="120" cy="52" r="13.5" fill={GLINT.body} stroke={GLINT.outline} strokeWidth="3.5" />
                  <path d="M104 44c6-8 24-10 34-4l-2 4c-10-4-22-2-30 4Z" fill={GLINT.body} {...line} strokeWidth={3} />
                </g>
              </g>
            </g>
          </g>
        </g>
      </svg>
    </svg>
  );
}
