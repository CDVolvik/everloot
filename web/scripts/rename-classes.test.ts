import { expect, test } from "vitest";
import { mapClass, rewrite } from "./rename-classes.mjs";

// One row per line of the mapping table in the pull request.
const TABLE: [string, string | null][] = [
  ["text-parchment-100", "text-fg"],
  ["text-parchment-100/90", "text-fg"],
  ["text-parchment-100/85", "text-fg"],
  ["text-parchment-100/80", "text-fg-2"],
  ["text-parchment-100/75", "text-fg-2"],
  ["text-parchment-100/70", "text-fg-2"],
  ["text-parchment-100/60", "text-muted"],
  ["text-parchment-100/55", "text-muted"],
  ["text-parchment-100/50", "text-muted"],
  ["text-parchment-100/40", "text-muted"],
  ["text-parchment-100/30", "text-muted"],
  ["placeholder:text-parchment-100/30", "placeholder:text-muted"],
  ["placeholder:text-parchment-100/40", "placeholder:text-muted"],
  ["text-gold-300", "text-accent"],
  ["text-gold-400", "text-accent"],
  ["hover:text-gold-400", "hover:text-accent"],
  ["group-hover:text-gold-400", "group-hover:text-accent"],
  ["text-gold-500/80", "text-muted"],
  ["text-gold-500/70", "text-muted"],
  ["text-gold-500/60", "text-muted"],
  ["text-uncommon", "text-q-uncommon"],
  ["text-red-400", "text-danger"],
  ["hover:text-red-400", "hover:text-danger"],
  ["bg-parchment-950", "bg-canvas"],
  ["bg-parchment-950/60", "bg-canvas/60"],
  ["focus:bg-parchment-950", "focus:bg-canvas"],
  ["bg-parchment-900", "bg-panel"],
  ["bg-parchment-900/40", "bg-panel/40"],
  ["hover:bg-parchment-900", "hover:bg-panel"],
  ["bg-gold-400/10", "bg-accent/10"],
  ["hover:bg-gold-400/10", "hover:bg-accent/10"],
  ["bg-gold-400/5", "bg-accent/5"],
  ["bg-uncommon/5", "bg-q-uncommon/5"],
  ["border-parchment-100/10", "border-line"],
  ["border-parchment-100/25", "border-line"],
  ["border-arcane/30", "border-line"],
  ["divide-parchment-100/5", "divide-line"],
  ["hover:border-parchment-100/40", "hover:border-muted"],
  ["border-gold-400/50", "border-line"],
  ["border-gold-500/30", "border-line"],
  ["border-gold-400", "border-accent"],
  ["hover:border-gold-400/60", "hover:border-accent"],
  ["focus:border-gold-400", "focus:border-accent"],
  ["hover:border-red-400/50", "hover:border-danger"],
  ["border-uncommon/40", "border-q-uncommon/40"],
  ["accent-gold-500", "accent-accent"],
  ["font-display", ""],
  ["tracking-wide", ""],
  ["tracking-wider", ""],
  ["tracking-widest", ""],
  ["tracking-[0.2em]", ""],
  ["tracking-[0.25em]", ""],
  ["uppercase", "font-mono"],
  ["tracking-tight", null],
  ["text-q-uncommon", null],
  ["bg-gold-500", null],
  ["hover:bg-gold-400", null],
  ["text-parchment-950", null],
];

test.each(TABLE)("%s -> %s", (old, next) => expect(mapClass(old)).toBe(next));

test("rewrites class strings", () => {
  expect(rewrite(`<p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">`).source)
    .toBe(`<p className="font-mono text-xs text-muted">`);
  expect(rewrite(`className="font-mono uppercase"`).source).toBe(`className="font-mono"`);
  expect(rewrite(`"bg-gold-500 text-parchment-950"`).manual).toEqual(["bg-gold-500", "text-parchment-950"]);
  expect(rewrite(`href="/tools/gold-ledger"`).source).toBe(`href="/tools/gold-ledger"`);
});

test("keeps the spaces next to template expressions", () => {
  expect(rewrite("const c = `font-display ${a ? \"text-gold-400\" : \"\"} uppercase`;").source)
    .toBe("const c = `${a ? \"text-accent\" : \"\"} font-mono`;");
});

test("ignores apostrophes and backticks in JSX text", () => {
  const source = "<p>Don't use `uppercase` here, it's fine</p>";
  expect(rewrite(source).source).toBe(source);
});
