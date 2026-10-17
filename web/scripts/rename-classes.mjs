/**
 * One-off: rename the gold and parchment classes to the colour tokens in src/design/tokens.ts.
 * Only string and template literals are touched (found with the TypeScript parser), so JSX text,
 * comments and paths like /tools/gold-ledger stay as they are. Filled buttons (bg-gold-*,
 * text-parchment-950) are left for a hand conversion and reported.
 * Run: node scripts/rename-classes.mjs (rewrites every non-test .ts/.tsx under src/ in place).
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const OLD = /-(?:gold|parchment|arcane)\b/;

function opacity(suffix) {
  return suffix ? Number(suffix.slice(1)) : 100;
}

/** The new class for one utility (no variant prefix), "" to delete it, or null to leave it. */
function mapUtility(utility, variant) {
  let m;
  if ((m = /^text-parchment-100(\/\d+)?$/.exec(utility))) {
    const o = opacity(m[1]);
    return o >= 85 ? "text-fg" : o >= 70 ? "text-fg-2" : "text-muted";
  }
  if (/^text-gold-(?:300|400)$/.test(utility)) return "text-accent";
  if (/^text-gold-500\/\d+$/.test(utility)) return "text-muted";
  if (utility === "text-uncommon") return "text-q-uncommon";
  if (utility === "text-red-400") return "text-danger";
  if ((m = /^bg-parchment-(950|900)(\/\d+)?$/.exec(utility))) return `bg-${m[1] === "950" ? "canvas" : "panel"}${m[2] ?? ""}`;
  if ((m = /^bg-gold-400(\/\d+)$/.exec(utility))) return `bg-accent${m[1]}`;
  if ((m = /^bg-uncommon(\/\d+)$/.exec(utility))) return `bg-q-uncommon${m[1]}`;
  if (/^border-parchment-100\/\d+$/.test(utility)) return variant && utility === "border-parchment-100/40" ? "border-muted" : "border-line";
  if (/^border-arcane(?:\/\d+)?$/.test(utility)) return "border-line";
  if (/^divide-parchment-100\/\d+$/.test(utility)) return "divide-line";
  if ((m = /^border-gold-(?:400|500)(\/\d+)?$/.exec(utility))) {
    if (variant) return "border-accent";
    return m[1] ? "border-line" : "border-accent";
  }
  if (/^border-red-400(?:\/\d+)?$/.test(utility)) return "border-danger";
  if ((m = /^border-uncommon(\/\d+)?$/.exec(utility))) return `border-q-uncommon${m[1] ?? ""}`;
  if (utility === "accent-gold-500") return "accent-accent";
  if (/^(?:font-display|tracking-(?:wide|wider|widest|\[0?\.\d+em\]))$/.test(utility)) return "";
  if (utility === "uppercase") return "font-mono";
  return null;
}

/** null = not an old class (or a filled-button token left for hand conversion); "" = delete it. */
export function mapClass(token) {
  const cut = token.lastIndexOf(":");
  const variant = cut < 0 ? "" : token.slice(0, cut + 1);
  const next = mapUtility(token.slice(cut + 1), variant);
  if (next === null) return null;
  return next === "" ? "" : variant + next;
}

/** Rewrites one literal's text. `trimStart`/`trimEnd` are false next to a `${` expression. */
function rewriteText(text, trimStart, trimEnd, manual) {
  const parts = text.split(/(\s+)/);
  let changed = false;
  let mono = /(?:^|\s)font-mono(?:\s|$)/.test(text);
  const out = parts.map((part) => {
    if (!part || /^\s+$/.test(part)) return part;
    const next = mapClass(part);
    if (next === null) {
      if (OLD.test(part)) manual.push(part);
      return part;
    }
    changed = true;
    if (next === "font-mono") {
      if (mono) return "";
      mono = true;
    }
    return next;
  });
  if (!changed) return text;
  let result = out.join("").replace(/\s+/g, " ");
  if (trimStart) result = result.trimStart();
  if (trimEnd) result = result.trimEnd();
  return result;
}

export function rewrite(source) {
  const file = ts.createSourceFile("x.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  const manual = [];
  const visit = (node) => {
    let open = 0;
    let close = 0;
    let trimStart = true;
    let trimEnd = true;
    switch (node.kind) {
      case ts.SyntaxKind.StringLiteral:
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
        open = 1; close = 1; break;
      case ts.SyntaxKind.TemplateHead:
        open = 1; close = 2; trimEnd = false; break;
      case ts.SyntaxKind.TemplateMiddle:
        open = 1; close = 2; trimStart = false; trimEnd = false; break;
      case ts.SyntaxKind.TemplateTail:
        open = 1; close = 1; trimStart = false; break;
    }
    if (open) {
      const start = node.getStart(file) + open;
      const end = node.getEnd() - close;
      const text = source.slice(start, end);
      const next = rewriteText(text, trimStart, trimEnd, manual);
      if (next !== text) edits.push({ start, end, next });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  let out = source;
  for (const { start, end, next } of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, start) + next + out.slice(end);
  return { source: out, manual };
}

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) yield path;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  let changed = 0;
  for (const path of sourceFiles(join(root, "src"))) {
    const source = readFileSync(path, "utf8");
    const result = rewrite(source);
    if (result.source !== source) {
      writeFileSync(path, result.source);
      changed++;
    }
    for (const token of result.manual) console.log(`${relative(root, path).replaceAll("\\", "/")}: ${token}`);
  }
  console.log(`${changed} files rewritten`);
}
