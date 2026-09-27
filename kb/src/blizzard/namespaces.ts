export type Game = "retail" | "classic" | "classic1x" | "forever";
export type NsKind = "static" | "dynamic" | "profile";
export type Region = "us" | "eu" | "kr" | "tw";

export class NotAvailableYetError extends Error {}

/**
 * Battle.net namespace for a game version. Forever has no namespace as of 2026-09-27; when Blizzard
 * publishes one, replace the throw with its name.
 */
export function namespace(game: Game, kind: NsKind, region: Region): string {
  switch (game) {
    case "retail":
      return `${kind}-${region}`;
    case "classic":
      return `${kind}-classic-${region}`;
    case "classic1x":
      return `${kind}-classic1x-${region}`;
    case "forever":
      throw new NotAvailableYetError("Blizzard has not published a WoW: Forever API namespace yet");
  }
}
