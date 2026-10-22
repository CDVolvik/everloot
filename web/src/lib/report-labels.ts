// How a player-reported count is written wherever it is shown: the count, how many installs it rests on and when
// one last reported it. Kept apart from the loaders so the map's client code prints the same words as the pages.
import { PLACEHOLDER } from "./item-names";

/** A day from an ISO time, `2026-10-20`, or `[?]` when no report carried one. */
export const dayLabel = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10) : PLACEHOLDER);

/** "Confirmed by 3 installs, last seen 2026-10-20". */
export const confirmedLine = (installs: number, lastSeen: string | null | undefined): string => `Confirmed by ${installs} installs, last seen ${dayLabel(lastSeen)}`;
