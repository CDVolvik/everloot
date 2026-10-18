# @everloot/protocol

The contract between the Everloot addon, its uploaders and [everloot.app](https://everloot.app): the
record kinds the addon writes, the upload envelope, the parser the site runs, the sharing categories
and the upload limits. One definition, used by the site, the knowledge base, the companion and the
addon's contract tests.

## Status

1.0.0, used by everloot.app. Not yet published to npm; the parts of this repository install it from
the folder.

## Install

```sh
npm install @everloot/protocol zod
```

`zod` is a peer dependency. The package resolves the copy your project installs.

## How it connects

- **The addon writes** records into `SavedVariables/Everloot.lua`, one list per kind. Its contract
  tests validate those rows against `schema/records/<kind>.json`, because Lua cannot import this package.
- **Uploaders send** them to `POST /api/intake` inside the envelope in `schema/upload.json`, stamped
  with `protocol: PROTOCOL_VERSION`, inside `UPLOAD_LIMITS`.
- **The site validates** every record with `parseRecords` and `parseUpload`, the same functions this
  package exports, and tells named data from anonymous data with `sharingCategory`.
- **MCP and API clients read** the same definitions to know what a record holds.

```ts
import { parseUpload, PROTOCOL_VERSION, UPLOAD_LIMITS } from "@everloot/protocol";

const parsed = parseUpload({ addonVersion: "0.3.3", protocol: PROTOCOL_VERSION, records });
if (parsed.ok) console.log(parsed.upload.records.length, "records accepted");
```

## Versioning

Semver. A new record kind, field or tool is a minor release. Removing or renaming anything, making a
field required, or tightening a limit is a major release. The server accepts the current major and the
previous one. The generated `schema/` and `dist/` folders are committed; CI rebuilds them and fails on
any difference.

## Licence

[AGPL-3.0-only](LICENSE), like the rest of Everloot. The data players upload is published under
CC BY-SA 4.0; see [`docs/DATA_POLICY.md`](../../docs/DATA_POLICY.md).
