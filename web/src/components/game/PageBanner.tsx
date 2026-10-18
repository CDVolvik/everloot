import type { LoadingArt } from "@/lib/game-assets";

// A game loading screen across the top of a page. It is atmosphere only: the page's title and text are
// real text beside it, so the picture is decorative (empty alt, hidden from screen readers). A fixed
// height keeps the layout from moving while the file arrives. Rendered only when the page has the art;
// without the asset URL nothing here is drawn. The page shows the credit line with it.
export default function PageBanner({ art, eager = false }: { art: LoadingArt; eager?: boolean }) {
  return (
    <div aria-hidden="true" data-page-banner className="relative h-28 overflow-hidden rounded-xl border border-line bg-panel sm:h-40">
      {/* The files come from the asset bucket as they are (already sized WebP); next/image would only proxy them. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={art.url}
        srcSet={art.small ? `${art.small.url} ${art.small.width}w, ${art.url} ${art.width}w` : undefined}
        sizes="(min-width: 1024px) 1024px, 100vw"
        alt=""
        aria-hidden="true"
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  );
}
