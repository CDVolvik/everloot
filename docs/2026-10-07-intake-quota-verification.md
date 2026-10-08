# Shared intake quotas — 2026-10-07

The old module-local install counter reset per Vercel process. Commit `fe67af2` replaces production admission with atomic counters in the existing Supabase database, without a new hosting service or paid upgrade. Carlos requires free services; Fly provisioning and the earlier Supabase Pro upgrade remain held.

## Behavior

- Before reading the body or looking up grants: 200 requests per platform IP and 10,000 globally per hour. Invalid requests count toward this admission budget.
- After validation and named-sharing authorization: 20 submissions per accepted install per hour, before storage.
- Each quota uses a fixed one-hour bucket starting on its first admission. A denied stage increments neither of its counters. The earlier request stage still counts a request denied later by the install stage.
- Supabase's function locks global before IP and checks global exhaustion before creating another IP bucket. Install checks serialize on their own bucket. Budgets are fixed in SQL, not supplied by clients.
- `x-vercel-forwarded-for` is trusted only in the Vercel environment; missing/invalid platform addresses fail closed. Equivalent IPv6 spellings normalize. Requests cannot choose their install bucket until canonical records pass validation.
- IP/install keys are namespaced HMACs using the existing service credential. No raw IP, raw install identity or credential is saved in the quota table. Credential rotation changes these hashes and resets those identity buckets.
- RLS is enabled. PUBLIC/anon/authenticated have no table access or RPC execution. Only service_role executes admission and reads/deletes counters. Expired counters older than a day are pruned by the existing authenticated ten-minute snapshot cron.
- Denial returns 429 and Retry-After; unavailable admission returns 503, preserving the file for retry. Missing production configuration cannot use local counters. Failed persistence can consume install allowance.

## Verification and deployment

- Failing route regressions first demonstrated absent shared denial, absent pre-body rejection and unsafe admission fallback. All 107 web tests now pass; production build/lint/type validation passes with the three preexisting lint warnings.
- `web/scripts/intake-quota.integration.mjs` runs only against a dedicated disposable loopback database. PostgreSQL 16 verified idempotent migration, Supabase-style default-grant revocation/RLS, browser denial, service execution and lack of direct insertion, 40 concurrent install calls admitting exactly 20, 220 IP calls admitting exactly 200, atomic global exhaustion, expiry reset and pruning races. The owned test container was stopped and removed.
- Independent source review found no blocking findings. It did not establish production throughput or contributor independence.
- Private maintenance deployment `dpl_eUTtupo6RnvxJ8LMMMHZczTwpxp1` / `https://everloot-hm5b5vthd-r21digital.vercel.app` applied only `20261007220000_intake_quotas.sql` and verified RLS, revoked browser permissions and service grants. It did not repeat fixture cleanup or rebuild the corpus. Credentials stayed inside Vercel; no admin HTTP endpoint was added.
- Normal deployment `dpl_3yHMJpj3beSb5ZV5KC1kJhJ7Zhri` / `https://everloot-2q3sfootf-r21digital.vercel.app` was promoted, with the existing `*/10` cron verified through deployment metadata. The new prune path has local execution evidence; scheduled production pruning has not yet been measured.
- GitHub main was found still at `7fd2daf`, despite prior handoff claims. Atomic push advanced main and recovery to `fe67af2`. Automatic main deployment `dpl_4ThhXjHzduzQ8eSsiqJePjLMEPCt` / `https://everloot-b4hoihf8b-r21digital.vercel.app` is Ready and aliased to everloot.app.
- Staged and live invalid envelopes return 422 after shared admission. A live request with forged platform/proxy IP headers also reaches validation, confirming Vercel replaces them. No upload/index/public test records were written. Live corpus is reachable with zero uploads/records, auth/me is anonymous 200, unconfigured Battle.net is 503 and unauthorized cron is 401. The upload page renders sharing choices without console errors.

## Remaining work

F04 is only partially addressed: install IDs are client-controlled, and independent contributors remain unproven. Denied requests still invoke Supabase and lock the global counter; this limits admitted work, not all infrastructure consumption. The fixed buckets permit bursts around reset boundaries. Quota failures and write failures can require later retries. No load/throughput improvement is claimed.

Public MCP hosting is still open under the free-only constraint. [Render's free web services](https://render.com/docs/free) are a testing/hobby candidate, but sleep after 15 minutes and can take about a minute to restart; the provider advises against production use. The immutable read-only SQLite image avoids reliance on writable persistent disk, but cold starts/client timeouts, account access and usage caps need verification. No Render service or paid resource was created. Fresh Battle.net credential storage location, real officer/owner trials and the other full-launch assessment tracks remain pending.
