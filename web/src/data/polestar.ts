// Facts about Polestar (fitzforge/polestar) and the independent guide-pack registry.
// Every fact here was read from Polestar's repository; re-check them when POLESTAR.checked moves.
// Link to Polestar's code and guides, never copy them: its guide text is GPL-3 and not covered by
// the pack licence exception.

const REPO = "https://github.com/fitzforge/polestar";

export const POLESTAR = {
  checked: "2026-10-16",
  commit: "06c1c41", // v0.2.4
  repo: REPO,
  releases: `${REPO}/releases`,
  issues: `${REPO}/issues`,
  bugReports: `${REPO}/issues?q=is%3Aissue+is%3Aopen+label%3Abug`,
  curseforge: "https://www.curseforge.com/wow/addons/polestar-guides",
  discord: "https://discord.gg/vMbee6F2e9",
  license: `${REPO}/blob/next/LICENSE`,
  licenseException: `${REPO}/blob/next/LICENSE-EXCEPTION.md`,
  guidePacks: `${REPO}/blob/next/docs/GUIDE_PACKS.md`,
  handbook: `${REPO}/blob/next/docs/PACKS.md`,
  packFormat: `${REPO}/blob/next/docs/PACK_FORMAT.md`,
  maintainerPrs: `${REPO}/pulls?q=is%3Apr+author%3ACDVolvik`,
  commands: [
    ["/polestar", "Show or hide the guide window (/pole works too)."],
    ["/polestar guides", "Open the hub: every guide, Lookup, Dungeons and Rares."],
    ["/polestar options", "Every setting. Quest markers on the map stay off until you turn them on under Map."],
    ["/polestar packs", "The guide packs you have installed, each one on or off without a reload."],
    ["/polestar skip", "Move past a step for good. /polestar next and prev only look ahead or back."],
    ["/polestar report", "Open the bug report, with the step, your position and the versions filled in."],
  ] as const,
};

export interface PackListing {
  // pack.json fields (Polestar docs/PACK_FORMAT.md)
  id: string;
  title: string;
  author: string;
  version: string;
  license: string;
  website?: string;
  source?: string;
  folder?: string;
  // Registry fields
  coverage: string[];
  needs?: string;
  downloads: { label: string; url: string }[];
  listed: string;
  checked: string;
}

export const POLESTAR_PACKS: PackListing[] = [
  {
    id: "guides",
    title: "Polestar Guides",
    author: "Polestar",
    version: "0.2.4",
    license: "GPL-3.0-only",
    folder: "Polestar_Guides",
    coverage: [
      "Leveling 1–60 for both factions: 57 guides (29 Alliance, 28 Horde), from every starting zone including Skyborne.",
      "62 class-quest guides across nine classes.",
      "64 mount and pet guides.",
      "12 profession guides and 17 reputation guides.",
      "7 exploration guides and the legacy challenges.",
    ],
    downloads: [
      { label: "CurseForge", url: "https://www.curseforge.com/wow/addons/polestar-guides" },
      { label: "GitHub releases", url: `${REPO}/releases` },
    ],
    listed: "2026-10-16",
    checked: "2026-10-16",
  },
];

export interface PackIdea {
  title: string;
  why: string;
  source: { label: string; url: string };
  start: { label: string; href: string }[];
}

export const PACK_IDEAS: PackIdea[] = [
  {
    title: "Group and dungeon leveling routes",
    why:
      "Polestar's leveling routes are solo by design: its simulator leaves out dungeon, raid, PvP and elite quests. " +
      "A pack can route duos, groups, elite quests and dungeon runs along the way.",
    source: { label: "Polestar README, How the routes are made", url: `${REPO}#how-the-routes-are-made` },
    start: [],
  },
  {
    title: "Gold and farming routes",
    why:
      "Polestar Guides covers leveling, class quests, collectibles, professions, reputation and exploration, " +
      "but has no gold or farming guides. A pack can walk a farm loop and say what it earns.",
    source: { label: "Polestar Guides, guide list", url: `${REPO}/tree/next/guides/forever` },
    start: [
      { label: "Farming routes", href: "/tools/farming-routes" },
      { label: "Gold per hour", href: "/tools/gold-per-hour" },
    ],
  },
];

export interface PolestarHelp {
  title: string;
  why: string;
  url: string;
}

export const POLESTAR_HELP: PolestarHelp[] = [
  {
    title: "Map caves, climbs and chokepoints",
    why: "So the arrow never walks a player into a mountain. Labelled help wanted.",
    url: `${REPO}/issues/10`,
  },
  {
    title: "Confirm player bug reports in game",
    why: "Players report steps that point to the wrong NPC, trainer or place; a second player confirming one helps it get fixed.",
    url: POLESTAR.bugReports,
  },
  {
    title: "Record your sessions",
    why: "The optional Polestar Recorder, from the same release, records sessions to improve the routes. It does nothing until you turn it on.",
    url: `${REPO}/releases`,
  },
];
