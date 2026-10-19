/**
 * The licence and credit line for Everloot's own data, in one place. The site's JSON APIs, the MCP
 * answers built on player data, /connect and docs/DATA_POLICY.md all use these words.
 * Game-file data and Blizzard's text are not under this licence and do not get this line.
 */
export const SITE = "https://everloot.app";
export const LICENCE = "CC BY-SA 4.0";
export const LICENCE_URL = "https://creativecommons.org/licenses/by-sa/4.0/";
export const CREDIT_LINE = `Data from Everloot (${SITE}), ${LICENCE}.`;
/** Where the rules for reuse are written out for people. */
export const TERMS_URL = `${SITE}/terms#licences`;
/** What game-file facts carry instead of our licence (docs/DATA_POLICY.md, "The client layer"). */
export const GAME_DATA_CREDIT = "Game data © Blizzard Entertainment, Inc., read from the public client; not under Everloot's licence. "
    + "Column names from WoWDBDefs (https://github.com/wowdev/WoWDBDefs), CC BY-SA 4.0.";
/** The line an MCP answer built on player data ends with: a plain statement of fact, no instruction. */
export const MCP_CREDIT = `Licence: ${LICENCE}. Credit: Everloot contributors, ${SITE}`;
