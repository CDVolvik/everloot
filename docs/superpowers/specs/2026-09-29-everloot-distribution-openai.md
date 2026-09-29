# Everloot distribution via ChatGPT apps directory + subscription sign-in (2026-09-29)

**Trigger:** OpenAI's ChatGPT apps program (Apps SDK, built on MCP) + DevDay 2026-09-29.
**Decision (Carlos, loop):** Everloot rides both rails — the apps directory for distribution, and
users' own AI subscriptions as companion login. This **promotes** the subscription sign-in adapters
to core scope (they were first in the old drop order — that order is inverted as of this doc).

## Verified facts (not rumors)

- ChatGPT apps are built with the Apps SDK, which is MCP under the hood. A working MCP server is
  literally the entry ticket: build it once, run it in dev mode now, submit to the directory when
  submissions open. Directory + monetization were "later this year" per OpenAI — DevDay (today) is
  the likely venue for dates.
- Shared sign-in / entitlement integration is an established OpenAI pattern (shipped for data
  providers in ChatGPT for Financial Services, 2026-09-10): the provider recognizes the user through
  their ChatGPT sign-in and unlocks what they're entitled to. Same shape works for ours: sign in
  with ChatGPT/Claude, companion answers draw on that subscription, API keys stay as fallback.
- What is NOT confirmed: directory opening date, revenue terms, and whether consumer-subscription
  entitlement extends to third-party apps generally. Watch DevDay output today; nothing in this plan
  depends on it.

## Build: wow-knowledge MCP server (Part 2, starts now)

New package next to `kb/`, read-only over the publishable snapshot:

| Tool | Backed by (already built 9/29) |
|---|---|
| `search_knowledge(query, kind?, version?, limit?)` | `search()` — exact-title first, stopwords stripped |
| `get_entity(id)` | `getEntity()` — full row for page rendering |
| `get_by_name(name, kind?)` | `getByName()` — disambiguation |

- Transports: stdio first (Claude + ChatGPT dev mode today), HTTP second (hosted app + directory).
- Rules inherited: every hit carries provenance + licence; publishable-only rows (same filter as
  `snapshot`); no Blizzard-API bytes; no model training.
- Tests: tool-level fixtures in `:memory:`, no dump required.

## Companion subscription adapters (promoted to core)

Sign in with ChatGPT / Claude subscriptions (OAuth/entitlement per provider docs as they publish;
DevDay may update this), API keys as fallback, failure-only fallback across the 4 adapters preserved.
Fits the 9/27 companion shape — no redesign, just reprioritized.

## Order of battle

1. MCP server, stdio, local (this week — unblocked, no credentials needed).
2. Directory submission the day submissions open (watch DevDay news today).
3. Subscription adapters in the companion (Track 4), API keys first so nothing waits on OAuth docs.
4. Sponsored discovery later: ChatGPT Ads / Sponsored Agents are advertiser products ($1B run rate,
   self-serve live) — a paid-acquisition lane for launch week, not launch scope. Agency (R21) can run
   it; the product doesn't wait on it.
