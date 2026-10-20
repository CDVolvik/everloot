import type { LoadingArt } from "@/lib/game-assets";

// A game loading screen as a section hub's wide-screen banner. One rule everywhere it appears: only on
// the section hubs (map, patch notes, lore; the home hero and the raid planner may use it the same way),
// edge to edge across the viewport, cropped to fill, slightly dimmed, fading into the page (ui/Banner),
// with the page's breadcrumb and title on it and the credit line as its caption.
//
// BannerArt is the picture alone, for PageHeader's `banner`: <PageHeader banner={{ image: <BannerArt
// art={art} eager />, credit }} … />. The picture is decorative (empty alt, hidden from screen readers);
// the title and text are real text. Rendered only when the page has the art.
export function BannerArt({ art, eager = false }: { art: LoadingArt; eager?: boolean }) {
  return (
    // The files come from the asset bucket as they are (already sized WebP); next/image would only proxy them.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={art.url}
      srcSet={art.small ? `${art.small.url} ${art.small.width}w, ${art.url} ${art.width}w` : undefined}
      sizes="100vw"
      alt=""
      aria-hidden="true"
      data-page-banner
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className="absolute inset-0 h-full w-full object-cover object-center brightness-90"
    />
  );
}
