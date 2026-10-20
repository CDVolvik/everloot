import type { LoadingArt } from "@/lib/game-assets";

// A game loading screen as a section hub's wide-screen banner. One rule everywhere it appears: only on
// the section hubs (map, patch notes, lore; the home hero and the raid planner may use it the same way),
// edge to edge across the viewport, cropped to fill, at full brightness, fading into the page only where
// the text sits (ui/Banner), with the page's title on it and a one-line caption. The full credit, with
// the build, is on /methodology#credits.
//
// BannerArt is the picture alone, for PageHeader's `banner`: <PageHeader banner={{ image: <BannerArt
// art={art} eager /> }} … />. The picture is decorative (empty alt, hidden from screen readers);
// the title and text are real text. Rendered only when the page has the art.
//
// `position` is the CSS object-position of the crop (centred by default). `sizes` is the width the
// picture is drawn at; a banner taller than the art's shape on a phone is drawn wider than the screen.
export function BannerArt({ art, eager = false, position, sizes = "100vw" }: { art: LoadingArt; eager?: boolean; position?: string; sizes?: string }) {
  return (
    // The files come from the asset bucket as they are (already sized WebP); next/image would only proxy them.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={art.url}
      srcSet={art.small ? `${art.small.url} ${art.small.width}w, ${art.url} ${art.width}w` : undefined}
      sizes={sizes}
      alt=""
      aria-hidden="true"
      data-page-banner
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className="absolute inset-0 h-full w-full object-cover object-center"
      style={position ? { objectPosition: position } : undefined}
    />
  );
}
