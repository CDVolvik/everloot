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

### Notes
- The addon's Lua comments still name `web/src/lib/intake.ts`, the file this package replaced. They sit
  inside the zipped addon, so they change with the next addon release, not here.
