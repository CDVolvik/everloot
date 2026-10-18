/**
 * @everloot/protocol: the contract between the Everloot addon, its uploaders, everloot.app and the
 * clients that read it. Record kinds and their schemas, the upload envelope, the parser the site runs,
 * the sharing categories, the upload limits, the protocol version, the licence and credit line, the
 * JSON API's response shapes and route catalogue, and the MCP server's tool table.
 */
export * from "./records.js";
export * from "./parse.js";
export * from "./sharing.js";
export * from "./realm.js";
export * from "./limits.js";
export * from "./version.js";
export * from "./attribution.js";
export * from "./api.js";
export * from "./mcp.js";
