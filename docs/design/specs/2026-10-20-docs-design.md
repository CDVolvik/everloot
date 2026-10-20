# Docs: one documentation area for players and developers

**Date:** 2026-10-20
**Status:** approved by Carlos ("do like 1 and 2 … for both"), built in the docs PR.
**Reference:** OpenRouter's docs (quickstart, API reference, client SDK and cookbook pages) for layout only.
Nothing of theirs ships: no text, code or images.

## Why

Everything a developer needs is on one long page, `/connect`, and player help is spread over `/addon`,
`/upload`, `/privacy` and the account pages. Professional products put this in one docs area with a
predictable shape: tabs across the top, a grouped sidebar, one topic per page, an "On this page" list,
and code you can copy. Players and developers both look there first.

## Shape

`/docs`, inside the site's header and footer.

- **Tabs:** Overview · Guides · API Reference · MCP · Cookbook. The tab bar sits under the site header.
- **Left sidebar:** the active tab's groups and pages. On a phone it folds into a "Menu" button.
- **Page:** breadcrumb (Docs / tab / page), title, one-line lede, a "Copy page" button that copies the
  page as Markdown. The design system's rule holds: no eyebrow above the title.
- **Right column:** "On this page", built from the page's h2 and h3, the current section marked.
- **Bottom:** previous and next page in sidebar order.
- **Building blocks:** callouts (note, tip, warning), tabbed code groups with a copy button, numbered
  steps, link cards, parameter tables, a method badge with the path.

## Content

| Tab | Pages |
|---|---|
| Overview | Overview, Quickstart, How Everloot works (uploads, 3 installs, game files, spoilers), Embeddable tooltips, Licence and credit, FAQ |
| Guides | Install the addon, The Desktop App, Upload your data, Find things on the site, Your account, Privacy and your data |
| API Reference | Overview (base URL, keys, limits, errors, caching, CORS, OpenAPI), one page per endpoint, Schemas, Data files |
| MCP | Overview, Connect a client, Resources and prompts, one page per tool |
| Cookbook | Recipes we have run end to end: tooltips on your site, ask Claude about WoW: Forever, prices in a script, drop rates to a spreadsheet, MCP tools over plain HTTP |

Endpoint and tool pages are generated from the protocol package (`API_ROUTES`, `MCP_TOOLS`), the same
source as the server and `/api/openapi.json`, so they cannot drift from the code. An endpoint page shows
the method and path, parameters, responses and a dark panel with curl, JavaScript and Python examples
and an example response built from the response schema.

No SDK tab: Everloot has no SDKs, and the docs do not pretend otherwise.

## Rules

- Facts come from the existing pages and the code. Nothing new is promised; anything not built says so.
- `/connect` redirects to `/docs` once the cohesion PR for `/connect` (#172) is on main, and its old
  anchors (`#mcp`, `#keys`, `#tooltips` …) land on the matching docs page.
- Every docs page is in the sitemap, in `llms.txt` and in site search.
