# Visual identity R2 (components) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the database, lore and addons pages the identity's components: tooltip frames for game things, bracket item links, bracket section labels, evidence tags, citation chips, stat blocks and plain state lines. Tests keep them in use. No route, API or behaviour change.

**Architecture:** Each component is a small server component in `web/src/components/`, written with literal Tailwind classes. Tailwind only generates classes it finds in `src/app` and `src/components`, so nothing is assembled at runtime. Pages swap their hand-written markup for the components.
- The tooltip frame builds on R1's `.bg-tooltip` base rule, which re-declares the dark variables. The frame also sets `text-fg` on itself, so inherited text resolves against those variables.
- The existing contrast and guard tests grow by a few cases. Guard rules gain an `allow` list, so a rule can name the one file allowed to use a pattern.

**Tech Stack:** as R1: Next.js 15.5 App Router, React 19, Tailwind CSS 3.4, Vitest 5. Tests render with `renderToStaticMarkup`.

**Spec:** `docs/superpowers/specs/2026-10-17-visual-identity-design.md` (Components 2, 4 to 8 and 11; Rollout, R2). The R1 plan is `docs/superpowers/plans/2026-10-17-visual-identity-r1.md`; R1 shipped as #19.

**When:** now that R1 is live. R2, R3 and R4 all land before the WoW: Forever launch on 11/04.
- Branch: `feat/visual-identity-r2`, from `main`.
- One PR. Carlos merges it, and merging deploys production.

## Scope

**R2:** the tooltip frame, bracket item links, bracket section labels, evidence tags, citations, stat blocks and states, applied to `/database` and its pages, `/lore` and its pages, and the Polestar pages under `/addons`.

**Not in R2:**
- **R3:** the ⌘K / Ctrl+K chat box over search, `To [Everloot]:` and `[Everloot] whispers:`, citations fed by `answer_sources`, "Ask in ChatGPT / Claude", the `/connect` page and the "Connect your AI" pill. `/search` keeps its R1 look until then.
- **R4:** the home page: the big headline, our data as imagery, new copy.
- **Waiting for their pages:** `[Builds]` in the nav (Phase 4), and faction colours (the first page that needs them).
- **Deferred by this plan:** item hover and focus previews, the spoiler gate, and the leaderboard if `/addons/popular` hasn't merged (Decisions 3 to 5).
- **Other pages** (tools, guilds, upload, search, not-found) keep R1's plain mono eyebrows. #15 is rewriting `/tools/auctions`.

## Global Constraints

- No route, API, metadata or behaviour change (spec, Acceptance). Copy stays as it is, except the eyebrow labels in Task 3's table.
- No new colour values: `tokens.ts` doesn't change, and nothing is added to `globals.css`.
- Classes are written out in full. A class built at runtime, like `text-q-${q}`, is never generated, so components map values to literal class strings.
- Colour is a taxonomy (quality, chat) or the accent for actions. Numbers are `fg`, not `accent`.
- Every R1 guard rule stays green.
- Don't touch `app/page.tsx` (R4), `app/search/` (R3) or `app/tools/` (#15 rewrites `tools/auctions/page.tsx`).
- Commits are signed off (`git commit -s`) and end with the `Co-Authored-By` trailer. Public text is in plain words and never says how it was written.

## Decisions for the owner

The plan follows each default below; Carlos can veto any of them in review.

1. **Section labels name the nav section.** `[Database]`, `[Lore]` and `[Addons]` replace the leading "WoW: Forever", "Lore archive" and "Addons" of today's eyebrows, and the rest follows in `muted` (Task 3 table). Three test assertions that quote the old eyebrows change with them.
2. **Item links with unknown quality are common, not accent green.** That means white in dark mode and near-black in light.
   - The database doesn't carry item quality yet. The addon sends it in `item_seen` records (`web/src/lib/intake.ts`), but `itemFactsFromRecords` in `kb/src/drop-rollup.ts` keeps only names.
   - Keeping an agreed quality (three installs, like names) is a data change, so it is a follow-up, not R2.
   - Until then every item link is `q-common`, and the brackets mark it as a link.
3. **No hover or focus previews on item links yet.** A preview needs item data the linking page doesn't have, which means a new API, and R2 adds none. Previews come with item quality.
4. **The spoiler gate waits for game-file content.**
   - Nothing on the site comes from game files yet. The datamining policy (#14) is a draft that merges with the first published diff.
   - Recommendation for that PR: a closed `<details>` with a "Show unreleased" summary, remembered in `localStorage`, instead of a blur.
   - A blur leaves the text in the page for copying, screen readers and search snippets, so it hides less than it appears to. It also needs a guard exception. If Carlos keeps the blur, the exception is narrow (see Later).
5. **The leaderboard is built where it's used.** No page on `main` has one yet.
   - If `/addons/popular` (`feat/addons-popular`) merges first, Task 7 restyles it.
   - Otherwise that PR uses Task 7's classes, and R2 skips it.
6. **Stat numbers change from accent to `fg`**, in Geist Mono. Accent stays for links and actions, as the spec allows colour only as a taxonomy or for actions.

## File map

| File | Change |
|---|---|
| `web/src/components/TooltipFrame.tsx` (+ `tooltip-frame.test.tsx`) | New: the dark frame for game things |
| `web/src/components/ItemLink.tsx` (+ `item-link.test.tsx`) | New: `[Item]` link in its quality colour |
| `web/src/components/SectionLabel.tsx`, `EvidenceTag.tsx`, `Citation.tsx` (+ tests) | New |
| `web/src/components/StatBlock.tsx`, `State.tsx` (+ tests) | New |
| `web/src/design/tokens.test.ts` | Frame border and in-frame edge contrast |
| `web/src/design/guard.test.ts` | `allow` lists; "tooltip frame" and "item links" rules |
| The 9 `page.tsx` files under `web/src/app/database/`, `gap-rendering.test.tsx`, new `entity-pages.test.tsx` | Components applied |
| `web/src/app/lore/page.tsx`, `[slug]/page.tsx`, `browse/[type]/page.tsx`, `coverage/page.tsx` and their tests | Components applied |
| `web/src/app/addons/polestar/page.tsx`, `packs/page.tsx`, `wanted/page.tsx`, `addons.test.tsx` | Components applied |

## Review Focus

1. **Text colour inside the frame.**
   - Risk: `body` sets `color: rgb(var(--fg))`, which is computed on the body. In light mode, text with no class of its own would carry near-black into the dark frame.
   - Expected: the frame sets `text-fg` on itself, so its text resolves against the dark variables.
   - Test: Task 1's markup test, and the light screenshots in Task 8.
2. **Dark frames on a light page.**
   - Risk: a frame is a dark block on the cream canvas.
   - Expected: only an entity's title block sits in a frame, never a whole page.
   - Test: light screenshots at 390 px.
3. **Negative assertions that stop testing anything.**
   - Risk: `gap-rendering.test.tsx` checks `not.toMatch(/>0<\/div>/)` and `not.toContain("Item #9")`. Once stats move to `<dd>` and links gain brackets, a negative check can pass for the wrong reason.
   - Expected: each changes alongside a positive case proving the markup it targets exists.
   - Test: Task 5.
4. **Classes Tailwind never sees.**
   - Risk: a quality class assembled at runtime renders unstyled.
   - Test: Task 2 reads `ItemLink.tsx` and checks that every `text-q-*` class is there as a literal.
5. **Collisions with other work.**
   - Open PRs:
     - #13 and #16 change `kb` only;
     - #14 is docs;
     - #15 changes `web/src/app/tools/auctions/page.tsx`, API routes and `web/src/lib/`.
   - R2 touches none of their files.
   - Started but not pushed: `feat/addons-popular` and `fix/forever-copy`. A copy fix to the same eyebrows or state lines conflicts in text only. Rebase and keep their words.

---

### Task 1: Tooltip frame

**Files:**
- Create: `web/src/components/TooltipFrame.tsx`, `web/src/components/tooltip-frame.test.tsx`
- Modify: `web/src/design/tokens.test.ts`, `web/src/design/guard.test.ts`

**Interfaces:**
- Produces:
  ```tsx
  export default function TooltipFrame({ children }: { children: ReactNode }): JSX.Element;
  ```
  - Markup, exactly: `<div class="bg-tooltip text-fg rounded-md border border-tooltip-border p-px"><div class="space-y-3 rounded border border-tooltip-inner p-4">{children}</div></div>`.
  - The spec's outer border and inner line are two real borders, not a ring, because Tailwind draws rings with `box-shadow`.
- Guard: `type Rule` gains `allow?: string[]`, a list of paths under `src/` such as `components/TooltipFrame.tsx`. `offenders()` skips those files.

- [ ] **Step 1: Write the failing tests.**
  - **`tooltip-frame.test.tsx`:** `renderToStaticMarkup(<TooltipFrame><h1>Linen Cloth</h1></TooltipFrame>)` equals the markup above.
  - **`tokens.test.ts`**, with its own `rootVars`, `baseStyles`, `hex` and `contrast`. These pass on today's values (the lowest are 3.36:1 and 3.66:1); they hold the values R2 builds on.
    ```ts
    test.each(["dark", "light"] as const)("the tooltip frame's border reaches 3:1 on canvas and panel (%s)", (m) => {
      const vars = rootVars(m);
      for (const bg of ["canvas", "panel"] as const)
        expect(contrast(hex(vars["--tooltip-border"]), hex(vars[`--${bg}`])), bg).toBeGreaterThanOrEqual(3);
    });
    test.each(["dark", "light"] as const)("control edges reach 3:1 inside the tooltip frame (%s)", (m) => {
      const inside = { ...rootVars(m), ...(baseStyles()[".bg-tooltip"] as Vars) };
      expect(contrast(hex(inside["--edge"]), hex(inside["--tooltip"]))).toBeGreaterThanOrEqual(3);
    });
    ```
  - **`guard.test.ts`:**
    - the rule `{ name: "tooltip frame", pattern: token("bg-tooltip"), bites: ["bg-tooltip", "md:bg-tooltip"], spares: ["border-tooltip-border", "bg-panel"], allow: ["components/TooltipFrame.tsx"] }`;
    - `test("every allowance is used")`: each `allow` file exists, and its rule matches at least one of its lines, so a stale allowance fails.
- [ ] **Step 2: Run** `npm test -- src/components/tooltip-frame.test.tsx src/design` in `web/`. Expected: FAIL, because `./TooltipFrame` doesn't resolve and "every allowance is used" finds no file.
- [ ] **Step 3: Implement** `TooltipFrame.tsx`, the `allow` field and the skip in `offenders()`.
- [ ] **Step 4: Run** `npm test -- src/components src/design`. Expected: PASS. Commit `feat(web): tooltip frame`.

### Task 2: Item links

**Files:**
- Create: `web/src/components/ItemLink.tsx`, `web/src/components/item-link.test.tsx`

**Interfaces:**
- Consumes: `QUALITIES` from `@/design/tokens`.
- Produces:
  ```tsx
  export type Quality = (typeof QUALITIES)[number];
  export default function ItemLink({ id, quality = "common", children }: { id: number; quality?: Quality; children: ReactNode }): JSX.Element;
  ```
  - It renders `next/link` to `/database/items/{id}` with the class `{QUALITY_CLASS[quality]} hover:underline underline-offset-4`. `QUALITY_CLASS` is a `Record<Quality, string>` of literal class names.
  - The brackets take the link's colour, the way the game prints item links, and are `aria-hidden`: `<a href="/database/items/9" class="text-q-common hover:underline underline-offset-4"><span aria-hidden="true">[</span>Item #9<span aria-hidden="true">]</span></a>`.
  - Pages pass today's label text as children (Decision 2).

- [ ] **Step 1: Write the failing tests.** Mock `next/link` the way `header.test.tsx` does.
  - `<ItemLink id={9}>Item #9</ItemLink>` renders exactly the markup above.
  - `quality="epic"` puts `text-q-epic` on the link.
  - For each of `QUALITIES`, the source text of `ItemLink.tsx` contains the literal `"text-q-${q}"`.
- [ ] **Step 2: Run** `npm test -- src/components/item-link.test.tsx`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it again. Expected: PASS. Commit `feat(web): item links in quality colour`.

### Task 3: Section labels, evidence tags and citations

**Files:**
- Create, in `web/src/components/`: `SectionLabel.tsx`, `EvidenceTag.tsx`, `Citation.tsx`, `section-label.test.tsx`, `evidence-tag.test.tsx`, `citation.test.tsx`

**Interfaces:**
- Consumes: `Bracket` (R1).
- Produces:
  ```tsx
  // A page's section opener: <p class="text-xs text-fg"><Bracket>{section}</Bracket>, then, with children,
  // <span class="font-mono text-muted"> · {children}</span></p>
  export default function SectionLabel({ section, children }: { section: "Database" | "Lore" | "Addons"; children?: ReactNode }): JSX.Element;

  // Where a fact comes from.
  export type Evidence = "observed" | "game-files" | "wiki-2023";
  export default function EvidenceTag({ kind, detail }: { kind: Evidence; detail?: string }): JSX.Element;

  // A mono chip linking to a source.
  export default function Citation({ href, children }: { href: string; children: ReactNode }): JSX.Element;
  ```
  - **`EvidenceTag`** is a `<span>` with `inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-xs`, plus:

    | `kind` | Text | Classes |
    |---|---|---|
    | `observed` | `observed in play` | `border-chat-guild text-chat-guild` |
    | `game-files` | `in game files · unconfirmed` | `border-dashed border-edge text-muted` |
    | `wiki-2023` | `wiki 2023` | `border-edge text-muted` |

    `detail` follows as ` · {detail}` in the same text node. No page uses `game-files` until game-file content ships (Decision 4).
  - **`Citation`** is `<a href rel="noopener" class="inline-flex min-h-6 items-center rounded-full border border-edge px-2 font-mono text-xs text-accent break-all hover:border-accent">`.
  - **`SectionLabel`** replaces each eyebrow (`<p className="font-mono text-xs text-muted">`) on the database, lore and addons pages:

    | Page | Today | R2 |
    |---|---|---|
    | `/database` | Thottbot reborn · corroborated only | [Database] · Thottbot reborn · corroborated only |
    | `/database/drops` | the counts and data age, or Storage unreachable | [Database] · the same text |
    | item, NPC, quest and vendor pages and lookups | WoW: Forever · item (npc, quest, vendor, npcs, quests, vendors) | [Database] · item (and so on) |
    | `/lore`, `/lore/coverage`, browse pages, wiki articles | Lore archive · Warcraft Wiki, 2023 dump | [Lore] · Warcraft Wiki, 2023 dump |
    | curated lore rows | Lore archive · {source} · {version} | [Lore] · {source} · {version} |
    | lore pages when the release is unavailable | Lore archive | [Lore] |
    | `/addons/polestar` | Addons · independent | [Addons] · independent |
    | `/addons/polestar/packs`, `/addons/polestar/wanted` | Polestar · guide packs (Polestar is a link) | [Addons] · Polestar · guide packs (link kept) |

    `/addons` has no eyebrow and gets none; the `card.by` labels on its cards stay.

- [ ] **Step 1: Write the failing tests.**
  - **`section-label.test.tsx`:**
    - with `section="Database"` and the child `item`, the markup starts with `<p class="text-xs text-fg">`;
    - it contains the `Bracket` markup for `Database` (the string in `bracket.test.tsx`);
    - it has a `font-mono text-muted` span containing `item`;
    - without children it contains no `·`.
  - **`evidence-tag.test.tsx`:** `test.each` over the table for text and classes; `detail="3 install IDs"` renders `observed in play · 3 install IDs` in one text node.
  - **`citation.test.tsx`:** the `href`, `rel="noopener"`, the class string and the children.
- [ ] **Step 2: Run** `npm test -- src/components`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it again. Expected: PASS. Commit `feat(web): section labels, evidence tags and citations`.

### Task 4: Stat blocks and states

**Files:**
- Create, in `web/src/components/`: `StatBlock.tsx`, `State.tsx`, `stat-block.test.tsx`, `state.test.tsx`

**Interfaces:**
- Produces:
  ```tsx
  // One figure inside a <dl>. `quiet` is for a word that stands in for a number ("unrecorded", "not measured").
  export default function StatBlock({ label, value, quiet = false }: { label: string; value: string; quiet?: boolean }): JSX.Element;

  export type StateKind = "unavailable" | "empty" | "waiting";
  // A page's state in plain words. The words stay where they are defined today.
  export default function State({ kind, children }: { kind: StateKind; children: ReactNode }): JSX.Element;
  ```
  - **`StatBlock`:** `<div class="rounded-xl border border-line bg-panel p-4"><dt class="font-mono text-xs text-muted">{label}</dt><dd class="mt-1 font-mono text-3xl tabular-nums text-fg">{value}</dd></div>`.
    - With `quiet`, the `<dd>` is `mt-1 text-xl text-muted`.
    - R1 found that `text-xl` is the size at which "unrecorded" fits two cards side by side at 390 px.
  - **`State`:** `<p data-state={kind} class="text-sm text-fg-2">`, or `text-sm text-warning` for `unavailable`.

- [ ] **Step 1: Write the failing tests.**
  - The markup of both `StatBlock` variants; neither contains `text-accent`.
  - Each `State` kind's `data-state` and class.
- [ ] **Step 2: Run** `npm test -- src/components`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it again. Expected: PASS. Commit `feat(web): stat blocks and state lines`.

### Task 5: Database pages

**Files:**
- Modify, under `web/src/app/database/`: `page.tsx`, `drops/page.tsx`, `items/[id]/page.tsx`, `npcs/page.tsx`, `npcs/[id]/page.tsx`, `quests/page.tsx`, `quests/[id]/page.tsx`, `vendors/page.tsx`, `vendors/[id]/page.tsx`
- Modify: `web/src/app/database/gap-rendering.test.tsx`, `web/src/design/guard.test.ts`
- Create: `web/src/app/database/entity-pages.test.tsx`, with the mocks and `loot` helper of `gap-rendering.test.tsx`

- [ ] **Step 1: Write the failing tests.**
  - **Guard rule:**
    ```ts
    { name: "item links", pattern: /href=\{`\/database\/items\//,
      bites: ["href={`/database/items/${r.itemId}`}"],
      spares: ["canonical: `/database/items/${params.id}`", 'href="/database/drops"'],
      allow: ["components/ItemLink.tsx"] }
    ```
  - **`gap-rendering.test.tsx`:**
    - unreadable storage: replace `not.toMatch(/>0<\/div>/)` with `not.toMatch(/>0<\/dd>/)`, and add `toContain('<dd class="mt-1 text-xl text-muted">unrecorded</dd>')`;
    - an empty readable corpus: the database page has four `<dt` and contains `<dd class="mt-1 font-mono text-3xl tabular-nums text-fg">0</dd>`, which proves the `<dd>` check above can catch a zero;
    - both pages open with the `[Database]` label;
    - a new case where three installs see item 9 from NPC 77. The drops page contains `<a href="/database/items/9" class="text-q-common hover:underline underline-offset-4"><span aria-hidden="true">[</span>Item #9<span aria-hidden="true">]</span></a>`, so the existing `not.toContain("Item #9")` still targets real markup.
  - **`entity-pages.test.tsx`**, on that three-install corpus:
    - `/database/items/9`: the `<h1` sits inside the frame (`/class="bg-tooltip[^"]*"[\s\S]*?<h1/`), the title is `text-q-common`, and `observed in play` shows;
    - `/database/npcs/77`: the dropped item is an item link, and the frame wraps the title;
    - `/database/quests/1` and `/database/vendors/1` with storage unreachable: `STORAGE_UNREACHABLE` sits inside `data-state="unavailable"`, and there is no `observed in play`.
- [ ] **Step 2: Run** `npm test -- src/app/database src/design/guard.test.ts`. Expected: FAIL. The item-links scan lists:
  - `src/app/database/drops/page.tsx:63`
  - `src/app/database/npcs/[id]/page.tsx:60`
  - `src/app/database/quests/[id]/page.tsx:60`
  - `src/app/database/vendors/[id]/page.tsx:67`
- [ ] **Step 3: Implement.**
  - **Eyebrows:** every one becomes a `SectionLabel` (Task 3 table).
  - **`/database`:**
    - the four counts become a `<dl className="grid grid-cols-2 md:grid-cols-4 gap-4">` of `StatBlock`s, with `value="unrecorded" quiet` when storage is unreachable;
    - labels now sit above the numbers, as on `/lore/coverage`;
    - the section cards stay as they are.
  - **Item, NPC, quest and vendor pages:**
    - the `h1` and the line under it move into a `TooltipFrame`;
    - when storage is reachable, `<EvidenceTag kind="observed" />` follows them in the frame;
    - the item title is `text-q-common` (Decision 2).
  - **Item mentions** use `ItemLink` with today's label text: `Item #{id}` on the drops page, `Item {id}` on the NPC, quest and vendor pages. NPC links stay accent text links.
  - **States:** the words don't change.
    - `STORAGE_UNREACHABLE` lines become `State kind="unavailable"`;
    - "No public frequencies yet…", "Goods unrecorded…" and "No agreed rewards." become `empty`;
    - "No agreed name yet…", "No agreed position…" and "Loot observations unrecorded…" become `waiting`.
  - **Tables:** number cells in the drops, item and vendor tables add `font-mono` beside `tabular-nums`.
- [ ] **Step 4: Run** `npm test && npm run lint && npm run build`. Expected: all pass. Commit `feat(web): database pages use the identity's components`.

### Task 6: Lore pages

**Files:**
- Modify, under `web/src/app/lore/`: `page.tsx`, `[slug]/page.tsx`, `browse/[type]/page.tsx`, `coverage/page.tsx`, and the `page.test.tsx` beside each

- [ ] **Step 1: Write the failing tests.**
  - **`[slug]/page.test.tsx`:**
    - replace `toContain("Lore archive · Warcraft Wiki, 2023 dump")` with a match for the `[Lore]` bracket markup followed by `Warcraft Wiki, 2023 dump`, and do the same for the curated row (`curated · forever`);
    - Thrall (a typed NPC) has its `<h1` inside the frame; `2-stub` (untyped) contains no `bg-tooltip`;
    - Thrall shows `wiki 2023`; the curated row doesn't;
    - the source is a citation: `toMatch(/<a href="https:\/\/warcraft\.wiki\.gg\/wiki\/Thrall" rel="noopener" class="inline-flex[^"]*rounded-full/)`, and `retrieved 2023-11-13` still shows;
    - the unavailable page has `UNAVAILABLE_COPY` inside `data-state="unavailable"`.
  - **`browse/[type]/page.test.tsx`:** the same eyebrow replacement; the empty-filter case has `No pages match these filters.` inside `data-state="empty"`.
  - **`coverage/page.test.tsx`:**
    - the four figures are `<dt>`/`<dd>` pairs, and no `<dd>` is `text-accent`;
    - the existing `/Indexable pages[\s\S]{0,120}>28</` and `/Damaged pages[\s\S]{0,120}>1</` still match, because a `StatBlock` keeps label and number that close;
    - in the untyped release, `not measured` is quiet (`text-muted`).
  - **`lore/page.test.tsx`:** the landing page opens with `[Lore]`; the unavailable case has `UNAVAILABLE_COPY` inside `data-state="unavailable"`.
- [ ] **Step 2: Run** `npm test -- src/app/lore`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Eyebrows:** `SectionLabel` (Task 3 table). `label()` in `[slug]/page.tsx` returns only the part after `[Lore]`.
  - **Articles (`[slug]`):**
    - when `page.type` is `npc`, `item`, `quest` or `zone`, the `h1` and the revision line sit in a `TooltipFrame`; the type and facet chips stay below it;
    - wiki pages add `<EvidenceTag kind="wiki-2023" />`;
    - the source link becomes `<Citation href={page.sourceUrl}>{page.sourceUrl}</Citation>`; the " · retrieved … · licence" text after it doesn't change.
  - **Coverage:** the four figures become `StatBlock`s inside the existing `<dl>`. An unmeasured damage count is `value="not measured" quiet`.
  - **States:**
    - `UNAVAILABLE_COPY` lines on all four pages become `State kind="unavailable"`;
    - "No pages match these filters." and "No more results." become `empty`.
- [ ] **Step 4: Run** `npm test && npm run lint && npm run build`. Expected: all pass. Commit `feat(web): lore pages use the identity's components`.

### Task 7: Addons pages, and the leaderboard if it has merged

**Files:**
- Modify: `web/src/app/addons/polestar/page.tsx`, `polestar/packs/page.tsx`, `polestar/wanted/page.tsx`, `web/src/app/addons/addons.test.tsx`

- [ ] **Step 1: Write the failing tests** in `addons.test.tsx`.
  - The Polestar, packs and wanted pages open with the `[Addons]` label. On packs and wanted, the label keeps `href="/addons/polestar"`.
  - On the wanted page, each source in `PACK_IDEAS` is a citation: `` toContain(`<a href="${idea.source.url}" rel="noopener" class="inline-flex`) ``. Compare with `&` written as `&amp;` if a URL has one.
  - With GitHub down, "Live details from GitHub are unavailable right now" sits inside `data-state="unavailable"`.
- [ ] **Step 2: Run** `npm test -- src/app/addons`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Eyebrows become `SectionLabel`, and each idea's source link becomes a `Citation`.
  - The two "Live details from GitHub are unavailable right now" lines become `State kind="unavailable"`, with their links kept.
  - **Leaderboard (Decision 5).** If `/addons/popular` is on `main`:
    - its rank is `font-mono text-3xl tabular-nums text-muted`;
    - the name is `text-fg`;
    - share and install count are `font-mono tabular-nums text-fg-2`;
    - rows are divided by `border-line`;
    - that page's own test checks these classes.

    If it isn't on `main`, skip this and say so in the PR body.
- [ ] **Step 4: Run** `npm test && npm run lint && npm run build`. Expected: all pass. Commit `feat(web): addons pages use the identity's components`.

### Task 8: Evidence and PR

- [ ] **Step 1: Rebase** onto `main` and list the open PRs again. Resolve conflicts in eyebrows or state lines by keeping the other PR's words inside the new components.
- [ ] **Step 2: Run the checks.**
  - From the repo root: `python scripts/check_internal_paths.py`.
  - In `web/`: `npm test && npm run lint && npm run build && npx tsc --noEmit`.
  - Expected: all pass.
- [ ] **Step 3: Take the screenshots** the way R1 did:
  - **Setup:**
    - a production build (`next start`) with the sample lore release (`npm run sample-release`; see `web/README.md`);
    - Playwright's `prefers-color-scheme` emulation;
    - the scrollbar hidden, so pages are exactly 390 or 1440 CSS px wide.
  - **Pages,** each in dark and light at 390 and 1440 px:
    - `/database`, `/database/drops`, `/database/items/2589` and one NPC page;
    - `/lore`, the sample release's lore article and `/lore/coverage`;
    - `/addons/polestar/wanted`.
  - **Extra shots:**
    - keyboard focus on an item link and on a citation chip, in dark and light;
    - one framed page in forced colours, with both frame borders visible.
  - **Check each one:**
    - a frame looks the same in both modes;
    - numbers are not green;
    - no gold, glow, emoji or shadows.
- [ ] **Step 4: Open the PR.**
  - Push `feat/visual-identity-r2` and open the PR against `main`.
  - The body has:
    - a summary of the components;
    - Decisions 1 to 6 as taken;
    - anything that differs from this plan;
    - the test, lint and build results;
    - the Vercel preview link.
  - Screenshots go to Carlos directly and are not committed. Carlos merges.

## Later (outline only)

- **Item quality:**
  - `itemFactsFromRecords` keeps an agreed quality from `item_seen` records, published when three installs agree, as names are;
  - item pages and links pass it to `ItemLink`;
  - hover and focus previews follow.
- **Spoiler gate**, with the first published game-file diff (#14):
  - a closed `<details>` is recommended (Decision 4), and it gives `EvidenceTag kind="game-files"` its first use;
  - if a blur is chosen instead, the exception stays narrow. An allowance on the "glow, shadow and blur" rule names one file and one token (`components/SpoilerGate.tsx`, `blur-sm`). The scanner removes that token from that file's lines before matching, and a test checks that the token appears exactly once there.
- **Remaining eyebrows** (tools, guilds, upload): `SectionLabel` once #15 has merged, so `/tools/auctions` isn't edited twice.
- **R3 and R4** as the spec describes them.
