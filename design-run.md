# Everloot design run — AI-creator max-out (r21-design)

**Mode:** max-out / overhaul on an unlaunched build (no live URLs, tags or rankings to protect).
**Reference (checkpoint A — Carlos-picked 2026-09-29):** leonardo.ai via Mobbin — dark creator-first.
Delegated pick (5th such delegation): agent proceeds against his stated criteria.
**Composition (checkpoint B):** single overhaul pass, judged in-browser with screenshots (hasty brief).

## Design Read

> "Reading this as: a pre-launch product home + tool hubs for WoW: Forever players (INFERRED —
> beta players + launch-week searchers), AI-creator aesthetic language (CONFIRMED — Carlos 2026-09-30:
> 'as far as AI look alike', Leonardo reference 2026-09-29), leaning toward Leonardo-translated dark
> (CONFIRMED — foundation spec 2026-09-29), at variance/motion/density 7/7/4."

**Dials:** variance 7 · motion 7 · density 4.
**The one thing they remember:** "Every drop. Every guild. Every reset." — hero keeps the most room.

## Owned exception to anti-defaults (2026-09-30, Carlos brief)

Dark mesh + glow + gradient accents are the ASK, not the reflex — so they ship, with two bindings:
gold-dominant (loot-gold, brand), violet secondary only with data/progression meaning (spec'd, not
generic AI-purple). No gradient text, no purple-everything, no stock "abstract tech" hero image
(hero visual waits on real beta screenshots). Revisit if it ever reads generic per 9/09 taste entry.

## Stages

- [x] 0 · Intake (read: repo, foundation spec, taste-log, live localhost shots)
- [x] 1 · References (Leonardo, Carlos-picked)
- [x] 2 · Compose/Dials (single overhaul, browser-judged)
- [x] 3 · Build (aurora hero, ticker, reveals, card glow, reduced-motion, opaque text surfaces)
- [x] 4 · Gates (structure_probe PASS; run_floor §1: 5 fails, all banner-overlay — owned exception below; §4 fonts clear)
- [x] 5 · Judge (in-browser shots: aurora + ticker + reveals fire; gold-dominant, violet secondary; movement felt in 5s)
- [ ] 6 · Ship (commit, decision log appended to foundation spec)

## Owned exception — run_floor §1 (2026-09-30)

5 failing nodes (worst 1.19:1), identical across 3 runs and 3 widths. Cause: the fixed consent
banner (legally required for AdSense approval) rides every scroll step, and its gold Accept button
lands inside 5 content boxes during stepped screenshots. Evidence it is the banner, not the page:
all 5 pairs are gold-involved; the other 65–70 nodes pass with the banner present; live computed
styles verify opaque dark surfaces under every failing line (pills `bg-parchment-950` solid, cards
solid, header/banner solid — translucency removed this run for exactly this reason). Unobstructed
rendering passes; no further surface change would move the number short of removing consent.
Revisit if the banner design changes.
