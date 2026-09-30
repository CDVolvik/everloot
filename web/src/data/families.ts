/**
 * Public guild-family record. Every row is a sentence someone else already
 * published, plus the page and the date. This is not a Blizzard API dump
 * and not a copy of anyone's member list.
 */

export type FigureBound = "exact" | "at-least" | "about" | "goal";

export type FamilyFact = {
  id: string;
  kind: "guild-site" | "claim" | "sighting";
  /** Set when the source named one guild. */
  guild?: string;
  statement: string;
  members?: { value: number; bound: FigureBound };
  online?: number;
  sourceName: string;
  url: string;
  /** When the source said it, or the day we read the page. */
  asOf: string;
};

export type BlizzardGuildApi = {
  checked: string;
  /** Retail profile guild lookup from a working client. */
  retailProfile: "answers" | "refused";
  classicEraStatic: "answers" | "refused";
  /** Guessed Forever namespace names. Refusal is not a published namespace. */
  foreverGuessed: "answers" | "refused";
  forumUrl: string;
};

export type GuildFamily = {
  slug: string;
  name: string;
  summary: string;
  facts: readonly FamilyFact[];
  blizzard: BlizzardGuildApi;
};

const OLYMPUS: GuildFamily = {
  slug: "olympus",
  name: "Olympus",
  summary:
    "The public record of Asmongold's Olympus guilds on WoW: Forever. Every figure cites the page that published it.",
  blizzard: {
    checked: "2026-09-30",
    retailProfile: "answers",
    classicEraStatic: "answers",
    foreverGuessed: "refused",
    forumUrl: "https://us.forums.blizzard.com/en/blizzard/t/world-of-warcraft-forever-api-namespace/59774",
  },
  facts: [
    {
      id: "olympus-viii-hall",
      kind: "guild-site",
      guild: "Olympus VIII",
      statement:
        "Their own hall listed 44 members and 7 online. Each person on that page is labeled with a source such as Discord, Twitch, or voice. The hall copy is a guild joke. The count is theirs.",
      members: { value: 44, bound: "exact" },
      online: 7,
      sourceName: "olympus-viii.org",
      url: "https://olympus-viii.org/",
      asOf: "2026-09-30",
    },
    {
      id: "olympus-viii-second-site",
      kind: "guild-site",
      guild: "Olympus VIII",
      statement: "A second fan page for the same numeral. It was under construction and published no count.",
      sourceName: "olympus-viii.com",
      url: "https://olympus-viii.com/",
      asOf: "2026-09-30",
    },
    {
      id: "forum-ten-thousand",
      kind: "claim",
      statement: "A recruitment post said more than 10,000 players were spread through the current Olympus guilds.",
      members: { value: 10_000, bound: "at-least" },
      sourceName: "Blizzard forums",
      url: "https://us.forums.blizzard.com/en/wow/t/olympus-is-recruiting/2355270",
      asOf: "2026-09-19",
    },
    {
      id: "clip-ten-thousand",
      kind: "claim",
      statement: "A clip of Asmongold telling the guild they had passed 10,000 members.",
      members: { value: 10_000, bound: "at-least" },
      sourceName: "X / Prism",
      url: "https://x.com/fwprism/status/2101809316382847172",
      asOf: "2026-09-20",
    },
    {
      id: "outpost-thirty-thousand",
      kind: "claim",
      statement:
        "Reports his claim of over 30,000 members and more than 30 full guilds, and says Blizzard confirmed neither number.",
      members: { value: 30_000, bound: "at-least" },
      sourceName: "WoW Forever Outpost",
      url: "https://wofwforever.com/en/guides/wow-forever-olympus-guild/",
      asOf: "2026-09-24",
    },
    {
      id: "readme-ten-thousand",
      kind: "claim",
      statement:
        "The addon description says the beta passed 10,000 members, and that a guild caps near 1,000, so Olympus is many guilds.",
      members: { value: 10_000, bound: "at-least" },
      sourceName: "Olympus Guild addon",
      url: "https://github.com/dnl-gentile/olympus-addon",
      asOf: "2026-09-30",
    },
    {
      id: "event-fifty-thousand-mark",
      kind: "claim",
      statement:
        "In a recorded event he named 50,000 members as the mark to hit before release, and talked through newer guilds including Olympus 22 and Olympus 26. The captions are automatic. This is not a roster.",
      members: { value: 50_000, bound: "goal" },
      sourceName: "YouTube / Watchback",
      url: "https://www.youtube.com/watch?v=fihRIfTwd5k",
      asOf: "2026-09-28",
    },
    {
      id: "mute-screenshot-xli",
      kind: "sighting",
      guild: "Olympus XLI",
      statement:
        "Dexerto described an OlympusMute screenshot whose guild tag reached Olympus XLI, the Roman numeral 41. One name in a screenshot, not a count of guilds.",
      sourceName: "Dexerto",
      url: "https://www.dexerto.com/gaming/wow-forever-player-creates-mod-that-hides-asmongolds-entire-guild-3412321/",
      asOf: "2026-09-24",
    },
  ],
};

export const FAMILIES: readonly GuildFamily[] = [OLYMPUS];

export function getFamily(slug: string): GuildFamily | undefined {
  return FAMILIES.find((family) => family.slug === slug);
}

export function figureLabel(fact: FamilyFact): string {
  const parts: string[] = [];
  if (fact.members) {
    const n = fact.members.value.toLocaleString("en-US");
    if (fact.members.bound === "at-least") parts.push(`${n}+`);
    else if (fact.members.bound === "about") parts.push(`about ${n}`);
    else if (fact.members.bound === "goal") parts.push(`${n} as the mark`);
    else parts.push(n);
  }
  if (fact.online !== undefined) parts.push(`${fact.online.toLocaleString("en-US")} online`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}
