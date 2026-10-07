/**
 * Markdown Exporters - Export everloot data to standardized markdown for agent consumption
 */

import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import yaml from 'js-yaml';

// ============================================================
// Types
// ============================================================

export interface ExportConfig {
  outputDir: string;
  realm: string;
  faction: string;
  includeTimestamp: boolean;
}

export type Frontmatter = Record<string, any>;

export interface MarkdownFile {
  path: string;
  frontmatter: Frontmatter;
  content: string;
}

// Type definitions for database rows
interface GrindSpotRow {
  id: number;
  realm: string;
  faction: string;
  zone: string;
  name: string;
  x: number;
  y: number;
  z: number;
  min_level: number;
  max_level: number;
  mobs_json: string;
  drops_json: string;
  gph_min: number;
  gph_max: number;
  competition_level: string;
  optimal_classes_json: string;
  route_type: string;
  camp_name: string;
  camp_count: number;
  camps_json: string;
  lap_time: string;
  respawn_timer: string;
  entrance: string;
  direction: string;
  pull_reason: string;
  mount_savings: string;
  vendor_interval: string;
  optimal_pull: number;
  last_scan: number;
  confidence: number;
}

interface ItemRow {
  id: number;
  realm: string;
  name: string;
  category: string;
  subcategory: string;
  item_level: number;
  vendor_price: number;
  stack_size: number;
  sources_json: string;
  drop_rate: string;
  used_in_json: string;
  ah_price_range: string;
  farm_locations_json: string;
  recipes_json: string;
  demand_level: string;
  demand_reason: string;
  supply_variance: string;
  best_sell_time: string;
  last_scan: number;
  confidence: number;
  description: string;
  unit: string;
}

interface QuestRow {
  id: number;
  realm: string;
  faction: string;
  zone: string;
  chain_id: string;
  chain_name: string;
  chain_order: number;
  quest_id: string;
  name: string;
  objectives_json: string;
  turn_in_npc: string;
  location: string;
  min_level: number;
  max_level: number;
  total_xp: number;
  total_gold: string;
  item_rewards_json: string;
  prerequisites_json: string;
  combine_with_json: string;
  grind_spots_json: string;
  grind_efficiency: string;
  last_scan: number;
  confidence: number;
  start_npc: string;
  start_location: string;
  end_npc: string;
  optimal_level: number;
  estimated_time: string;
  camp_name: string;
  gph: string;
}

interface RouteRow {
  id: number;
  realm: string;
  faction: string;
  zone: string;
  name: string;
  min_level: number;
  max_level: number;
  route_type: string;
  waypoints_json: string;
  total_distance: number;
  estimated_lap_time: number;
  respawn_sync: boolean;
  mount_recommended: boolean;
  mount_threshold: number;
  respawn_time: number;
  lap_time: number;
  mounted_time: string;
  target_mob: string;
  quest_chain: string;
  last_scan: number;
  confidence: number;
}

interface AHSnapshotRow {
  id: number;
  realm: string;
  faction: string;
  zone: string;
  timestamp: string;
  total_items: number;
  categories_json: string;
  top_items_json: string;
  trends_json: string;
  recommendations_json: string;
  confidence: number;
}

// ============================================================
// Utility Functions
// ============================================================

function writeMarkdown(file: { path: string; frontmatter: Record<string, any>; content: string }): void {
  const dir = path.dirname(file.path);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const frontmatterStr = yaml.dump(file.frontmatter);
  const content = `---\n${frontmatterStr}---\n\n${file.content}`;
  fs.writeFileSync(file.path, content, 'utf-8');
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

// ============================================================
// MarkdownExporter Class
// ============================================================

export class MarkdownExporter {
  private db: ReturnType<typeof Database>;
  private config: {
    outputDir: string;
    realm: string;
    faction: string;
    includeTimestamp: boolean;
  };

  constructor(dbPath: string, config: { outputDir: string; realm: string; faction: string; includeTimestamp: boolean }) {
    this.db = new Database(dbPath, { readonly: true });
    this.config = config;
  }

  // ============================================================
  // Grind Spot Exporter
  // ============================================================
  
  exportGrindSpots(): void {
    const spots = this.db.prepare(`
      SELECT * FROM grind_spots 
      WHERE realm = ? AND faction = ?
      ORDER BY zone, name
    `).all(this.config.realm, this.config.faction) as any[];

    for (const spot of spots) {
      const frontmatter = {
        id: `grind_spot_${slugify(spot.zone)}_${slugify(spot.name)}`,
        type: 'grind_spot',
        title: spot.name,
        zone: spot.zone,
        coordinates: { x: spot.x, y: spot.y, z: spot.z },
        level_range: [spot.min_level, spot.max_level],
        faction: spot.faction,
        mobs: JSON.parse(spot.mobs_json),
        drops: JSON.parse(spot.drops_json),
        gold_per_hour: `${spot.gph_min}-${spot.gph_max}g`,
        competition: spot.competition_level,
        best_class: JSON.parse(spot.optimal_classes_json),
        route: spot.route_type,
        last_updated: new Date(spot.last_scan).toISOString().split('T')[0],
        source: 'everloot_scan',
        confidence: spot.confidence,
        tags: ['grind', 'leveling', spot.zone.toLowerCase(), spot.faction.toLowerCase()]
      };

      const content = this.generateGrindSpotContent(spot);
      const file = {
        path: path.join(this.config.outputDir, 'strategies', 'grind_spots', `${slugify(spot.zone)}_${slugify(spot.name)}.md`),
        frontmatter,
        content
      };
      writeMarkdown(file);
    }
  }

  private generateGrindSpotContent(spot: any): string {
    const mobs = JSON.parse(spot.mobs_json);
    const drops = JSON.parse(spot.drops_json);
    const classes = JSON.parse(spot.optimal_classes_json);

    let content = `# ${spot.name}\n\n`;
    content += `Optimal ${spot.route_type} route for levels ${spot.min_level}-${spot.max_level} ${spot.faction} players. `;
    content += `The ${spot.camp_name} in ${spot.zone} provide consistent cloth drops and decent gold per hour for early-game characters.\n\n`;

    content += `## Route Description\n\n`;
    content += `Start at ${spot.entrance} and move ${spot.direction} through the ${spot.camp_count} main camps:\n`;
    const camps = JSON.parse(spot.camps_json);
    for (let i = 0; i < camps.length; i++) {
      const camp = camps[i];
      content += `${i + 1}. **${camp.name}** (${camp.mob_count} mobs)\n`;
    }

    content += `\nThe route takes ~${spot.lap_time} per lap. Respawn timer is ~${spot.respawn_timer}, `;
    content += `so continuous grinding is possible without waiting.\n\n`;

    content += `## Optimal Classes\n\n`;
    for (const cls of classes) {
      content += `- **${cls.name}**: ${cls.reason}\n`;
    }

    content += `\n## Loot Table\n\n`;
    content += `| Item | Drop Rate | Vendor Price | AH Value |\n|------|-----------|--------------|----------|\n`;
    for (const drop of drops) {
      content += `| ${drop.item} | ${drop.rate} | ${drop.vendor_price} | ${drop.ah_value} |\n`;
    }

    content += `\n## Optimization Tips\n\n`;
    content += `1. **Pull ${spot.optimal_pull} mobs at a time** - ${spot.pull_reason}\n`;
    content += `2. **Loot while moving** - Don't stop to loot, use auto-loot\n`;
    content += `3. **Mount between camps** - ${spot.mount_savings} per lap\n`;
    content += `4. **Vendor greys every ${spot.vendor_interval} laps** - Bags fill fast\n`;

    return content;
  }

  // ============================================================
  // Item Exporter
  // ============================================================

  exportItems(): void {
    const items = this.db.prepare(`
      SELECT * FROM items 
      WHERE realm = ?
      ORDER BY category, subcategory, name
    `).all(this.config.realm) as any[];

    for (const item of items) {
      const frontmatter = {
        id: `item_${slugify(item.name)}`,
        type: 'item',
        title: item.name,
        category: item.category,
        subcategory: item.subcategory,
        item_level: item.item_level,
        vendor_price: `${item.vendor_price}c`,
        stack_size: item.stack_size,
        sources: JSON.parse(item.sources_json),
        drop_rate: item.drop_rate,
        used_in: JSON.parse(item.used_in_json),
        ah_price_range: item.ah_price_range,
        farm_locations: JSON.parse(item.farm_locations_json),
        last_updated: new Date(item.last_scan).toISOString().split('T')[0],
        source: 'everloot_scan',
        confidence: item.confidence
      };

      const content = this.generateItemContent(item);
      const file = {
        path: path.join(this.config.outputDir, 'items', slugify(item.category), `${slugify(item.name)}.md`),
        frontmatter,
        content: this.generateItemContent(item)
      };
      writeMarkdown(file);
    }
  }

  private generateItemContent(item: any): string {
    const locations = JSON.parse(item.farm_locations_json);
    const usedIn = JSON.parse(item.used_in_json);
    const sources = JSON.parse(item.sources_json);

    let content = `# ${item.name}\n\n`;
    content += `${item.description}\n\n`;

    content += `## Farming Efficiency\n\n`;
    content += `| Location | Mobs | Drop Rate | GPH (${item.unit}) |\n`;
    content += `|----------|------|-----------|------------------|\n`;
    for (const loc of locations) {
      content += `| ${loc.zone} | ${loc.mobs.join(', ')} | ${loc.rate} | ${loc.gph} |\n`;
    }

    content += `\n## Market Analysis\n\n`;
    content += `- **Demand**: ${item.demand_level} - ${item.demand_reason}\n`;
    content += `- **Supply variance**: ${item.supply_variance}\n`;
    content += `- **Price floor**: Vendor price ${item.vendor_price}c prevents crash\n`;
    content += `- **Best sell time**: ${item.best_sell_time}\n`;

    content += `\n## Crafting Value\n\n`;
    content += `| Recipe | ${item.unit} Required | AH Value | Profit Margin |\n`;
    content += `|--------|-------------------|----------|---------------|\n`;
    for (const recipe of JSON.parse(item.recipes_json)) {
      content += `| ${recipe.name} | ${recipe.qty} | ${recipe.ah_value} | ${recipe.margin} |\n`;
    }

    return content;
  }

  // ============================================================
  // Quest Chain Exporter
  // ============================================================

  exportQuests(): void {
    const quests = this.db.prepare(`
      SELECT * FROM quests 
      WHERE realm = ? AND faction = ?
      ORDER BY zone, chain_order
    `).all(this.config.realm, this.config.faction) as any[];

    // Group by chain
    const chains = new Map<string, any[]>();
    for (const quest of quests) {
      if (!chains.has(quest.chain_id)) {
        chains.set(quest.chain_id, []);
      }
      chains.get(quest.chain_id)!.push(quest);
    }

    for (const [chainId, chainQuests] of chains) {
      const first = chainQuests[0];
      const frontmatter = {
        id: `quest_${slugify(first.zone)}_${slugify(chainId)}`,
        type: 'quest_chain',
        title: first.chain_name,
        zone: first.zone,
        level_range: [first.min_level, first.max_level],
        faction: first.faction,
        start_npc: first.start_npc,
        start_location: first.start_location,
        end_npc: first.end_npc,
        xp_reward: first.total_xp,
        gold_reward: first.total_gold,
        item_rewards: JSON.parse(first.item_rewards_json),
        prerequisites: JSON.parse(first.prerequisites_json),
        chain: chainQuests.map(q => ({
          id: q.id,
          name: q.name,
          objectives: JSON.parse(q.objectives_json),
          turn_in: q.turn_in_npc
        })),
        optimal_level: first.optimal_level,
        estimated_time: first.estimated_time,
        combine_with: JSON.parse(first.combine_with_json),
        grind_spots: JSON.parse(first.grind_spots_json),
        grind_efficiency: first.grind_efficiency,
        last_updated: new Date(first.last_scan).toISOString().split('T')[0],
        source: 'everloot_scan',
        confidence: first.confidence
      };

      const content = this.generateQuestChainContent(first, chainQuests);
      
      const file = {
        path: path.join(this.config.outputDir, 'quests', slugify(first.zone), `${slugify(first.chain_id)}.md`),
        frontmatter,
        content: this.generateQuestChainContent(first, chainQuests)
      };
      writeMarkdown(file);
    }
  }

  private generateQuestChainContent(first: any, chain: any[]): string {
    let content = `# ${first.chain_name}\n\n`;
    content += `Complete ${first.chain.length} part quest chain in ${first.zone}. `;
    content += `All objectives located in the same zone - extremely efficient to combine with grinding.\n\n`;

    content += `## Quest Flow\n\n`;
    content += `All quests given and turned in to **${first.start_npc}** at ${first.start_location}. `;
    content += `No travel required between steps.\n\n`;

    content += `## Optimal Strategy\n\n`;
    content += `1. **Accept all available parts** at once\n`;
    content += `2. **Grind ${first.camp_name}** - all mob types spawn in same camps\n`;
    content += `3. **Turn in sequentially** - no travel time\n`;
    content += `4. **Combine with grind** - ${first.gph} while questing\n\n`;

    content += `## Mob Distribution\n\n`;
    content += `| Mob Type | Location | Count Needed |\n|----------|----------|--------------|\n`;
    for (const q of chain) {
      for (const obj of JSON.parse(q.objectives_json)) {
        const match = obj.match(/Kill (\d+) (.+)/);
        if (match) {
          content += `| ${match[2]} | ${q.location} | ${match[1]} |\n`;
        }
      }
    }

    return content;
  }

  // ============================================================
  // Route Exporter
  // ============================================================

  exportRoutes(): void {
    const routes = this.db.prepare(`
      SELECT * FROM routes 
      WHERE realm = ? AND faction = ?
      ORDER BY zone
    `).all(this.config.realm, this.config.faction) as any[];

    for (const route of routes) {
      const waypoints = JSON.parse(route.waypoints_json);
      const frontmatter = {
        id: `grind_route_${slugify(route.zone)}_${slugify(route.name)}`,
        type: 'grind_route',
        title: route.name,
        zone: route.zone,
        faction: route.faction,
        level_range: [route.min_level, route.max_level],
        route_type: route.route_type,
        waypoints: waypoints,
        total_distance: route.total_distance,
        estimated_lap_time: route.estimated_lap_time,
        respawn_sync: route.respawn_sync,
        mount_recommended: route.mount_recommended,
        mount_threshold: route.mount_threshold,
        last_updated: new Date(route.last_scan).toISOString().split('T')[0],
        source: 'everloot_scan',
        confidence: route.confidence
      };

      const file = {
        path: path.join(this.config.outputDir, 'paths', 'grind_routes', `${slugify(route.zone)}_${slugify(route.name)}.md`),
        frontmatter,
        content: this.generateRouteContent(route, waypoints)
      };
      writeMarkdown(file);
    }
  }

  private generateRouteContent(route: any, waypoints: any[]): string {
    let content = `# ${route.name}\n\n`;
    content += `Optimized ${route.route_type} route covering all ${route.target_mob} mob types `;
    content += `for the ${route.quest_chain} quest chain + cloth grinding.\n\n`;

    content += `## Route Overview\n\n`;
    content += `\`\`\`\n`;
    content += waypoints.map((w: any, i: number) => `${i + 1}. ${w.name} (${w.mobs.join(', ')})`).join(' → ');
    content += `\n\`\`\`\n\n`;

    content += `**Total lap**: ~${route.total_distance} yards, ~${route.lap_time} on foot, ~${route.mounted_time} mounted\n`;
    content += `**Respawn sync**: ${route.respawn_time} respawn matches ${route.lap_time}s lap time = continuous grinding\n\n`;

    content += `## Waypoint Details\n\n`;
    for (const wp of waypoints) {
      content += `### ${wp.name} [${wp.coords.join(', ')}]\n`;
      content += `- **Mobs**: ${wp.count} (${wp.mobs.join(', ')})\n`;
      content += `- **Respawn**: ${wp.respawn}s\n`;
      content += `- **Strategy**: ${wp.strategy}\n\n`;
    }

    return content;
  }

  // ============================================================
  // AH Snapshot Exporter
  // ============================================================

  exportAHSnapshots(): void {
    const snapshots = this.db.prepare(`
      SELECT * FROM ah_snapshots 
      WHERE realm = ? AND faction = ?
      ORDER BY timestamp DESC
      LIMIT 10
    `).all(this.config.realm, this.config.faction) as any[];

    for (const snap of snapshots) {
      const frontmatter = {
        id: `ah_snapshot_${snap.timestamp.replace(/[:.]/g, '-')}_${slugify(snap.zone)}`,
        type: 'ah_snapshot',
        title: `AH Snapshot - ${snap.realm} Realm`,
        realm: snap.realm,
        faction: snap.faction,
        timestamp: snap.timestamp,
        total_items: snap.total_items,
        scanned_categories: JSON.parse(snap.categories_json),
        top_items: JSON.parse(snap.top_items_json),
        market_trends: JSON.parse(snap.trends_json),
        recommendations: JSON.parse(snap.recommendations_json),
        last_updated: new Date(snap.timestamp).toISOString().split('T')[0],
        source: 'everloot_ah',
        confidence: snap.confidence
      };

      const file = {
        path: path.join(this.config.outputDir, 'data', 'economy', 'ah_snapshots', 
          `${snap.timestamp.replace(/[:.]/g, '-')}_ah_snapshot.md`),
        frontmatter,
        content: this.generateAHContent(snap)
      };
      writeMarkdown(file);
    }
  }

  private generateAHContent(snap: any): string {
    const items = JSON.parse(snap.top_items_json);
    const trends = JSON.parse(snap.trends_json);
    const recs = JSON.parse(snap.recommendations_json);

    let content = `# AH Snapshot - ${snap.realm} Realm (${snap.zone})\n\n`;
    content += `Automated auction house snapshot from everloot scanning.\n\n`;
    content += `## Summary\n\n`;
    content += `- **Realm**: ${snap.realm} (${snap.faction})\n`;
    content += `- **Scan Time**: ${snap.timestamp}\n`;
    content += `- **Items Scanned**: ${snap.total_items}\n`;
    content += `- **Categories**: ${JSON.parse(snap.categories_json).join(', ')}\n\n`;

    content += `## Top Opportunities\n\n`;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      content += `### ${i + 1}. ${item.item} - ${item.action}\n`;
      content += `- **Market**: ${item.market_value} avg\n`;
      content += `- **Floor**: ${item.min_buyout} (${item.posted} posted)\n`;
      content += `- **Action**: ${item.action}\n`;
      content += `- **Volume**: ${item.quantity} units\n`;
      content += `- **Expected ROI**: ${item.roi}\n\n`;
    }

    return content;
  }

  // ============================================================
  // Export All
  // ============================================================

  exportAll(): void {
    this.exportGrindSpots();
    this.exportItems();
    this.exportQuests();
    this.exportRoutes();
    this.exportAHSnapshots();
  }

  close(): void {
    this.db.close();
  }
}

