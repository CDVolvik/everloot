# Changelog

All notable changes to `@everloot/protocol`, in the style of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
A new record kind, field or tool is a minor release. Removing or renaming anything, making a field
required, or tightening a limit is a major release.

## [Unreleased]

### Added
- The upload record contract, moved here from the site: 31 record kinds, the upload envelope, the
  parser the site runs, the sharing categories, `validRealm` and the upload limits in one `UPLOAD_LIMITS`.
- `protocol` on the upload envelope. The uploaders stamp `PROTOCOL_VERSION`; the server accepts the
  current major and the previous one, and a missing value means major 1.
- `schema/`: JSON Schema (draft 2020-12) for every kind, the envelope, the limits and an index, with the
  server's cross-field rules written into each description. The addon's contract tests read them.

### Notes
- The addon's Lua comments still name `web/src/lib/intake.ts`, the file this package replaced. They sit
  inside the zipped addon, so they change with the next addon release, not here.
