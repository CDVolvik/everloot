import type { ReactNode } from "react";
import type { LoadingArt } from "@/lib/game-assets";

// A game loading screen on a section's hub page, one treatment everywhere it appears (map, patch notes):
// the full wide column, 112 px tall on a phone and 160 px from `sm`, cropped to the centre, in greyscale
// and dimmed so it never competes with the accent (comp A's rule for game art). It sits under the page
// header, so the title starts at the same height on every page. The picture is decorative (empty alt,
// hidden from screen readers); the page's title and text are real text. A fixed height keeps the layout
// still while the file arrives. Rendered only when the page has the art. `credit` is the page's credit
// line (GameCredit), shown as the banner's caption, in the muted small style on the canvas.
export default function PageBanner({ art, eager = false, credit }: { art: LoadingArt; eager?: boolean; credit?: ReactNode }) {
  const picture = (
    <div aria-hidden="true" data-page-banner className="relative h-28 overflow-hidden rounded-card border border-line bg-panel sm:h-40">
      {/* The files come from the asset bucket as they are (already sized WebP); next/image would only proxy them. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={art.url}
        srcSet={art.small ? `${art.small.url} ${art.small.width}w, ${art.url} ${art.width}w` : undefined}
        sizes="(min-width: 1152px) 1152px, 100vw"
        alt=""
        aria-hidden="true"
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover object-center brightness-75 grayscale"
      />
    </div>
  );
  if (!credit) return picture;
  return (
    <figure data-banner className="mb-8 space-y-2">
      {picture}
      <figcaption>{credit}</figcaption>
    </figure>
  );
}
