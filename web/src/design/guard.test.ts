// Keeps the old look from coming back: each rule scans every non-test .ts, .tsx and .css file
// under web/src, line by line. The primary pill's gradient ring is the one allowed gradient, so
// its block in globals.css is blanked before scanning.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import config from "../../tailwind.config";

type Rule = { name: string; pattern: RegExp; bites: string[]; spares: string[] };

const RULES: Rule[] = [
  {
    name: "old palette",
    pattern: /\b(?:text|bg|border|divide|ring|from|via|to|accent|outline|fill|stroke|placeholder|decoration|caret)-(?:gold|parchment|arcane)\b/,
    bites: ["hover:text-gold-400"],
    spares: ['href="/tools/gold-ledger"'],
  },
  {
    name: "default palette",
    pattern: /\b(?:text|bg|border|ring|divide|from|via|to)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b|\b(?:text|bg|border)-(?:white|black)\b/,
    bites: ["text-red-400"],
    spares: ["text-danger"],
  },
  {
    name: "fantasy type",
    pattern: /\bfont-display\b|Cinzel/,
    bites: ["font-display"],
    spares: ["font-mono"],
  },
  {
    name: "pictographs",
    pattern: /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{25A0}-\u{25FF}\u{FE0F}]/u,
    bites: ["✦", "◆", "✓", "🪙"],
    spares: ["—", "·", "→", "×"],
  },
  {
    name: "glow and shadow",
    pattern: /(?:^|[\s"'`])(?:[a-z-]+:)*shadow(?:-(?:sm|md|lg|xl|2xl|inner))?(?=[\s"'`]|$)|box-shadow|text-shadow|drop-shadow|gradient\(/,
    bites: ["shadow-xl", "radial-gradient("],
    spares: ["Shadowfang"],
  },
  {
    name: "capital labels",
    pattern: /(?:^|[\s"'`])(?:[a-z-]+:)*(?:uppercase|tracking-(?:wide|wider|widest|\[0?\.\d+em\]))(?=[\s"'`]|$)|textTransform:\s*["']uppercase|letterSpacing:\s*[1-9]/,
    bites: ["uppercase tracking-[0.2em]", "letterSpacing: 6"],
    spares: ["tracking-tight", "letterSpacing: -4", "toUpperCase()"],
  },
  {
    name: "old effects",
    pattern: /\b(?:ticker-track|aurora|cta-glow|marquee)\b/,
    bites: ["ticker-track"],
    spares: ["price ticker"],
  },
  {
    name: "text opacity",
    pattern: /(?:^|[\s"'`])(?:[a-z-]+:)*text-(?:fg|fg-2|muted|accent|danger|warning|q-[a-z]+|class-[a-z]+|chat-[a-z]+)\/\d+/,
    bites: ["text-muted/60"],
    spares: ["text-muted", "bg-canvas/60"],
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

// Blank the allowed gradient block but keep its line breaks, so line numbers stay true.
function scannable(path: string): string {
  const text = readFileSync(path, "utf8");
  if (!path.endsWith("globals.css")) return text;
  return text.replace(/\.btn-primary::before\s*\{[^}]*\}/, (block) => block.replace(/[^\n]/g, ""));
}

const files = [...sourceFiles(src)].map((path) => ({ name: relative(src, path).replaceAll("\\", "/"), lines: scannable(path).split(/\r?\n/) }));

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

test("only Geist families", () => {
  expect(Object.keys(config.theme!.extend!.fontFamily!)).toEqual(["sans", "mono"]);
});
