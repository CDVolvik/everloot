import type { ReactNode } from "react";
import type { LaunchArt } from "@/lib/game-assets";
import GameCredit from "./GameCredit";

// The launch banner at the top of the home page: the game's own WoW: Forever logo, read from its
// interface files (never Blizzard's marketing art), over a loading screen. `children` is the launch
// line: the countdown, once that component is on this branch. The game's name and the disclaimer are
// real text on the banner itself; the logo and the picture are decorative. Rendered only when the
// upload has the logo (lib/game-assets.ts, launchArt).
export default function LaunchBanner({ art, children }: { art: LaunchArt; children?: ReactNode }) {
  return (
    <div className="space-y-2">
      <section aria-label="WoW: Forever launch" data-launch-banner className="relative overflow-hidden rounded-xl border border-line bg-panel">
        {art.background && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={art.background.url}
            srcSet={art.background.small ? `${art.background.small.url} ${art.background.small.width}w, ${art.background.url} ${art.background.width}w` : undefined}
            sizes="(min-width: 1024px) 1024px, 100vw"
            alt=""
            aria-hidden="true"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div className="relative flex flex-col items-center gap-4 p-5 text-center sm:flex-row sm:p-8 sm:text-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={art.logo.url}
            alt=""
            aria-hidden="true"
            width={art.logo.width}
            height={art.logo.height}
            decoding="async"
            className="h-28 w-28 shrink-0 object-contain sm:h-36 sm:w-36"
          />
          <div className="space-y-1 rounded-lg bg-canvas/80 px-4 py-3">
            <p className="text-xl font-semibold text-fg">World of Warcraft: Forever</p>
            {children}
            <p className="text-sm text-fg-2">Not affiliated with or endorsed by Blizzard Entertainment.</p>
          </div>
        </div>
      </section>
      <GameCredit version={art.version} label={art.label} what={art.background ? "Logo and loading screen art" : "Logo"} />
    </div>
  );
}
