# Blue tracker: new posts live within 10 to 15 minutes (proposal, not built)

Status: proposal for Carlos, 2026-10-20. Nothing here is built.

## The problem

`changes.yml` is scheduled every 30 minutes, but GitHub runs scheduled workflows late and drops runs
under load; in practice it fires every 3 to 5 hours. Each run that finds something then needs a bot pull
request, CI on it, a merge and a full Vercel deploy before a visitor sees the post. A blue post is worth
most in its first hour, so today it usually arrives too late to win the search traffic.

The reader itself is not the bottleneck. Measured on 2026-10-20 against the live forums, a run costs 9
requests after a 30-minute gap and 14 after a 4-hour gap (robots.txt and one topic-list page per category
on both forums, plus the few changed topics with a staff post, plus Bluesky), well inside its 40-request
budget. A 10-minute run would cost about the same as the 30-minute one.

## Options

| | A. Vercel cron writes to R2 | B. Vercel cron writes to Supabase | C. Cloudflare Worker cron |
|---|---|---|---|
| How | New route `/api/cron/blue` every 10 min runs the same `ingestBluePosts`, keeps posts and fetch state as two JSON objects in R2, then `revalidateTag("blue")` | Same route; posts in a `blue_posts` table, state in a row | A Worker on a 10-min cron trigger runs the reader and writes to R2; the site reads R2 |
| Latency | 10 min + page revalidation (seconds) | Same | Same |
| New code | One route, one small R2 read/write module, the page reads R2 with a bundled-file fallback | Route, migration, queries; schema to keep in step with the JSON | A second runtime and deploy pipeline for code that lives in `kb/` |
| Cost | Vercel already runs `/api/cron/snapshot` every 10 min, so the plan allows the schedule; +144 invocations a day of 15 to 30 s each (mostly the 1.5 s pauses). R2: about 300 writes a day, inside the free tier | About the same; one more table on the existing project | Workers cron is free up to 100k requests a day; separate account setup |
| Keys and settings | None new: `R2_*` and `CRON_SECRET` already exist. One line in `web/vercel.json` | None new (`SUPABASE_*` exist) plus a migration applied by hand in the dashboard | `CLOUDFLARE_API_TOKEN`, a Worker secret set for R2, `wrangler.toml` |
| Risk | Pacing (1.5 s between requests) makes a run 15 to 60 s; `maxDuration` 300 covers it. Blizzard sees requests from Vercel's IPs instead of GitHub's | DDL is applied by hand today, so a missed migration breaks the page | Two copies of deploy config; harder to test locally |

## Recommendation: A

It reuses everything already in place: the snapshot cron's auth pattern, the R2 client, the bucket, the
10-minute schedule. The reader code does not change; only where it reads and writes its store does.

1. `web/src/app/api/cron/blue/route.ts`: check `CRON_SECRET`, load `changes/blue-posts.json` and
   `changes/blue-fetch-state.json` from R2 (first run: seed from the bundled file), run `ingestBluePosts`
   with `--min-minutes 8`, write both back, `revalidateTag("blue")` when anything was added.
2. `web/src/lib/changes.ts`: read posts from R2 with `fetch(..., { next: { tags: ["blue"], revalidate: 600 } })`,
   falling back to the bundled `kb/changes/blue-posts.json` when R2 is not configured or fails. The page,
   RSS, MCP and sitemap keep calling `loadTimeline()`.
3. `vercel.json`: `{ "path": "/api/cron/blue", "schedule": "*/10 * * * *" }`.
4. Keep `changes.yml`, but only for builds and for a daily copy of the R2 posts file into git (history,
   bulk export, review). Its blue step stops polling, so the forums see one reader, not two.

What Carlos would do: approve, then nothing new in Vercel settings unless the blue data should live in its
own bucket (`BLUE_BUCKET`, optional). Check after the first day that the function logs show 10 to 20 forum
requests per run and no 429.

## Not recommended

- A GitHub schedule every 5 minutes: GitHub still delays it, and each change still needs a deploy.
- Webhooks or the forum's `/g/` group pages: robots.txt disallows `/g/`, and Blizzard offers no webhook.
- Polling every minute: the forum rules we follow (research note 2026-10-18) assume a small, slow reader.
