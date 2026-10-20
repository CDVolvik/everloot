// The site's colours, spacing, corners and widths. The only place hex values live (besides icon.svg).
// Tailwind reads the colours as CSS variables. The site is dark-only: every visitor gets the dark
// values. The light values are kept, and kept passing, so a light theme can return later by
// emitting them under a selector of its own. Every text token passes 4.5:1 on canvas and panel
// (tokens.test.ts).

export type Mode = "dark" | "light";

/** The mode every visitor sees. */
export const SITE_MODE: Mode = "dark";

/** One spacing scale, in px. Tailwind steps 1 2 3 4 6 8 12 18 (18 is added in tailwind.config.ts). */
export const SPACE = [4, 8, 12, 16, 24, 32, 48, 72] as const;

/** Corners: `rounded-card` for every card, table frame and panel; `rounded-control` for inputs,
 *  icons and the tooltip frame; `rounded-full` for buttons, badges and pills. */
export const RADIUS = { control: 6, card: 12 } as const;

/** Two content widths: `reading` for documents, `wide` for data and tools (and the header and footer). */
export const WIDTH = { reading: 768, wide: 1152 } as const;

export const QUALITIES = ["poor", "common", "uncommon", "rare", "epic", "legendary"] as const;
export const CLASSES = ["warrior", "paladin", "hunter", "rogue", "priest", "shaman", "mage", "warlock", "druid"] as const;

export type TokenName =
  | "canvas" | "panel" | "line" | "edge" | "fg" | "fg-2" | "muted" | "accent" | "danger" | "warning"
  | "tooltip" | "tooltip-border" | "tooltip-inner" | "accent-hover"
  | `q-${(typeof QUALITIES)[number]}` | `class-${(typeof CLASSES)[number]}` | "chat-whisper" | "chat-guild";

// Tooltip frames stay dark in both modes, as in the game.
const tooltip = { tooltip: "#080C18", "tooltip-border": "#5B6B8C", "tooltip-inner": "#26324F" } as const;

export const tokens: Record<Mode, Record<TokenName, string>> = {
  dark: {
    canvas: "#0E0F0D",
    panel: "#15171A",
    line: "#3A3B35",
    // Control edges (inputs, filter chips): at least 3:1 on canvas and panel, unlike the decorative line.
    edge: "#6E6B60",
    fg: "#F4EFDD",
    "fg-2": "#C9C3B0",
    muted: "#8B8778",
    accent: "#9CF03A",
    danger: "#FF6B6B",
    warning: "#F5B83D",
    ...tooltip,
    // The primary button's fill on hover; its text is the canvas colour.
    "accent-hover": "#B3F566",
    "q-poor": "#9D9D9D",
    "q-common": "#F2F4F8",
    "q-uncommon": "#1EFF00",
    "q-rare": "#4C9BFF",
    "q-epic": "#BE73F7",
    "q-legendary": "#FF8A1A",
    "class-warrior": "#C69B6D",
    "class-paladin": "#F48CBA",
    "class-hunter": "#AAD372",
    "class-rogue": "#FFF468",
    "class-priest": "#FFFFFF",
    "class-shaman": "#2E8BFF",
    "class-mage": "#3FC7EB",
    "class-warlock": "#8788EE",
    "class-druid": "#FF7C0A",
    "chat-whisper": "#FF80FF",
    "chat-guild": "#40FF40",
  },
  light: {
    canvas: "#FBF8EC",
    panel: "#FFFFFF",
    line: "#D9D3BF",
    edge: "#8A8473",
    fg: "#12130F",
    "fg-2": "#3E3B32",
    muted: "#5F5B4E",
    accent: "#2F7A0A",
    danger: "#C62828",
    warning: "#8A5A00",
    ...tooltip,
    "accent-hover": "#256207",
    "q-poor": "#6B6B6B",
    "q-common": "#12130F",
    "q-uncommon": "#1A7A12",
    "q-rare": "#0057AD",
    "q-epic": "#7A23C0",
    "q-legendary": "#A84B00",
    "class-warrior": "#85592C",
    "class-paladin": "#A8326E",
    "class-hunter": "#4A7320",
    "class-rogue": "#746500",
    "class-priest": "#12130F",
    "class-shaman": "#0057AD",
    "class-mage": "#0B6E87",
    "class-warlock": "#4A4BC0",
    "class-druid": "#A84B00",
    "chat-whisper": "#A3218F",
    "chat-guild": "#1A7A12",
  },
};

export const TEXT_TOKENS: TokenName[] = [
  "fg", "fg-2", "muted", "accent", "danger", "warning",
  ...QUALITIES.map((q) => `q-${q}` as const),
  ...CLASSES.map((c) => `class-${c}` as const),
  "chat-whisper", "chat-guild",
];

/** "#0E0F0D" -> "14 15 13", the form `rgb(var(--x) / <alpha-value>)` needs. */
export function channels(hex: string): string {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");
}

export function cssVariables(mode: Mode): Record<string, string> {
  return Object.fromEntries(Object.entries(tokens[mode]).map(([name, hex]) => [`--${name}`, channels(hex)]));
}
