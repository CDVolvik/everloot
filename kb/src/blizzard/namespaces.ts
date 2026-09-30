export type Game = "retail" | "classic" | "classic1x" | "forever";
export type NsKind = "static" | "dynamic" | "profile";
export type Region = "us" | "eu" | "kr" | "tw";

export class NotAvailableYetError extends Error {}

/**
 * Battle.net namespace for a game version. Checked 2026-09-30 with a working client:
 * retail profile and classic1x static returned 200, including a guild profile's member count.
 * Guessed Forever names (static-forever-us, dynamic-forever-us, profile-forever-us) returned 403.
 * When Blizzard publishes a namespace, replace the throw with its name.
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
    default: {
      const check: never = game;
      throw new Error(`unknown game version: ${check}`);
    }
  }
}
