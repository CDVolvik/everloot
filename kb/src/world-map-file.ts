import mapJson from "../../web/src/data/game-data/map.json" with { type: "json" };
import { WorldMapData } from "./world-map-data.js";

/** The committed map layer, validated once at load. The MCP tool and the site read the same file. */
export const WORLD_MAP_DATA: WorldMapData = WorldMapData.parse(mapJson);