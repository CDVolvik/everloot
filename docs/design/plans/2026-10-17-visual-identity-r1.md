# Visual identity R1 (foundation) Implementation Plan


**Goal:** Switch everloot.app from the gold and parchment look to the approved identity in one deploy. That means dark and light colour tokens, renamed classes, Geist, pill buttons, bracket navigation, and a new favicon and social card, plus tests that stop the old look from coming back.

**Architecture:** `web/src/design/tokens.ts` is the single source for colour, and it feeds Tailwind in two ways:
- colour names (`rgb(var(--fg) / <alpha-value>)`);
- through a small plugin, the CSS variables for dark (`:root`) and light (`@media (prefers-color-scheme: light)`).

A one-off codemod renames the ~800 old classes from a reviewed table. Buttons and effects are converted by hand. Vitest guard tests scan `web/src` for the banned patterns and check contrast.

**Tech Stack:** Next.js 15.5 App Router, React 19, Tailwind CSS 3.4, Vitest 5, `geist` 1.8.1 for the fonts, `next/og` for the social card.

**Spec:** `docs/design/specs/2026-10-17-visual-identity-design.md` (PR #17)

**When:** after addon 0.2.6 ships. It has its own plan and goes out before the CurseForge upload around 10/24.
- Branch: `feat/visual-identity-r1`, from `main` once #17 is merged.
- One PR. Carlos merges it, and merging deploys production.

## Global Constraints

- Colour values are the spec's tables, copied exactly. The only hex values allowed in `web/src` are in `tokens.ts` and `icon.svg`; the social card imports `tokens.ts`.
- Tailwind stays on 3.4 (`tailwind.config.ts`); no v4 migration in R1.
- No route, API, metadata or behaviour change (spec, Acceptance). Copy changes are limited to removing emoji and glyphs.
- Light mode follows the system setting only; no toggle.
- Fonts are self-hosted from the `geist` package (SIL OFL 1.1), pinned at `1.8.1`. No font request leaves the site and the build fetches nothing.
- Banned in `web/src`:
  - gold, parchment and arcane colours;
  - Cinzel and `font-display`;
  - glows, box shadows and text shadows;
  - gradients, except the primary pill's outline;
  - sparkle glyphs and emoji;
  - letter-spaced capitals;
  - tickers.
- Every text colour pair passes 4.5:1 in both modes, and text colour classes carry no opacity modifier.
- Motion: 150 ms colour and opacity transitions only, and none under `prefers-reduced-motion`.
- Commits are signed off (`git commit -s`). Public text (PR body, `THIRD_PARTY.md`) is in plain words and never says how it was written.

## Decisions this plan makes (the spec leaves them open)

1. **Light-mode gradient stops** for the primary pill: `#1A7A12` → `#2F7A0A` (light uncommon → light accent). The dark stops (`#1EFF00`, `#9CF03A`) are about 1.3:1 on the light canvas, so the outline would disappear. Carlos can veto this in review.
2. **Text opacity collapses into three tokens** (Task 2 table), so every contrast ratio is computed, not guessed.
3. **The "Connect your AI" pill waits for R3**, because `/connect` doesn't exist and R1 adds no routes. Nav keeps today's destinations. `[Builds]` waits until Phase 4 ships that page.
4. **Eyebrow labels become plain mono labels in `muted`**, without caps or tracking. R2 turns section openers into bracket labels page by page.
5. **The scroll reveal animation is removed**, not shortened: the spec allows only 150 ms fades and the chat cursor.
6. **Evidence:** the PR's Vercel preview, plus screenshots shown to Carlos. Screenshots are not committed.

## File map

| File | Change |
|---|---|
| `web/src/design/tokens.ts` (+ test) | New: dark and light colour tokens, helpers |
| `web/tailwind.config.ts` | Token colours, CSS-variable plugin, Geist families; old palette and `display` font removed |
| `web/src/app/globals.css` | Variable-based base, pills, focus ring, reduced motion; glow, aurora, reveal, ticker and card glow removed |
| `web/scripts/rename-classes.mjs` (+ test) | One-off codemod with the mapping table, deleted in Task 7 |
| ~44 files in `web/src` | Renamed classes (generated) |
| The button sites listed in Task 3 | `btn` / `btn btn-primary` |
| `web/src/app/fonts.ts` | New: Geist variables |
| `web/src/components/Bracket.tsx` (+ test) | New: `[label]` |
| `layout.tsx`, `Header.tsx`, `Footer.tsx` | Fonts, wordmark, bracket navigation |
| `web/src/app/icon.svg`, `opengraph-image.tsx` | Green diamond favicon, new social card |
| `page.tsx`, `Reveal.tsx` (deleted), `data/tools.ts`, `EmailCapture.tsx`, `GoldCalculator.tsx` | Ticker, aurora, reveal and emoji removed |
| `web/src/design/guard.test.ts` | New: banned-pattern scan |
| `THIRD_PARTY.md` | Geist under Media and in the `web` licence row |

## Review Focus

1. **Meaning carried by gold vs green.**
   - Today: home tool cards show "Available" in green and "Planned" or "Collecting data" in gold.
   - Risk: a plain rename makes both green (`#1EFF00` vs `#9CF03A`).
   - Expected: Available in `q-uncommon`, the others in `muted`.
   - Test: Task 5's home test.
2. **Surfaces nobody has seen in light mode**: the open mobile menu, the cookie banner, inputs and placeholders, and `bg-canvas/60` overlays.
   - Expected: readable text and visible edges.
   - Tests: the placeholder rows in Task 2's mapping test, and Task 7's light screenshots with the menu open and the banner showing.
3. **Opacity on text** (`text-muted/60`) silently drops below 4.5:1.
   - Test: the guard's text-opacity rule (Task 6).
4. **Windows High Contrast (forced colours).**
   - Risk: an outline drawn with a mask vanishes, leaving the primary button with no edge.
   - Expected: a visible border.
   - Test: Task 3 checks that `.btn-primary` keeps a `1.5px solid transparent` border, which forced-colours mode paints.
5. **Drift from `main`:** PRs merged between the codemod run and the R1 merge can bring old classes back.
   - Expected: CI fails, and rerunning the codemod fixes it.
   - Test: the guard runs in CI's `verify` job (Task 6), and Task 7 reruns the codemod after rebasing.

---

### Task 1: Colour tokens for dark and light

**Files:**
- Create: `web/src/design/tokens.ts`, `web/src/design/tokens.test.ts`
- Modify: `web/tailwind.config.ts`, `web/src/app/globals.css`

**Interfaces:**
- Produces:
  ```ts
  export type Mode = "dark" | "light";
  export const QUALITIES = ["poor", "common", "uncommon", "rare", "epic", "legendary"] as const;
  export const CLASSES = ["warrior", "paladin", "hunter", "rogue", "priest", "shaman", "mage", "warlock", "druid"] as const;
  export type TokenName =
    | "canvas" | "panel" | "line" | "fg" | "fg-2" | "muted" | "accent" | "danger" | "warning"
    | "tooltip" | "tooltip-border" | "tooltip-inner" | "grad-from" | "grad-to"
    | `q-${(typeof QUALITIES)[number]}` | `class-${(typeof CLASSES)[number]}` | "chat-whisper" | "chat-guild";
  export const tokens: Record<Mode, Record<TokenName, string>>; // "#RRGGBB"
  export const TEXT_TOKENS: TokenName[]; // fg, fg-2, muted, accent, danger, warning, q-*, class-*, chat-*
  export function channels(hex: string): string; // "#0E0F0D" -> "14 15 13"
  export function cssVariables(mode: Mode): Record<string, string>; // { "--canvas": "14 15 13", ... }
  ```
  Tailwind colour names cover every `TokenName` except `grad-from` and `grad-to`, each as `rgb(var(--<name>) / <alpha-value>)`. Examples: `text-fg-2`, `bg-panel`, `border-line`, `text-q-epic`, `text-class-mage`, `border-tooltip-border`.

- [ ] **Step 1: Write the failing tests** in `tokens.test.ts`. Put the WCAG 2.x `contrast(a, b)` helper in the test file.

```ts
test("the values are the spec's", () => {
  expect([tokens.dark.canvas, tokens.light.canvas]).toEqual(["#0E0F0D", "#FBF8EC"]);
  expect([tokens.dark.accent, tokens.light.accent]).toEqual(["#9CF03A", "#2F7A0A"]);
  expect(tokens.dark["q-rare"]).toBe("#4C9BFF");
  expect(tokens.light["class-rogue"]).toBe("#746500");
  expect(tokens.light["chat-whisper"]).toBe("#A3218F");
  for (const m of ["dark", "light"] as const)
    expect([tokens[m].tooltip, tokens[m]["tooltip-border"], tokens[m]["tooltip-inner"]])
      .toEqual(["#080C18", "#5B6B8C", "#26324F"]);
});
test.each(["dark", "light"] as const)("every text token reaches 4.5:1 on canvas and panel (%s)", (m) => {
  for (const t of TEXT_TOKENS) for (const bg of ["canvas", "panel"] as const)
    expect(contrast(tokens[m][t], tokens[m][bg]), `${t} on ${bg}`).toBeGreaterThanOrEqual(4.5);
});
test("dark text tokens read inside the tooltip frame", () => {
  for (const t of TEXT_TOKENS) expect(contrast(tokens.dark[t], tokens.dark.tooltip), t).toBeGreaterThanOrEqual(4.5);
});
test.each(["dark", "light"] as const)("the primary outline stops reach 3:1 on the canvas (%s)", (m) => {
  for (const t of ["grad-from", "grad-to"] as const)
    expect(contrast(tokens[m][t], tokens[m].canvas)).toBeGreaterThanOrEqual(3);
});
test("channels", () => expect(channels("#0E0F0D")).toBe("14 15 13"));
test("Tailwind exposes the tokens as variables", () => {
  const colors = config.theme!.extend!.colors as Record<string, unknown>;
  expect(colors.fg).toBe("rgb(var(--fg) / <alpha-value>)");
  expect(Object.keys(colors)).toEqual(expect.arrayContaining(["canvas", "fg-2", "q-legendary", "class-druid", "chat-guild", "tooltip-border"]));
  expect(colors).not.toHaveProperty("grad-from");
});
```

- [ ] **Step 2: Run** `npm test -- src/design/tokens.test.ts` in `web/`. Expected: FAIL, because `./tokens` doesn't resolve.
- [ ] **Step 3: Implement.**
  - **`tokens.ts`:** every value from the spec's two colour tables, plus:
    - the tooltip values;
    - `grad-from`/`grad-to`: dark `#1EFF00`/`#9CF03A`, light `#1A7A12`/`#2F7A0A` (Decision 1).
  - **`tailwind.config.ts`:**
    - add the token colours next to the old palette, which stays until Task 3;
    - add a plugin (`tailwindcss/plugin`) whose `addBase` emits `":root": cssVariables("dark")` and `"@media (prefers-color-scheme: light)": { ":root": cssVariables("light") }`.
  - **`globals.css`:**
    - set `:root { color-scheme: light dark; }`;
    - set `html, body` background and colour to `rgb(var(--canvas))` and `rgb(var(--fg))`;
    - make the focus ring `outline: 2px solid rgb(var(--accent))`;
    - delete the `body::before` glow.
- [ ] **Step 4: Run** `npm test -- src/design`, then `npm run build`. Expected: PASS, and the build succeeds.
- [ ] **Step 5: Commit** `feat(web): colour tokens for dark and light`.

### Task 2: Rename the old classes

**Files:**
- Create: `web/scripts/rename-classes.mjs`, `web/scripts/rename-classes.test.ts`
- Modify: the non-test `.ts`/`.tsx` files under `web/src` that the script rewrites (about 44)

**Interfaces:**
- Consumes: Task 1's colour names.
- Produces:
  ```ts
  export function mapClass(token: string): string | null; // null = not an old class (or a Task 3 token): leave it; "" = delete it
  export function rewrite(source: string): { source: string; manual: string[] };
  ```
  CLI: `node scripts/rename-classes.mjs` rewrites every non-test `.ts`/`.tsx` under `src/` in place. It prints `file: token` for each token left to Task 3.

**Mapping table.** Variant prefixes (`hover:`, `focus:`, `group-hover:`, `placeholder:`) are kept. This table goes in the PR body.

| Old | New |
|---|---|
| `text-parchment-100`, `/90`, `/85` | `text-fg` |
| `text-parchment-100/80`, `/75`, `/70` | `text-fg-2` |
| `text-parchment-100/60`, `/55`, `/50`, `/40`, `/30` (also `placeholder:`) | `text-muted` |
| `text-gold-300`, `text-gold-400` | `text-accent` |
| `text-gold-500/80`, `/70`, `/60` (eyebrow labels) | `text-muted` |
| `text-uncommon`, `text-red-400` | `text-q-uncommon`, `text-danger` |
| `bg-parchment-950[/n]`, `bg-parchment-900[/n]` | `bg-canvas[/n]`, `bg-panel[/n]` |
| `bg-gold-400/10`, `bg-gold-400/5`, `bg-uncommon/5` | `bg-accent/10`, `bg-accent/5`, `bg-q-uncommon/5` |
| `border-parchment-100/*`, `border-arcane/30`, `divide-parchment-100/5` | `border-line`, `border-line`, `divide-line` |
| `hover:border-parchment-100/40` | `hover:border-muted` |
| `border-gold-400/*`, `border-gold-500/*` at rest | `border-line` |
| `border-gold-400` at rest (selected filter) | `border-accent` |
| `hover:`/`focus:` + any `border-gold-*` | same prefix + `border-accent` |
| `hover:border-red-400/50` | `hover:border-danger` |
| `border-uncommon/40` | `border-q-uncommon/40` |
| `accent-gold-500` | `accent-accent` |
| `font-display`; `tracking-wide`, `tracking-wider`, `tracking-widest`, `tracking-[0.Nem]` | deleted |
| `uppercase` | `font-mono` (once per class string) |
| `bg-gold-400`, `bg-gold-500`, `hover:bg-gold-400`, `text-parchment-950` | left for Task 3 and reported |

- [ ] **Step 1: Write the failing tests.**
  - `test.each(TABLE)("%s -> %s", (old, next) => expect(mapClass(old)).toBe(next))` with one row per table line. Include:
    - `hover:text-gold-400 → hover:text-accent`
    - `placeholder:text-parchment-100/30 → placeholder:text-muted`
    - `focus:border-gold-400 → focus:border-accent`
    - `border-gold-500/30 → border-line`
    - `font-display → ""`
    - `text-q-uncommon → null`
    - `bg-gold-500 → null`
  - Then the `rewrite` cases:

```ts
expect(rewrite(`<p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">`).source)
  .toBe(`<p className="font-mono text-xs text-muted">`);
expect(rewrite(`className="font-mono uppercase"`).source).toBe(`className="font-mono"`);
expect(rewrite(`"bg-gold-500 text-parchment-950"`).manual).toEqual(["bg-gold-500", "text-parchment-950"]);
expect(rewrite(`href="/tools/gold-ledger"`).source).toBe(`href="/tools/gold-ledger"`);
```

- [ ] **Step 2: Run** `npm test -- scripts/rename-classes.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `mapClass` and `rewrite`.
  - Tokens are looked up only inside string and template literals, split on whitespace.
  - A literal is rewritten only if one of its tokens maps.
  - Whitespace inside a rewritten literal is collapsed.
- [ ] **Step 4: Run** the test. Expected: PASS. Commit the script and test: `chore(web): class rename codemod for the new identity`.
- [ ] **Step 5: Run** `node scripts/rename-classes.mjs` in `web/`. Expected: the manual list contains only the tokens of the 14 filled buttons in Task 3. Check what's left:
  - Run: `grep -rnE "(text|bg|border|divide|accent)-(gold|parchment|arcane)|font-display|[\" ]uppercase[\" ]" src --include=*.ts --include=*.tsx | grep -v "\.test\."`.
  - Expected: only those manual tokens.
- [ ] **Step 6: Run** `npm test && npm run lint && npm run build`. Expected: all pass. Commit the generated changes on their own: `style(web): rename old palette classes (scripts/rename-classes.mjs)`.

### Task 3: Pill buttons

**Files:**
- Modify: `web/src/app/globals.css`, `web/tailwind.config.ts`, the button sites below
- Test: `web/src/design/buttons.test.ts`

**Interfaces:**
- Consumes: the `--fg`, `--accent`, `--grad-from` and `--grad-to` variables (Task 1).
- Produces: the classes `btn` (outline pill) and `btn-primary` (modifier, always used as `btn btn-primary`), in `@layer components`. They are written as plain CSS declarations, not `@apply`, so the test can read them.

- [ ] **Step 1: Write the failing tests.** `buttons.test.ts` reads `globals.css` as text, plus the source files:
  - The `.btn` rule contains `border-radius: 9999px`, `border: 1px solid rgb(var(--fg))` and `background: transparent`.
  - The `.btn-primary` rule contains `border: 1.5px solid transparent`.
  - The `.btn-primary::before` rule contains `var(--grad-from)`, `var(--grad-to)` and `mask-composite: exclude`.
  - Each of the 14 primary sites below contains `btn btn-primary`.
  - No non-test file under `src/` contains `bg-gold-` or `text-parchment-950`.
- [ ] **Step 2: Run** `npm test -- src/design/buttons.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the CSS.**
  - **`.btn`:**
    - layout: `inline-flex`, centred, `gap: 0.5rem`, `min-height: 2.75rem`, `padding: 0 1.25rem`;
    - shape: full radius, 1 px `fg` border, transparent background;
    - type: `fg` text, weight 500;
    - motion: 150 ms `border-color` and `color` transitions;
    - states: the border turns `accent` on `:hover` and `:focus-visible`; `:disabled` and `[aria-disabled="true"]` get opacity 0.5 and `cursor: not-allowed`.
  - **`.btn-primary`:**
    - `position: relative` and the transparent 1.5 px border;
    - a `::before` with `inset: -1.5px`, `border-radius: inherit` and `padding: 1.5px`;
    - on that `::before`, the background `linear-gradient(90deg, rgb(var(--grad-from)), rgb(var(--grad-to)))`, masked to the ring (`mask-composite: exclude`, `-webkit-mask-composite: xor`), with `pointer-events: none`.
- [ ] **Step 4: Convert the button sites.**
  - **Primary (`btn btn-primary`), the 14 filled buttons:**
    - `app/tools/auctions/page.tsx:55`, `app/tools/collections/page.tsx:54`, `app/tools/gold-ledger/page.tsx:57`, `app/tools/guild-board/page.tsx:54`, `app/tools/professions/page.tsx:103`;
    - `app/upload/UploadClient.tsx:13`, `app/not-found.tsx:12`, `app/page.tsx:50` (also drop `cta-glow` and the book emoji span);
    - `components/BrowseFilters.tsx:32`, `CookieConsent.tsx:81`, `EmailCapture.tsx:61`, `GoldCalculator.tsx:448`, `IdLookup.tsx:32`, `LoreSearchForm.tsx:15`.
  - **Outline (`btn`):**
    - `components/Header.tsx` (menu toggle), `app/not-found.tsx:15`, `app/page.tsx:55`;
    - `components/CookieConsent.tsx:79-80`;
    - `components/GoldCalculator.tsx:277`, `:452` and `:458`. The last one adds `hover:border-danger hover:text-danger`;
    - `app/addons/polestar/packs/page.tsx:52`, `app/lore/page.tsx:43` and `:47`.
  - **Check by hand:** the bordered or filled buttons in `components/AccountControls.tsx:50-52` and `app/upload/UploadClient.tsx:95, 121, 140, 141` become `btn`. Text-only buttons stay as they are.
  - **On every converted element:**
    - remove `rounded-*`, `border*`, `bg-*`, `text-canvas`/`text-fg*`, `font-medium`/`font-semibold`, `hover:bg-*`, `transition`;
    - remove `px-*`/`py-*`, except keep `px-3` and `text-sm` on compact buttons;
    - keep layout utilities (`min-h-11`, `w-full`, `self-*`, `justify-self-*`, `disabled:*`).
  - **Elsewhere:** the rounded tag links in `app/lore/[slug]/page.tsx` are chips, not buttons, and stay.
- [ ] **Step 5: Delete the old palette** from `tailwind.config.ts`: `gold`, `parchment`, `arcane`, `epic`, `rare`, `uncommon`, `legendary`.
- [ ] **Step 6: Run** `npm test && npm run lint && npm run build`. Expected: all pass, and the codemod's manual list is now empty. Commit `feat(web): outline pill buttons`.

### Task 4: Geist, wordmark, bracket navigation, favicon and social card

**Files:**
- Modify: `web/package.json` and `web/package-lock.json` (`npm install --save-exact geist@1.8.1`)
- Create: `web/src/app/fonts.ts`, `web/src/components/Bracket.tsx`, `web/src/components/bracket.test.tsx`
- Modify:
  - `web/src/app/layout.tsx`, `web/tailwind.config.ts` (`fontFamily`), `web/src/app/globals.css` (drop the `font-feature-settings` line, which targeted the old system fonts);
  - `web/src/components/Header.tsx`, `header.test.tsx`, `Footer.tsx`;
  - `web/src/app/icon.svg`, `opengraph-image.tsx`, `social-preview.test.tsx`;
  - `THIRD_PARTY.md`.

**Interfaces:**
- Consumes: `tokens` (Task 1).
- Produces:
  ```ts
  // web/src/app/fonts.ts
  export const fontVariables: string; // `${GeistSans.variable} ${GeistMono.variable}`, i.e. --font-geist-sans and --font-geist-mono
  // web/src/components/Bracket.tsx
  export default function Bracket({ children }: { children: React.ReactNode }): JSX.Element;
  ```
  - `Bracket` renders `<span class="font-mono"><span aria-hidden="true" class="text-muted">[</span>{children}<span aria-hidden="true" class="text-muted">]</span></span>`.
  - Tailwind fonts:
    - `sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"]`;
    - `mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"]`;
    - `display` is removed.

- [ ] **Step 1: Write the failing tests.**
  - **`bracket.test.tsx`:** `renderToStaticMarkup(<Bracket>Database</Bracket>)` equals the markup above exactly.
  - **`header.test.tsx`** (replaces the current assertion, with the same mocks):
    - the primary links keep their order: Database, Lore, Upload, Gold/Hour, Addons;
    - each is wrapped in `Bracket`: `toMatch(/href="\/database"[^>]*><span class="font-mono"><span aria-hidden="true" class="text-muted">\[<\/span>Database/)`;
    - the `/` link contains `everloot` and an `<svg aria-hidden="true"`;
    - the markup doesn't contain `shadow-`.
  - **`social-preview.test.tsx`:**
    - add `vi.mock("./fonts", () => ({ fontVariables: "" }))`, because `next/font` only runs under Next's compiler;
    - keep the PNG checks;
    - add a test that the `#RRGGBB` values in `icon.svg` are exactly `{tokens.dark.canvas, tokens.dark.accent}`.
- [ ] **Step 2: Run** `npm test -- src/components src/app/social-preview.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **`layout.tsx`:** put `fontVariables` on `<html>`.
  - **`Header.tsx`:**
    - the wordmark is a 16 px outlined diamond (the `icon.svg` path, `stroke="currentColor"`, `text-accent`, `aria-hidden`) followed by `everloot` in `font-bold tracking-tight text-fg`;
    - nav links are `<Bracket>` in `text-muted hover:text-fg`;
    - the menu panel loses `shadow-xl`.
  - **`Footer.tsx`:** the brand reads `everloot` in `font-semibold text-fg`.
  - **`icon.svg`**, exactly:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0E0F0D"/><path d="M32 12 52 32 32 52 12 32Z" fill="none" stroke="#9CF03A" stroke-width="5" stroke-linejoin="round"/></svg>`
  - **`opengraph-image.tsx`:**
    - colours from `tokens.dark`: canvas background;
    - the outlined green diamond and `everloot` in `fg` (Geist Bold, 120 px, `letterSpacing: -4`);
    - "Database, guild tracker and tools from addon uploads" in `fg-2` at 38 px, and `everloot.app` in `muted`;
    - no uppercase, no positive letter spacing, no purple bar, and `alt` unchanged;
    - fonts: read `Geist-Bold.ttf` and `Geist-Regular.ttf` from `node_modules/geist/dist/fonts/geist-sans/` relative to `process.cwd()`. The image is prerendered at build, so the files are read at build time.
  - **`THIRD_PARTY.md`:**
    - under Media, replace "The site uses the visitor's system fonts and ships no third-party fonts." with "The site self-hosts the Geist and Geist Mono fonts by Vercel (SIL Open Font License 1.1) from the `geist` npm package.";
    - add `OFL-1.1 1 (geist)` to the `web` row.
  - **If `next build` reports that `geist` needs compiling:** add `transpilePackages: ["geist"]` to `next.config.js`, and update `src/next-config.test.ts` if it pins the config shape.
- [ ] **Step 4: Run** `npm test && npm run lint && npm run build`. Expected: all pass. Commit `feat(web): Geist, wordmark, bracket navigation, favicon and social card`.

### Task 5: Remove the old effects and emoji

**Files:**
- Modify: `web/src/app/globals.css`, `web/src/app/page.tsx`, `web/src/data/tools.ts`, `web/src/components/EmailCapture.tsx`, `web/src/components/GoldCalculator.tsx`
- Delete: `web/src/components/Reveal.tsx`
- Test: create `web/src/app/home.test.tsx` (mock `next/link` the way `app/addons/addons.test.tsx` does)

- [ ] **Step 1: Write the failing test:**

```ts
const html = renderToStaticMarkup(<Home />);
expect(html).not.toMatch(/ticker|aurora|reveal|cta-glow/);
expect(html).toMatch(/text-q-uncommon[^"]*"[^>]*>Available</);
expect(html).toMatch(/text-muted[^"]*"[^>]*>(Planned|Collecting data)</);
expect(html).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{25A0}-\u{25FF}]/u);
```

- [ ] **Step 2: Run** `npm test -- src/app/home.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **`globals.css`:**
    - delete `.aurora` and `aurora-drift`, the `.reveal` rules and `rise-in`, `.ticker-track` and `ticker-scroll`, and `.cta-glow` with `cta-settle`;
    - in `.tool-card`, delete the hover shadow and lift, and keep only a 150 ms `border-color` transition;
    - replace the reduced-motion block with a global `*, ::before, ::after { animation: none !important; transition: none !important; }`.
  - **`page.tsx`:**
    - delete `TICKER` and the ticker markup, the aurora div, the `Reveal` wrappers and import;
    - delete the three emoji divs under "Why this site" and the `tool.icon` div;
    - status chip: Available gets `text-q-uncommon border-q-uncommon/40`, the others get `text-muted border-line`.
  - **`tools.ts`:** remove `icon` from `Tool` and from every entry.
  - **Glyphs:**
    - drop the check mark at `EmailCapture.tsx:37`, and at `GoldCalculator.tsx:450` and `:456`;
    - drop the bulb at `GoldCalculator.tsx:431`;
    - the words stay.
  - **Delete `Reveal.tsx`.**
- [ ] **Step 4: Run** `npm test && npm run lint && npm run build`. Expected: all pass. Commit `feat(web): remove ticker, glow, reveal and emoji`.

### Task 6: Guard tests

**Files:**
- Create: `web/src/design/guard.test.ts` (rules, scanner and self-tests in one file)

**Interfaces:**
- Consumes: `tailwind.config.ts`.
- Produces: nothing outside the file. CI's `verify` job runs it with the web suite.

**Rules.** Each rule is applied line by line to every non-test `.ts`, `.tsx` and `.css` file under `web/src`. `globals.css` is scanned with its `.btn-primary::before { … }` block removed. Each rule lists strings it must match and strings it must not.

- **old palette:** `/\b(?:text|bg|border|divide|ring|from|via|to|accent|outline|fill|stroke|placeholder|decoration|caret)-(?:gold|parchment|arcane)\b/`
  - bites: `hover:text-gold-400`
  - spares: `href="/tools/gold-ledger"`
- **default palette:** `/\b(?:text|bg|border|ring|divide|from|via|to)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b|\b(?:text|bg|border)-(?:white|black)\b/`
  - bites: `text-red-400`
  - spares: `text-danger`
- **fantasy type:** `/\bfont-display\b|Cinzel/`
  - bites: `font-display`
  - spares: `font-mono`
- **pictographs:** `/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{25A0}-\u{25FF}\u{FE0F}]/u`
  - bites: `✦`, `◆`, `✓`, `🪙`
  - spares: `—`, `·`, `→`, `×`
- **glow and shadow:** ``/(?:^|[\s"'`])(?:[a-z-]+:)*shadow(?:-(?:sm|md|lg|xl|2xl|inner))?(?=[\s"'`]|$)|box-shadow|text-shadow|drop-shadow|gradient\(/``
  - bites: `shadow-xl`, `radial-gradient(`
  - spares: `Shadowfang`
- **capital labels:** ``/(?:^|[\s"'`])(?:[a-z-]+:)*(?:uppercase|tracking-(?:wide|wider|widest|\[0?\.\d+em\]))(?=[\s"'`]|$)|textTransform:\s*["']uppercase|letterSpacing:\s*[1-9]/``
  - bites: `uppercase tracking-[0.2em]`, `letterSpacing: 6`
  - spares: `tracking-tight`, `letterSpacing: -4`, `toUpperCase()`
- **old effects:** `/\b(?:ticker-track|aurora|cta-glow|marquee)\b/`
  - bites: `ticker-track`
  - spares: `price ticker`
- **text opacity:** ``/(?:^|[\s"'`])(?:[a-z-]+:)*text-(?:fg|fg-2|muted|accent|danger|warning|q-[a-z]+|class-[a-z]+|chat-[a-z]+)\/\d+/``
  - bites: `text-muted/60`
  - spares: `text-muted`, `bg-canvas/60`

- [ ] **Step 1: Write the tests.**
  - `test.each(RULES)("%s rule bites", …)` checks each rule's bites and spares.
  - `test.each(RULES)("no %s in web/src", …)` expects the offender list (`"path:line"`) to equal `[]`.
  - `test("only Geist families")` checks `Object.keys(config.theme.extend.fontFamily)` equals `["sans", "mono"]`.
- [ ] **Step 2: Run** `npm test -- src/design/guard.test.ts`. Expected: the self-tests pass, and the scan fails on "glow and shadow" at `src/components/CookieConsent.tsx:71` (`shadow-xl`). Fix any other offender the same way: replace it with a token or remove it.
- [ ] **Step 3: Fix.** Remove `shadow-xl` from the cookie banner, which keeps its `border-line`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS. Commit `test(web): guard the identity against the old look`.

### Task 7: Evidence and PR

- [ ] **Step 1: Rebase** onto `main` and rerun `node scripts/rename-classes.mjs`. Expected: no manual tokens and no changes. If it does rewrite files, review them and commit.
- [ ] **Step 2: Delete** `web/scripts/rename-classes.mjs` and its test; the PR body keeps the mapping table. Commit `chore(web): remove the one-off rename codemod`.
- [ ] **Step 3: Run the checks.** From the repo root, run `python scripts/check_internal_paths.py`. In `web/`, run `npm test && npm run lint && npm run build`. Expected: all pass.
- [ ] **Step 4: Take the screenshots.** Start the site locally the way `web/README.md` describes (sample release) and capture these with Playwright:
  - `/`, `/database`, one item page from the sample release, `/lore` and `/addons`;
  - each in dark and light (`prefers-color-scheme` emulation) at 390 and 1440 px;
  - in light at 390 px, the open menu and the cookie banner.

  Check each screenshot against the spec's Acceptance list: no gold, glow, emoji, card shadows or ticker, and a visible focus ring when tabbing through the header.
- [ ] **Step 5: Open the PR.**
  - Push `feat/visual-identity-r1` and open the PR against `main`.
  - The body has a summary, the mapping table, Decisions 1–6, the test, lint and build results, and the Vercel preview link.
  - Show Carlos the screenshots, and Carlos merges.

## Later plans (outline only)

- **R2, components:**
  - the tooltip frame, which re-declares the dark variables inside itself so items look the same in both modes;
  - bracket item links in quality colours, with hover and focus previews;
  - evidence tags, citation chips, stat blocks with tabular figures, leaderboards, the spoiler gate and states;
  - all applied to the database, lore and addons pages, where section openers become `Bracket` labels.
- **R3, agent chat and `/connect`:**
  - the ⌘K / Ctrl+K chat box over the existing search, with `To [Everloot]:` and `[Everloot] whispers:` in `chat-whisper`;
  - sourced evidence once `answer_sources` exists, and "Ask in ChatGPT / Claude";
  - the `/connect` page and the "Connect your AI" pill.
- **R4, home page:**
  - the big headline: up to 9vw, weight 600, line height 0.92, tracking -0.035em;
  - our data as imagery;
  - new copy drafted for Carlos's review.
