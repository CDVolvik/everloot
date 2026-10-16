# Everloot service and data map

**Checked:** 2026-10-05. Current implementation is distinguished from proposed setup below. This records preparation, not provisioning or a new stack decision.

## Current services

| Responsibility | Current home | Verified state | Boundary |
|---|---|---|---|
| Public website and intake/waitlist API | Next.js `web/`, Vercel `everloot-web`, everloot.app | Public routes/read API answer; earlier production persistence evidence in status | `main` push = production; changes need preview/review |
| Raw player uploads | R2 `everloot-uploads`, `uploads/<date>/<uuid>.json` | Storage implementation and prior end-to-end evidence; not rewritten in this closeout | Raw/named data must not become an unrestricted public endpoint |
| Upload index and waitlist | Supabase `everloot` | Migration enables RLS; web uses server key | Waitlist and index are private; no browser service-role key |
| Public web corpus | R2 `snapshots/corpus.json`, cron every 10 minutes | Live API reads 1 upload/1 record; unauthorized cron request rejected | Accepted-row filtering, idempotency, freshness and named-publication controls remain open |
| Imported/reference KB | Local SQLite `kb/data/wowvault-kb.sqlite` | 257,111 total rows, validation passes | 2023 lore and curated facts are not unobserved Forever mechanics |
| Publishable KB build | Dated SQLite snapshot + manifest under `kb/data/release/` | 10/05 artifact built; independent SHA-256 matches | Export allowlist excludes Blizzard API cache; attribution/licence retained |
| MCP tools | Node `kb/src/mcp-server.ts`, HTTP handler on loopback | 13 tools authenticated locally; public HTTPS unmounted | Gameplay reader is still local `EVERLOOT_UPLOADS`; not cloud-connected |
| Collector | `addon/`, SavedVariables | Code exists, no in-client proof in this assessment | Runtime accuracy, caps, event identity, officer authority and sharing are launch gates |
| In-game answer/desktop bridge | Required launch track | No completed companion/uploader release verified | File bridge; answers do not play the character |

## Target organization — recommendation to implement

1. **Keep web on Vercel and current R2/Supabase storage.** No migration or second independent fact store is needed for server preparation.
2. **Separate the public read model from raw/private data.** Ingest accepted canonical records; retain raw audit material privately if required. Derive public facts only after authority, corroboration and opt-out checks. Private named views and waitlist stay behind their own authorization boundary.
3. **A supervised Node MCP service on a verified persistent host.** Run a pinned build of the same engines as the web, a filtered SQLite KB snapshot and a shared sanitized gameplay reader. Bind Node to loopback behind HTTPS termination; use a scoped service identity. Candidate hostname `mcp.everloot.app` is a proposal, not configured DNS.
4. **One provenance/freshness vocabulary.** Record source/version/date, corpus generation, build/hash, coverage and unreachable/stale status in both channels. Web and MCP must answer the same question from the same trusted dataset.
5. **Separate environments and credentials.** Preview/staging fixtures cannot contaminate production corpus. MCP should read only public outputs and must not get the web's unrestricted R2 write or Supabase service-role access to waitlist/raw named data.
6. **Restart and recovery are part of setup.** Supervision, request byte/time/concurrency limits, validated configuration, logs excluding secrets/names, monitoring of snapshot age and a tested restore. Select hosting only after current native-library compatibility, capacity, cost and auth requirements are checked.

## Data paths

```text
Addon SavedVariables
  -> user preview + explicit sharing
  -> bounded intake + canonical schema + event deduplication
  -> private raw/index storage
  -> authorized/corroborated/suppressed public facts
  -> shared public reader -> web views and MCP tools

Approved archive / original curated entries
  -> explicit source SQLite -> validation
  -> allowlisted filtered snapshot + SHA-256 manifest
  -> hosted KB search with sources, licence, date and version

User's Blizzard API cache -> local user context only
Waitlist / named private data -> authorized private path only
```

Arrows after validation/authority describe the target controls; current ingestion still stores original payloads and permits placeholder claims. Do not present this diagram as a completed security design.

## Server launch gate

- F01–F04/F13/F14/F20 repaired or explicitly gated: accepted-only facts, replay safety, publication authority, abuse controls, privacy/freshness and correct fail-closed DB selection.
- Public snapshot's expected source counts/hash validated; no empty DB fallback or private-source leakage.
- Actual target-client HTTPS/auth connection succeeds; generic local bearer tests do not establish ChatGPT directory or subscription compatibility.
- Shared public gameplay reader agrees with the web on representative real records. Unconnected uploads produce an explicit unavailable state.
- Restart, monitoring, restore and removal/suppression exercise succeeds.
- Credentials, signing/companion/uploader and distribution remain their own checklist items.

These acceptance checks came from the 2026-10-05 assessment.
