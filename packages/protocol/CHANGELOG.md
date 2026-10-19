# Changelog

All notable changes to `@everloot/protocol`, in the style of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
A new record kind, field or tool is a minor release. Removing or renaming anything, making a field
required, or tightening a limit is a major release.

## [Unreleased]

### Added
- `skill` as an entity kind and the `in_skill_line` relation (spell -> skill line), as the site's
  profession edges from the game files carry since 2026-10-18.
- The upload record contract, moved here from the site: 31 record kinds, the upload envelope, the
  parser the site runs, the sharing categories, `validRealm` and the upload limits in one `UPLOAD_LIMITS`.
- `protocol` on the upload envelope. The uploaders stamp `PROTOCOL_VERSION`; the server accepts the
  current major and the previous one, and a missing value means major 1.
- `schema/`: JSON Schema (draft 2020-12) for every kind, the envelope, the limits and an index, with the
  server's cross-field rules written into each description. The addon's contract tests read them.
- The licence and credit line (`SITE`, `LICENCE`, `CREDIT_LINE`, `MCP_CREDIT`, `GAME_DATA_CREDIT`),
  moved here from the knowledge base.
- The JSON API's response shapes (`corpusPublicResponse`, `dropsResponse`, `edgesResponse`, `itemsResponse`,
  `marketPricesResponse`, `marketRealmsResponse`, `intakeRequest`, `intakeReceipt`, `intakeRefused`,
  `healthResponse`, `apiError`, `page`, `attribution`, `gameDataNotice`) and the route catalogue
  `API_ROUTES`, emitted as `schema/api/*.json` and `schema/api/routes.json`. Each route's test on the site
  parses a real response with its schema.
- The MCP server's tool table `MCP_TOOLS` (22 tools: name, title, description, input schema, annotations),
  with the input constants they use (`KNOWLEDGE_KINDS`, `GAME_VERSIONS`, `ENTITY_KINDS`, `RELS`,
  `CHANGE_FILTERS`, `BOARD_IDS`, `ECOSYSTEM_BOARD_FILTERS`, the `NEAR_*` limits, `ITEM_QUALITY_SLUGS`),
  emitted as `schema/mcp/<tool>.json`. `TOOL_OUTPUT` states that every tool answers with one text block;
  `search_knowledge`, `get_entity`, `get_by_name` and `recent_changes` also declare an `outputSchema`
  (`knowledgeHit`, `changeEntry`) and answer with `structuredContent` of that shape (`STRUCTURED_TOOLS`).
  The other tools gain it tool by tool in later minor releases.
- `answer_sources` (the 23rd tool) and its `evidence` shape: claim, kind (observed, curated, lore), source,
  licence, asOf, support.
- `talent_tree` and `talent_plan` (tools 24 and 25), both with structured output: `TALENT_CLASSES`,
  `talentNode` and `talentTreePoints`. The trees of one class from the game files, and a share code read
  against them.
- `outputSchema` for `item_categories` (`itemCategory`), `ecosystem_projects` (`ecosystemProject`) and
  `everloot_plan` (`planRow`): the three tools that read no uploads now answer with `structuredContent`.
- `uploadsAnswer`, the envelope every structured answer built on player uploads starts with (`connected`,
  `dataAsOf`, `reason`), and `outputSchema` for the five page tools: `item_page` (`itemPage`, `itemDrop`,
  `mapPin`), `npc_page` (`npcPage`), `quest_page` (`questPage`), `vendor_page` (`vendorPage`, `vendorOffer`)
  and `object_page` (`objectPage`). With no corpus read the page is absent, which is not a measured zero.
- `outputSchema` for `auction_history` (`auctionHistory`), `collection_gap` (`collectionGap`) and `guild_board`
  (`guildBoard`), under the same `uploadsAnswer` envelope.
- `outputSchema` for `profession_path` (`professionPath`), `recipe_thresholds` (`recipeThresholds`),
  `entity_relations` (`entityRelations`, `relationEdge`), `completion_progress` (`completionProgress`,
  `characterProgress`) and `market_value` (`marketPage`, `marketValue`), under the same envelope.
- `outputSchema` for `gold_ledger` (`goldLedger`, with `INCOME_CATEGORIES` and `SPENDING_CATEGORIES`) and
  `world_map_near` (`mapNear`), the last two: every tool is structured now (`STRUCTURED_TOOLS` is the
  whole list).
- Two tools after OpenAI's connector contract, `search` (`searchResult`: id, title, url) and `fetch`
  (`fetchedDocument`: id, title, text, url, metadata with source, licence and date), listed in
  `CHATGPT_TOOLS`; their schema files say the text block is the structured answer as JSON.
- The MCP server's resource templates `MCP_RESOURCE_TEMPLATES` (`everloot://item/{id}`, `npc`, `quest`,
  `vendor`, `object`, `talents/{class}`), each naming the tool whose structured answer it holds; in
  `schema/mcp/resources.json` as `templates` and in `index.json` as `mcpResourceTemplates`.
- The MCP server's prompt table `MCP_PROMPTS` (`answer_with_sources`, `review_talent_plan`, `what_changed`:
  title, description, string arguments), emitted as `schema/mcp/prompts.json` and listed in `index.json`
  as `mcpPrompts`.
- The MCP server's resource table `MCP_RESOURCES` (`everloot://builds`, `everloot://methodology`,
  `everloot://data-policy`: name, title, description, MIME type), `buildEntry` and `buildsResource` for the
  JSON one, emitted as `schema/mcp/resources.json` and listed in `index.json` as `mcpResources`.

### Changed
- `TERMS_URL` points at the terms of use, `https://everloot.app/terms#licences`, now that the site has a
  terms page; it was the licence section of `/connect`.

### Notes
- The addon's Lua comments still name `web/src/lib/intake.ts`, the file this package replaced. They sit
  inside the zipped addon, so they change with the next addon release, not here.
