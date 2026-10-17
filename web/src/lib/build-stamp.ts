import mapJson from "@/data/game-data/map.json";
import hunter from "@/data/game-data/talents/hunter.json";

/**
 * When the game-data files were extracted from the build, for the sitemap's lastModified. The class files and
 * the raid table come from one extraction run (the build watch regenerates them together), so one class file
 * speaks for all nine; the map is read in the same run and carries its own stamp.
 */
export const TALENT_DATA_EXTRACTED_AT = new Date(hunter.build.extractedAt);
export const MAP_DATA_EXTRACTED_AT = new Date(mapJson.source.extractedAt);
