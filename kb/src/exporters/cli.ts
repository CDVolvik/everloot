#!/usr/bin/env tsx
/**
 * Markdown Export CLI - Export everloot data to markdown for agent consumption
 */

import { MarkdownExporter } from './markdown.js';
import { ExportConfig } from './markdown.js';
import { Database } from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

interface CliConfig {
  db: string;
  output: string;
  realm: string;
  faction: string;
  types: string[];
}

function parseArgs(): CliConfig {
  const args = process.argv.slice(2);
  const config: CliConfig = {
    db: '',
    output: '',
    realm: 'Forever',
    faction: 'Alliance',
    types: ['all']
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--db':
        config.db = args[++i];
        break;
      case '--output':
        config.output = args[++i];
        break;
      case '--realm':
        config.realm = args[++i];
        break;
      case '--faction':
        config.faction = args[++i];
        break;
      case '--types':
        config.types = args[++i].split(',');
        break;
    }
  }

  return config;
}

async function main() {
  const config = parseArgs();

  if (!config.db || !config.output) {
    console.error('Usage: tsx src/exporters/cli.ts --db <path> --output <path> [--realm <realm>] [--faction <faction>] [--types <types>]');
    console.error('Types: all, grind_spots, items, quests, routes, ah_snapshots');
    process.exit(1);
  }

  if (!fs.existsSync(config.db)) {
    console.error(`Database not found: ${config.db}`);
    process.exit(1);
  }

  if (!fs.existsSync(config.output)) {
    fs.mkdirSync(config.output, { recursive: true });
  }

  const exportConfig: ExportConfig = {
    outputDir: config.output,
    realm: config.realm,
    faction: config.faction,
    includeTimestamp: true
  };

  console.log(`Exporting from ${config.db} to ${config.output}`);
  console.log(`Realm: ${config.realm}, Faction: ${config.faction}`);

  const exporter = new MarkdownExporter(config.db, exportConfig);

  try {
    let files: any[] = [];

    const types = config.types.includes('all') 
      ? ['grind_spots', 'items', 'quests', 'routes', 'ah_snapshots']
      : config.types;

    if (types.includes('grind_spots')) {
      console.log('Exporting grind spots...');
      exporter.exportGrindSpots();
      console.log(`  Exported grind spots`);
    }

    if (types.includes('items')) {
      console.log('Exporting items...');
      exporter.exportItems();
      console.log(`  Exported items`);
    }

    if (types.includes('quests')) {
      console.log('Exporting quests...');
      exporter.exportQuests();
      console.log(`  Exported quest chains`);
    }

    if (types.includes('routes')) {
      console.log('Exporting routes...');
      exporter.exportRoutes();
      console.log(`  Exported routes`);
    }

    if (types.includes('ah_snapshots')) {
      console.log('Exporting AH snapshots...');
      exporter.exportAHSnapshots();
      console.log(`  Exported snapshots`);
    }

    // Write all files
    console.log('\nWriting files...');
    let total = 0;
    // The export methods already write files
    console.log('Done!');
  } catch (error) {
    console.error('Export failed:', error);
    process.exit(1)
  }
}

main();