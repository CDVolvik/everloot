import type { CSSProperties, ReactNode } from "react";

// The art fades into the page instead of ending at a box edge: from the bottom, and from the left where
// the title sits, so the text always has the canvas under it (at least 4.5:1, checked over the art).
// The one gradient the design guard allows (Carlos, 10/19), and only in this file.
const SCRIM: CSSProperties = {
  backgroundImage: [
    "linear-gradient(to top, rgb(var(--canvas)) 0%, rgb(var(--canvas) / 0.9) 40%, rgb(var(--canvas) / 0.55) 75%, rgb(var(--canvas) / 0.25) 100%)",
    "linear-gradient(to right, rgb(var(--canvas) / 0.85) 0%, rgb(var(--canvas) / 0.5) 45%, rgb(var(--canvas) / 0) 75%)",
  ].join(", "),
};

/**
 * A wide-screen banner across the top of a section hub: the picture runs edge to edge across the
 * viewport, 176 px tall on a phone and 288 px from `sm`, cropped to fill, and fades into the canvas.
 * `children` (the page's breadcrumb and title, from PageHeader) sit on its bottom-left in the page's
 * column; `credit` is the picture's caption, bottom-right on a wide screen and under the title on a
 * narrow one. Use it as the first thing in the layout's `<main>`, not inside a Container: it cancels
 * the main's top padding so it meets the site header. Body clips the sideways bleed (globals.css).
 */
export default function Banner({ image, credit, children }: { image: ReactNode; credit?: ReactNode; children?: ReactNode }) {
  return (
    <div data-banner className="relative -mt-8 flex min-h-44 flex-col justify-end pb-4 pt-18 sm:min-h-72 lg:pb-6">
      <div data-banner-art className="absolute left-[calc(50%-50vw)] top-0 h-44 w-screen overflow-hidden bg-panel sm:h-72">
        {image}
        <div aria-hidden="true" className="absolute inset-0" style={SCRIM} />
      </div>
      <div className="relative min-w-0 lg:max-w-[calc(100%-26rem)]">{children}</div>
      {credit && (
        <div data-banner-credit className="relative mt-3 text-xs text-fg-2 lg:absolute lg:bottom-6 lg:right-0 lg:mt-0 lg:max-w-sm lg:text-right [&_*]:text-fg-2">
          {credit}
        </div>
      )}
    </div>
  );
}
