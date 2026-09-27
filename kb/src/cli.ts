import { existsSync } from "node:fs";
import { BlizzardClient } from "./blizzard/client.js";
import type { Game, NsKind, Region } from "./blizzard/namespaces.js";
import { openDb } from "./db.js";
import { importCurated } from "./importers/curated.js";
import { importWagoTable, WAGO_TABLES } from "./importers/wago.js";
import { importWikiDump } from "./importers/wiki-dump.js";
import { search } from "./search.js";
import { snapshot } from "./snapshot.js";
import { validate } from "./validate.js";

const USAGE = `usage: npm run kb -- <command> [--db data/wowvault-kb.sqlite]
  import-wiki <dump.xml|dump.xml.zst> [--limit N]
  import-wago <build> [--table ItemSparse]
  import-curated [dir=curated]
  blizzard-get <path> --game retail|classic|classic1x|forever --kind static|dynamic|profile [--region us]
  search <words...>
  stats
  validate
  snapshot <out.sqlite>   (outside the database's own folder, e.g. data/release/kb.sqlite)`;

async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2);
  const flags = new Map<string, string>();
  const args: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith("--")) flags.set(rest[i].slice(2), rest[++i] ?? "");
    else args.push(rest[i]);
  }
  if (existsSync(".env")) process.loadEnvFile(".env");
  const db = openDb(flags.get("db") ?? "data/wowvault-kb.sqlite");

  switch (cmd) {
    case "import-wiki": {
      if (!args[0]) break;
      const limit = flags.has("limit") ? Number(flags.get("limit")) : undefined;
      const { stored, skipped } = await importWikiDump(db, args[0], { limit });
      db.pragma("wal_checkpoint(TRUNCATE)");
      console.log(`imported ${stored} lore pages (${skipped} skipped: wikitext converted to no text)`);
      return 0;
    }
    case "import-wago": {
      if (!args[0]) break;
      const tables = flags.has("table") ? WAGO_TABLES.filter((t) => t.table === flags.get("table")) : WAGO_TABLES;
      if (tables.length === 0) throw new Error(`unknown table ${flags.get("table")}`);
      for (const t of tables) console.log(`${t.table}: ${await importWagoTable(db, t, args[0])} rows`);
      db.pragma("wal_checkpoint(TRUNCATE)");
      return 0;
    }
    case "import-curated":
      console.log(`imported ${await importCurated(db, args[0] ?? "curated")} curated entries`);
      return 0;
    case "blizzard-get": {
      const { BLIZZARD_CLIENT_ID: id, BLIZZARD_CLIENT_SECRET: secret } = process.env;
      if (!args[0] || !id || !secret) {
        console.error("needs a path plus BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET in kb/.env");
        return 1;
      }
      const client = new BlizzardClient(db, { clientId: id, clientSecret: secret, region: (flags.get("region") ?? "us") as Region });
      const body = await client.get(args[0], (flags.get("game") ?? "retail") as Game, (flags.get("kind") ?? "static") as NsKind);
      console.log(JSON.stringify(body, null, 2));
      return 0;
    }
    case "search":
      for (const h of search(db, args.join(" "))) console.log(`${h.kind}  ${h.name}\n  ${h.snippet}\n  ${h.sourceUrl} (${h.licence})`);
      return 0;
    case "stats":
      console.table(db.prepare("SELECT source_id, kind, count(*) AS rows FROM entities GROUP BY source_id, kind").all());
      return 0;
    case "validate": {
      const problems = validate(db);
      console.log(problems.length === 0 ? "ok" : problems.join("\n"));
      return problems.length === 0 ? 0 : 1;
    }
    case "snapshot":
      if (!args[0]) break;
      console.log(JSON.stringify(snapshot(db, args[0]), null, 2));
      return 0;
  }
  console.error(USAGE);
  return 1;
}

main().then(
  (code) => process.exit(code),
  (e: Error) => {
    console.error(e.message);
    process.exit(1);
  },
);
