# Public MCP hosting — options on infrastructure R21 already has (2026-10-09)

Decision for Carlos. Nothing here is provisioned. Prices and limits are from the official pages
linked below, read on 2026-10-09; recheck them on the day you choose.

## What has to be hosted

- The `everloot-knowledge` MCP server (`kb/src/mcp-http-main.ts`): stateless, bearer-token HTTP,
  13 tools. Measured locally: about 72 MiB steady, non-root, 512 MiB / 0.5 CPU container limit.
- The approved knowledge release: one 338,112,512-byte SQLite file read through `better-sqlite3`
  (a native module), plus its manifest. Read-only.
- Gameplay tools read the web's public corpus over HTTP today, and refuse a body over 2 MB
  (about 11,000 synthetic records; see the recovery runbook). #14 narrows each request by kind,
  but item and NPC answers still carry the loot-heavy part.

The rule from 2026-10-09: use what R21 already pays for or manages, keep to the Vercel + AWS
stack, size to the minimum, and never run this beside a client's production service.

## Options

### A. A route on the existing `everloot-web` Vercel project (recommended to trial first)

Vercel's large functions (beta) take uncompressed bundles up to 5 GB, so the 338 MB release fits.
The standard limit is 250 MB. They need fluid compute with Active CPU, which new projects have by
default. Max memory on Pro is 4 GB; max duration 800 s; request and response bodies 4.5 MB.

- **Cost:** billed against the existing Pro usage credit. iad1 rates: Active CPU $0.128 per hour,
  Provisioned Memory $0.0106 per GB-hour, invocations $0.60 per million. Example, not a forecast:
  10,000 calls a month at 0.2 s CPU and 1 s alive on 1 GB comes to about $0.07 + $0.03 + $0.01.
- **Big advantage:** the gameplay tools could call the same `uploadStore.loadCorpus()` in process
  instead of fetching `/api/corpus/public`. The 2 MB HTTP cap and its self-fetch disappear for this
  option.
- **Risks to measure before relying on it:** large functions are beta; cold start with a 338 MB
  bundle is unmeasured; `better-sqlite3` must be traced into the Next.js function (Next needs
  `outputFileTracingIncludes`, not `includeFiles`); a public MCP route shares the production
  domain and deploy pipeline with the site. Bearer auth and quotas apply as today.
- **Work:** an `/api/mcp` route that mounts the existing server, file tracing for the release and
  the native module, a preview deployment, then a real MCP client against the preview. No new
  account.

### B. AWS Lambda container image with a function URL (fallback)

Container images can be 10 GB uncompressed; memory 128 MB to 10,240 MB; timeout 900 s; 6 MB
synchronous responses. The existing Dockerfile is close to what Lambda needs, with a web adapter.

- **Cost:** free tier of 1 million requests and 400,000 GB-seconds a month; then $0.20 per million
  requests and $0.0000166667 per GB-second (x86, US East). At 512 MB and 0.3 s per call, 10,000
  calls are about 1,500 GB-seconds, inside the free tier. Image storage in ECR is billed separately
  and was not priced here.
- **Trade-offs:** a second deploy path (ECR push, function update) and the gameplay tools keep the
  HTTP corpus read and its cap. Uses the existing AWS account; confirm which account and region
  before creating anything.

### C. Oracle Always Free (not recommended now)

The Always Free Ampere A1 allowance is now 2 OCPUs and 12 GB of memory in total per tenancy, and an
instance that stays under 20% CPU, network and memory (95th percentile over 7 days) can be
reclaimed. The existing Oracle VM runs the Zemi-Aku hackathon entry through Oct 30; adding Everloot
there mixes a launch service with a contest service, and an idle beta MCP invites reclamation.

### D. Render free (the earlier draft, now behind A and B)

`kb/render.yaml` pins a published image digest. It is a new vendor outside the Vercel + AWS stack,
sleeps after 15 idle minutes and takes about a minute to wake, which may exceed an AI client's
connection timeout. Keep it only if A and B both fail.

## Recommendation

Trial A on a preview deployment: measure cold start, memory and one real MCP client session. If
the bundle or cold start fails, go to B. Either way, the ChatGPT directory and subscription
sign-in remain separate work.

Owner steps: choose A or B; for B, name the AWS account and region; approve any spend above the
included credit before launch traffic.

## Update 2026-10-10: A chosen, trialed and merged

Carlos chose A. The preview trial passed (#17) and the route is merged. In production `/mcp`
answers 503 until the release is in the build. Steps to turn it on, all Carlos's:

1. Upload the release once, create-only, with the production R2 variables in the environment:
   `cd web && node scripts/upload-release.mjs ../kb/data/release/2026-10-05-everloot-public.sqlite`
   (copy it out of `kb/data/release/` first if WAL sidecars sit next to it; the script refuses a
   file whose hash does not match its manifest).
2. In Vercel Production, set `EVERLOOT_KB_RELEASE_KEY=knowledge/2026-10-05-everloot-public.sqlite`,
   `VERCEL_SUPPORT_LARGE_FUNCTIONS=1` and a generated `EVERLOOT_MCP_TOKEN`.
3. Redeploy. `prebuild` (`web/scripts/fetch-release.mjs`) downloads the release and checks its
   hash; any problem leaves no release and `/mcp` keeps answering 503.

Gameplay tools on this route read the store in process (#24), so the 2 MB HTTP cap does not apply.

## Sources

- [Vercel Functions limits](https://vercel.com/docs/functions/limitations)
- [Vercel fluid compute pricing](https://vercel.com/docs/functions/usage-and-pricing)
- [AWS Lambda quotas](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html)
- [AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/)
- [Oracle Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
