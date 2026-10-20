// Keeps the old look from coming back: each rule scans every non-test .ts, .tsx and .css file
// under web/src, line by line. No exceptions: the primary button is a flat fill, not a gradient.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import config from "../../tailwind.config";

type Rule = { name: string; pattern: RegExp; bites: string[]; spares: string[] };

// A class token starts the line or follows whitespace or a quote, may carry variants
// (`hover:`, `sm:`, `!`), and ends at whitespace, a quote or the end of the line.
const START = String.raw`(?:^|[\s"'\x60])(?:[a-z0-9-]+:)*!?`;
const END = String.raw`(?=[\s"'\x60]|$)`;
const REST = String.raw`[^\s"'\x60]+`;
const token = (body: string) => new RegExp(`${START}(?:${body})${END}`);
const tokenOr = (body: string, extra: string) => new RegExp(`${START}(?:${body})${END}|${extra}`);

// Arrows, keyboard keys, © ® ™ and plain shapes (sort arrows, bullets) stay allowed.
const ALLOWED_SYMBOLS = "\\u00A9\\u00AE\\u2122\\u2190-\\u21FF\\u2318\\u2325\\u2303\\u25A0\\u25A1\\u25B2\\u25B3\\u25BC\\u25BD\\u25CB\\u25CF";

const RULES: Rule[] = [
  {
    name: "old palette",
    pattern: /\b(?:text|bg|border|divide|ring|from|via|to|accent|outline|fill|stroke|placeholder|decoration|caret|shadow)-(?:gold|parchment|arcane)\b/,
    bites: ["hover:text-gold-400", "shadow-gold-500/50"],
    spares: ['href="/tools/gold-ledger"'],
  },
  {
    name: "default palette",
    pattern: /\b(?:text|bg|border|ring|divide|from|via|to|shadow)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b|\b(?:text|bg|border)-(?:white|black)\b/,
    bites: ["text-red-400", "shadow-amber-500/40"],
    spares: ["text-danger"],
  },
  {
    name: "fantasy type",
    pattern: /\bfont-display\b|Cinzel/,
    bites: ["font-display"],
    spares: ["font-mono"],
  },
  {
    // Emoji and pictographs (Extended_Pictographic covers emoji, including the ⌛ ⏳ ⌚ range),
    // the dingbat and symbol blocks (sparkles, check marks, stars) and the old ◆ separator.
    name: "pictographs",
    pattern: new RegExp(
      `(?![${ALLOWED_SYMBOLS}])[\\p{Extended_Pictographic}\\p{Emoji_Presentation}\\u{2300}-\\u{23FF}\\u{2600}-\\u{27BF}\\u{2B00}-\\u{2BFF}\\u{25C6}-\\u{25C8}\\u{FE0F}]`,
      "u",
    ),
    bites: ["✦", "◆", "✓", "🪙", "⌛", "⏳", "⚡", "★", "▶", "⭐", "❤️"],
    spares: ["—", "·", "→", "↗", "×", "▲", "▼", "●", "©", "⌘K"],
  },
  {
    name: "glow, shadow and blur",
    pattern: tokenOr(
      String.raw`shadow(?!-none(?:[\s"'\x60]|$))(?:-${REST})?|(?:backdrop-)?blur(?:-${REST})?|drop-shadow(?:-${REST})?`,
      String.raw`box-shadow|text-shadow|drop-shadow|blur\(`,
    ),
    bites: ["shadow-xl", "shadow", "hover:shadow-lg", 'className="shadow-[0_0_20px_#fff]"', "shadow-accent/40", "blur-md", "backdrop-blur", "drop-shadow-lg", "filter: blur(4px)", "box-shadow: 0 0 4px"],
    spares: ["Shadowfang", "Shadow Priest", "shadow-none", "blurb"],
  },
  {
    name: "gradients",
    pattern: tokenOr(String.raw`bg-(?:gradient|linear|radial|conic)-${REST}|from-${REST}|via-${REST}`, String.raw`gradient\(`),
    bites: ["bg-gradient-to-r from-accent to-q-uncommon", "bg-linear-to-r", "hover:from-accent", "via-q-epic", "radial-gradient(", "linear-gradient(90deg"],
    spares: ["data from the wiki", "bg-panel", "to-do"],
  },
  {
    // Letter-spaced capitals. Negative tracking (tracking-tight, tracking-[-0.035em]) is allowed.
    name: "capital labels",
    pattern: tokenOr(
      String.raw`uppercase|tracking-(?:wide|wider|widest|\[(?!-)[^\]]*\])`,
      String.raw`textTransform:\s*["']uppercase|text-transform:\s*uppercase|letterSpacing:\s*["']?(?:[1-9]|0?\.\d*[1-9])|letter-spacing:\s*(?:[1-9]|0?\.\d*[1-9])`,
    ),
    bites: ["uppercase tracking-[0.2em]", "tracking-[2px]", "sm:tracking-widest", "letterSpacing: 6", 'letterSpacing: "0.1em"', "letterSpacing: 0.5", "letter-spacing: 0.05em", 'textTransform: "uppercase"'],
    spares: ["tracking-tight", "tracking-tighter", "tracking-[-0.035em]", "letterSpacing: -4", "letterSpacing: 0", "toUpperCase()"],
  },
  {
    name: "old effects",
    pattern: /\b(?:ticker-track|aurora|cta-glow|marquee)\b/,
    bites: ["ticker-track"],
    spares: ["price ticker"],
  },
  {
    // Motion is 150 ms fades and the chat cursor only.
    name: "attention animations",
    pattern: token(String.raw`animate-(?:pulse|ping|bounce)`),
    bites: ["animate-pulse", "motion-safe:animate-ping", "animate-bounce"],
    spares: ["animate-none"],
  },
  {
    name: "text opacity",
    pattern: token(String.raw`text-(?:fg|fg-2|muted|accent|danger|warning|q-[a-z]+|class-[a-z]+|chat-[a-z]+)\/(?:\d+|\[[^\]]*\])`),
    bites: ["text-muted/60", "text-fg/[.85]", "hover:text-accent/[0.5]"],
    spares: ["text-muted", "bg-canvas/60"],
  },
  {
    // Opacity that dims content; disabled states and fully shown or hidden are fine.
    name: "dimmed with opacity",
    pattern: new RegExp(`(?:^|[\\s"'\\x60])(?!(?:[a-z0-9-]+:)*(?:aria-|group-|peer-)?disabled:)(?:[a-z0-9-]+:)*!?opacity-(?:[1-9]\\d?|\\[[^\\]]*\\])${END}`),
    bites: ["opacity-60", "hover:opacity-80", "opacity-[.7]", "md:opacity-50"],
    spares: ["disabled:opacity-50", "aria-disabled:opacity-40", "group-disabled:opacity-60", "opacity-0", "opacity-100", "bg-canvas/60"],
  },
];

const src = fileURLToPath(new URL("..", import.meta.url));

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (/\.(?:tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) yield path;
  }
}

const files = [...sourceFiles(src)].map((path) => ({ name: relative(src, path).replaceAll("\\", "/"), lines: readFileSync(path, "utf8").split(/\r?\n/) }));

function offenders(rule: Rule): string[] {
  return files.flatMap(({ name, lines }) =>
    lines.flatMap((line, i) => (rule.pattern.test(line) ? [`src/${name}:${i + 1}`] : [])));
}

describe.each(RULES)("$name", (rule) => {
  test("the rule bites what it should and spares the rest", () => {
    for (const s of rule.bites) expect(rule.pattern.test(s), s).toBe(true);
    for (const s of rule.spares) expect(rule.pattern.test(s), s).toBe(false);
  });

  test("web/src has none", () => {
    expect(offenders(rule)).toEqual([]);
  });
});

test("the scan sees the source", () => {
  expect(files.some(({ name }) => name === "app/globals.css")).toBe(true);
  expect(files.length).toBeGreaterThan(40);
});

test("no gradient at all, the primary button included (it is a flat fill)", () => {
  const css = readFileSync(join(src, "app/globals.css"), "utf8");
  const gradients = RULES.find((r) => r.name === "gradients")!.pattern;
  expect(css.split(/\r?\n/).some((line) => gradients.test(line))).toBe(false);
});

test("only Geist families", () => {
  expect(Object.keys(config.theme!.extend!.fontFamily!)).toEqual(["sans", "mono"]);
});
