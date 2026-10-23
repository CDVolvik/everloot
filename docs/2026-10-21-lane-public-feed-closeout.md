# Lane closeout: the public feed is readable again (2026-10-21)

Lane 1 of 4. The public corpus feed and the bulk export now publish a per-install pseudonym in the `installId`
field, so every record passes `parseRecords` and anyone can count installs. The addon's install id still never
leaves the site.

## Why

`/api/corpus/public` deleted `installId` from every record. The protocol's record schemas require it
(`INSTALL_ID`, 8 to 64 characters), so `parseRecords` rejected every record, and the knowledge base's
`fetchPublicCorpus` drops the whole feed when any record is rejected. The Classic baseline report and the
self-hosted MCP therefore read no uploads at all. The data policy promised the opposite: anonymous records "so
anyone can check our counts", which a feed with no install id cannot support.

## What changed

- `web/src/lib/public-install.ts` (new): `published(record)` replaces `installId` with
  `pub-` + the first 32 hex of HMAC-SHA256(secret, `"public-install:" + installId`). The secret is
  `EVERLOOT_PUBLIC_INSTALL_KEY`, else `EVERLOOT_CHARACTER_KEY`, each at least 32 characters (the census rule). The
  `public-install:` prefix keeps the value apart from the census key (the bare GUID) and the link key (`link:`)
  made with the same secret. With no usable key the install id is dropped as before and one warning is logged; no
  public salt is invented.
- `web/src/app/api/corpus/public/route.ts` and `web/src/lib/bulk-export.ts` both use that one helper, so the feed
  and `corpus.ndjson` give an install the same pseudonym.
- The pseudonym is applied after the corpus folds Polestar Recorder install ids into one voter per player
  (`kb/src/recorder-installs.ts`, through `publicRecords`), so one Recorder player gets one pseudonym.
- `@everloot/protocol` 1.13.0: the `corpusPublicResponse.records` description now describes the pseudonym. The
  shape did not change; `PROTOCOL_VERSION` stays 1.7.0. `dist/` and `schema/` were regenerated, and the kb, web and
  companion lockfiles were moved to 1.13.0.
- Disclosure: `docs/DATA_POLICY.md`, the privacy page, the how-it-works, privacy-guide and upload-guide docs pages,
  `llms.txt` (`web/src/lib/llms.ts`), `docs/architecture.md` and `docs/RELEASING.md` now say the records carry a
  per-install pseudonym in place of the install id. The FAQ's "your install id is never published" stays true.

## Production key

`EVERLOOT_CHARACTER_KEY` exists in the production environment of the site's Vercel project (added 2 days before
this note). Its length could not be read from here: if it is under 32 characters, the census already stores
nothing and this feed falls back to no install id. `EVERLOOT_PUBLIC_INSTALL_KEY` is not set, so the character key
is used. A separate public key is optional; adding one is the owner's step, and it would change every pseudonym
once.

## Tests

- `web/src/lib/public-install.test.ts`: the pseudonym is stable for one install, differs across installs and
  secrets, is not the install id, satisfies `INSTALL_ID`, is not a prefix of the census or link key under the same
  secret; key precedence; a published record passes `parseRecords`; no key drops the id and logs once.
- `web/src/app/api/corpus/public/route.test.ts`: with a key, the raw response text never contains a real install
  id, every record carries a `pub-` pseudonym, one install's records share it, two installs differ, and the records
  pass `parseRecords`. Without a key, no record has an install id.
- `web/src/lib/bulk-export.test.ts`: with a key, `corpus.ndjson` holds one pseudonym per install and its rows parse.
- Full suites: web 2,042 passed (3 skipped), protocol 81, kb 1,075; web, kb typechecks clean; web lint has no new
  warnings; protocol build left no diff beyond the description.

## The baseline report, real numbers

pfQuest at the pinned commit `104f3567`, imported into a scratch database with the client snapshot: 10,026 units,
8,919 objects, 17,484 items, 4,319 quests; 124,673 of 124,673 spawns placed on a UiMap.

Against the production feed today (this change is not deployed yet):

```
0 upload records read
npc: 0 confirmed, 0 changed, 0 new in Forever, 10026 not seen yet
object: 0 confirmed, 0 changed, 0 new in Forever, 8919 not seen yet
quest: 0 confirmed, 0 changed, 0 new in Forever, 4319 not seen yet
drop: 0 confirmed, 0 changed, 0 new in Forever, 207109 not seen yet
vendor: 0 confirmed, 0 changed, 0 new in Forever, 13859 not seen yet
```

**The production feed still reads zero records**, because the fix is not live. The live feed holds 84 records from
10 uploads (81 `npc_sighting`, 3 `map_bounds`). Served as today, all 81 sightings the report asks for are rejected
("expected string, received undefined", the missing `installId`). With a pseudonym added, 81 of 81 parse.

The same report on those 81 live records with one stand-in pseudonym for all of them (all counted as a single
install, so nothing can reach three installs) reads "81 upload records read", the uploads line says connected,
and every count is still 0 confirmed. That is the expected floor, not a measurement. How many facts three real
installs confirm after deploy is [?]; with 81 sightings in the whole feed it will be small either way. The report
must be rerun against the production feed once this is deployed.

## After deploy

- Rerun `npm run kb -- baseline-report` against the production feed and record the numbers.
- Check `https://everloot.app/docs/api/schemas` shows the new `corpusPublicResponse` description.
