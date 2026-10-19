# SEO and AI discoverability

What the site does so search engines and AI assistants can find and quote it, and the account steps that only
the owner can do. Written after the 2026-10-17 audit.

## What the code does

- **Titles, H1s, descriptions.** Each page states its own, led by the query terms ("WoW Forever Talent
  Calculator"). Titles may say "WoW Forever"; body copy keeps "WoW: Forever". Descriptions are 120 to 160
  characters; `web/src/app/metadata.test.ts` checks every static route. Use `pageMetadata()` from
  `web/src/lib/seo.ts` for a new page: a page's `openGraph`, `twitter` and `alternates` replace the layout's, so
  each page must state them in full.
- **Social cards.** `/opengraph-image` for the site; text-only cards for the talent class pages, raid, map and
  changes (`web/src/lib/og-card.tsx`). No Blizzard art.
- **Structured data.** All of it is built in `web/src/lib/jsonld.ts` from the values the page shows. No ratings,
  no `license` on game data, no game build as `softwareVersion`, no FAQPage, Person or speakable. The Dataset on
  /database appears only once uploads exist.
- **Breadcrumbs.** `web/src/components/Breadcrumbs.tsx` (in the layout) draws the trail and its BreadcrumbList
  from `web/src/lib/breadcrumbs.ts`. /tools is not a page, so no trail links it.
- **Answer blocks.** Counted from the data files: talent points and tree facts (`web/src/lib/talents/facts.ts`),
  raid buffs that need a talent (`web/src/lib/raid-facts.ts`), the latest build line
  (`web/src/lib/changes-facts.ts`). /wow-forever quotes Blizzard's launch sentence from
  `web/src/data/wow-forever.ts`; when you re-read the source, update `checkedOn` there.
- **llms.txt and llms-full.txt** are route handlers built from the tool catalog, the MCP tool list in
  `web/src/app/connect/connect-data.ts` and the changes data. A test fails if an MCP tool registered in
  `kb/src/mcp-server.ts` is missing from either.
- **Sitemap.** `lastModified` only where one is known: newest change entry for /changes, the build extraction
  date for the talent, raid and map pages, the checked-on date for /wow-forever.
- **RSS.** Every page advertises `/changes/feed.xml`.
- **Security headers** in `web/next.config.js`: nosniff, `X-Frame-Options: SAMEORIGIN`, Referrer-Policy,
  Permissions-Policy, HSTS with `includeSubDomains`, and a report-only CSP that lists the analytics and ads
  hosts. The CSP enforces nothing and has no report endpoint yet; violations show in the browser console.
  The `Access-Control-Allow-Origin: *` seen on pages is added by Vercel for prerendered responses; it is not set in
  this repo and a header set here could not remove it. Check a preview deployment before trying to narrow it.

## IndexNow

- `INDEXNOW_KEY` (8 to 128 characters: letters, digits, dashes) is read from the environment. `/indexnow.txt`
  serves it, and every ping names that file as `keyLocation`. No key is committed. Without the variable the file
  is a 404 and nothing is sent.
- `pingIndexNow(urls)` in `web/src/lib/indexnow.ts` sends nothing for an empty list or another host.
- `/api/cron/indexnow` runs hourly (`web/vercel.json`, same `CRON_SECRET` auth as the snapshot cron). It submits
  /changes, its feed and /wow-forever when the changes list has an entry from the last two hours, and sends
  nothing when the list is empty. It decides from the entry count, never from a page answering 200.
- There is no automatic ping for a newly deployed page. To announce one, send a POST to
  `https://api.indexnow.org/indexnow` with `host`, `key`, `keyLocation` and `urlList`, or add the page to
  `changeUrlsToPing`.

## Steps for Carlos

1. **Vercel env var.** Add `INDEXNOW_KEY` (Production). Generate one, for example 32 random hex characters. After
   the deploy, open `https://everloot.app/indexnow.txt` and confirm it shows the key.
2. **www redirect.** Vercel project, Domains: make `www.everloot.app` a permanent redirect to `everloot.app`.
   Today it serves a 200 duplicate and relies on the canonical tag.
3. **Google Search Console.** Add the property for `everloot.app`. Either verify by DNS, or set `GSC_VERIFICATION`
   (the content value of the meta tag) in Vercel. Submit `https://everloot.app/sitemap.xml` and
   `https://everloot.app/lore-sitemap.xml`.
4. **Bing Webmaster Tools.** Add the site, or import it from Search Console. Set `BING_VERIFICATION` if you
   verify by meta tag. Submit the same two sitemaps. IndexNow submissions show under "IndexNow" once the key
   works.
5. **MCP registry.** Publish the public server (`https://everloot.app/mcp/public`) to the official MCP
   registry as `io.github.Everloot/everloot`, then to Glama, Smithery and mcp.so. The server must have
   `EVERLOOT_MCP_PUBLIC=1` set in Production, or the endpoint answers 404.
6. **Bot protection.** Check that Vercel's bot protection is not challenging GPTBot, ClaudeBot, PerplexityBot or
   OAI-SearchBot. The audit saw 200s for all of them.
7. **Decisions still open** (not changed in this work): whether to noindex the Warcraft Wiki copies under /lore,
   and who is named on /about.
