# Everloot design foundation — Leonardo-translated dark, built to grow (2026-09-29)

**Status:** approved direction (Carlos, 2026-09-29). Style source: leonardo.ai (dark creator-first)
translated into a World of Warcraft identity. This is the foundation the site keeps improving on:
tools and community surfaces get added, the tokens and patterns below do not change without a new decision.
**Brand:** Everloot (replaces WoWVault everywhere; repo rename + `everloot.app` still pending, Carlos).

## What we take from Leonardo (and what we leave)

Take: dark canvas, one bold hero line, visuals carrying the page, a stat strip with real numbers,
card grids for tools, a tutorials/community block, generous whitespace, one primary CTA repeated.
Leave: the AI-gallery excess (our asset is the game itself, not generated art), pastel gradients,
light sections. Everloot is dark end to end — a database players keep open next to the game at night.

## Tokens (v1, locked)

- **Canvas:** abyss `#0B0B12`; raised surfaces `#14141D`; borders `rgba(255,255,255,0.08)`.
- **Accent:** loot-gold `#F2B632` (legendary quality, CTAs, active states). Never yellow-washed sections.
- **Secondary:** arcane violet `#8B5CF6` (guild score, progression, data-viz highlights).
- **Text:** bone `#F4F1EA` headings, `#A7A3B8` body, `#6E6A80` muted.
- **Quality colors** (items, loot, scores) follow the in-game language players already read:
  poor grey, common white, uncommon green `#1EFF00`-tuned for dark bg, rare blue, epic violet, legendary gold.
- **Type:** tight grotesk headlines (tracking −0.02em), clean sans body. Free/OFL licences only —
  no paid faces without a licence check (fleet font-licence gate applies).
- **Shape:** 14px card radius, 1px borders, soft shadows only on hover. Motion: fast, subtle
  (150–250ms ease-out); nothing that delays a lookup.
- **Imagery rule:** our own in-game screenshots and original graphics only. No stock, no AI fantasy
  art. Screenshots fall under Blizzard fan content; design assets are ours (CC BY-SA data, MIT code).

## Layout patterns (every page is one of these)

1. **Hero:** one line + one subline + one CTA + one visual (screenshot, not decoration). Home, tool hubs.
2. **Stat strip:** 3–4 live numbers (items tracked · guilds · drop reports · contributions). Proof, not marketing.
3. **Tool card grid:** uniform cards — icon, name, one-line job, entry CTA. Home, `/tools`, guides index.
4. **Reference page:** title + facts box (stats, source, drop rate + kill count) + provenance footer. Items, NPCs, quests, guilds.
5. **Guide page:** original write-up grounded in our data, with data widgets inline (drop tables, spawn maps). Never bare text.
6. **Policy pages** (`/about`, `/privacy`, upload consent): plain, fast, complete — the AdSense approval kit.

## AdSense structure (income from day one, farm never)

- Slots planned into the patterns, not bolted on: one in-feed unit in card grids, one in-article
  unit on reference/guide pages, anchor on mobile only. No pop-ups, no interstitials, no ad within
  300px of a CTA button.
- Approval path: domain → policy pages + consent mode → 2–3 weeks of real tool traffic → apply.
  `ads.txt`, sitemap, robots, privacy + cookie consent already exist in `web/` (GoldGoblin kit, rebrand only).
- Guardrail (fleet rule): tools over mass pages. No auto-generated thin pages at any volume —
  scaled-content-abuse kills the domain faster than it pays.

## Site IA — phased, sharp at every step

**Launch 11/04 (sharp, thin):** home (hero + stats + tool cards) · `/tools` (gold-per-hour rebranded +
  ask/search) · reference search over lore KB · guild pages (progression + roster, officer-published) ·
  `/upload` (drag-and-drop + consent preview) · about/privacy. Every page complete, no stubs indexed.
**Next (data fills in):** item/NPC/quest/drop pages from collector data · profession hubs · farming routes
  from spawn collection · guides with live data widgets.
**Later (community):** news/dev tracker (aggregator, sourced links) · forums — only with a moderation
  plan and an owner; until then the Discord + comment rails carry community. Forums are the most
  expensive surface per user and ship last on purpose.
**Accounts:** Battle.net OAuth when the namespace story allows; until then install-id + guild claim
  via officer upload. One account, no separate forum identity later — the same login everywhere.

## Growth loop (the structure that profits)

Each tool ships three things: the tool itself, the pages it generates (routes → zone pages,
calculator → share pages), and the ad inventory those pages carry. New tools reuse the six patterns,
so each addition is days, not a redesign. Metrics that matter: tool uses, return visits, pages per
session, guild claims — not page count.

## Immediate build list (web/)

- [ ] Rebrand scaffold GoldGoblin → Everloot (`src/data/tools.ts`, metadata, about/privacy, env `everloot.app`).
- [ ] Apply tokens to `globals.css` (canvas, gold, violet, quality colors, type scale).
- [ ] Rebuild home as hero + stat strip (wired to real counts later; static honest numbers first) + tool card grid.
- [ ] Keep gold-per-hour working; profession-planner + completionist stay unindexed stubs until built.
- [ ] Upload page + intake API contract (Track 2) lands here, styled as pattern 1 + consent (pattern 6).

→ Tracks: collector + intake feed the numbers; the site never shows Blizzard-API bytes on public pages.

## Decision log (append-only)

- 2026-09-29 · system · KEPT · Leonardo-translated dark (abyss + loot-gold + arcane violet), six page patterns, phased IA — Carlos picked the reference.
- 2026-09-30 · motion · KEPT · r21-design max-out, dials 7/7/4: aurora hero, ticker, scroll reveals, card glow, CTA settle. Owned exception to anti-defaults (mesh/glow are the brief, gold-dominant). Run: `design-run.md`.
- 2026-09-30 · surfaces · KEPT · all text-bearing surfaces opaque (pills/cards/header/banner solid) after run_floor §1 flagged translucent gold overlaps. 5 residual fails = consent-banner overlay, recorded in `design-run.md`, not page contrast.
