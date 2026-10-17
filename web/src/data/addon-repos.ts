// Where an addon's author publishes it, by the addon's folder name as the AddOns list shows it.
// Checked by hand: add an addon only after reading its repository and confirming it is the same
// addon players run on Forever. The links are the author's own pages; Everloot reads GitHub's public
// API for `repo` and nothing from the other hosts, which are plain links.
// Reading `## X-Website` from the .toc through the addon-list opt-in would replace this map, but it
// needs an addon release first.

export interface AddonSource {
  /** GitHub "owner/name". */
  repo: string;
  curseforge?: string;
  wago?: string;
  wowinterface?: string;
}

export const ADDON_SOURCES: Readonly<Record<string, AddonSource>> = {
  Polestar: { repo: "fitzforge/polestar", curseforge: "https://www.curseforge.com/wow/addons/polestar-guides" },
};

export const addonSource = (name: string): AddonSource | null =>
  Object.hasOwn(ADDON_SOURCES, name) ? ADDON_SOURCES[name] : null;
