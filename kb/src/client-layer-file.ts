import layerJson from "../../web/src/data/game-data/client-layer.json" with { type: "json" };
import { ClientLayer, readLayerEdges, readLayerTaxonomy } from "./client-layer.js";
import type { Edge } from "./edges.js";
import type { Taxonomy } from "./item-taxonomy.js";

/** The committed client layer, validated once at load. The MCP tools and the site read the same file. */
export const CLIENT_LAYER: ClientLayer = ClientLayer.parse(layerJson);
export const CLIENT_EDGES: Edge[] = readLayerEdges(CLIENT_LAYER);
export const CLIENT_TAXONOMY: Taxonomy = readLayerTaxonomy(CLIENT_LAYER);
