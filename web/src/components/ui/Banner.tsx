import type { CSSProperties, ReactNode } from "react";

// The art stays bright at the top and on the right; the canvas comes in only where the text sits. The
// bottom fade carries the art into the page and sits under the breadcrumb, title and caption (on a
// phone they fill the lower half, so its fade rises higher); the corner shade darkens the bottom-left
// behind the title on a wide screen. Text stays at least 4.5:1 over the art at its brightest point.
// The one gradient the design guard allows (Carlos, 10/19), and only in this file.
const FADE_NARROW: CSSProperties = {
  backgroundImage: "linear-gradient(to top, rgb(var(--canvas)) 0%, rgb(var(--canvas) / 0.9) 22%, rgb(var(--canvas) / 0.75) 50%, rgb(var(--canvas) / 0.6) 62%, rgb(var(--canvas) / 0) 100%)",
};
const FADE_WIDE: CSSProperties = {
  backgroundImage: "linear-gradient(to top, rgb(var(--canvas)) 0%, rgb(var(--canvas) / 0.8) 20%, rgb(var(--canvas) / 0.45) 50%, rgb(var(--canvas) / 0) 100%)",
};
const CORNER: CSSProperties = {
  backgroundImage: "radial-gradient(ellipse 55% 75% at 12% 100%, rgb(var(--canvas) / 0.6) 0%, rgb(var(--canvas) / 0.35) 50%, rgb(var(--canvas) / 0) 100%)",
};

/** The banner's caption: one line in its corner. The full credit, with the build, is at the foot of the page (GameCredit). */
export const BANNER_CAPTION = "Art: WoW: Forever game files · © Blizzard Entertainment";

/**
 * A wide-screen banner across the top of a section hub: the picture runs edge to edge across the
 * viewport, at least 256 px tall on a phone and 336 px from `lg`, cropped to fill, and fades into the canvas.
 * `children` (the page's breadcrumb and title, from PageHeader) sit on its bottom-left in the page's
 * column, over the art at every width. The caption is one line, bottom-right on a wide screen and under
 * the title on a narrow one. Use it as the first thing in the layout's `<main>`, not inside a Container:
 * it cancels the main's top padding so it meets the site header. Body clips the sideways bleed (globals.css).
 */
export default function Banner({ image, children }: { image: ReactNode; children?: ReactNode }) {
  return (
    <div data-banner className="relative -mt-8 flex min-h-64 flex-col justify-end pb-4 pt-18 lg:min-h-[21rem] lg:pb-8">
      <div data-banner-art className="absolute inset-y-0 left-[calc(50%-50vw)] w-screen overflow-hidden bg-panel">
        {image}
        <div aria-hidden="true" className="absolute inset-0 lg:hidden" style={FADE_NARROW} />
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 hidden h-3/4 lg:block" style={FADE_WIDE} />
        <div aria-hidden="true" className="absolute inset-0 hidden lg:block" style={CORNER} />
      </div>
      <div className="relative min-w-0 lg:max-w-[calc(100%-26rem)]">{children}</div>
      <p data-banner-credit className="relative mt-3 text-xs text-fg-2 lg:absolute lg:bottom-8 lg:right-0 lg:mt-0">
        {BANNER_CAPTION}
      </p>
    </div>
  );
}
