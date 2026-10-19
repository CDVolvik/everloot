import { MCP_PROMPTS, SITE, type McpPromptDef, type McpPromptName } from "@everloot/protocol";

/**
 * The MCP server's prompts, listed in the protocol's MCP_PROMPTS: one user message each, telling an
 * assistant which tools to call for the job and how to treat what they return (sources on every piece,
 * unrecorded is not zero, Blizzard's text quoted as excerpts only, game-file data unconfirmed).
 */

const TEXT: Record<McpPromptName, (args: Record<string, string | undefined>) => string> = {
  answer_with_sources: ({ question }) => [
    `Answer this question about WoW: Forever with Everloot's tools: ${question}`,
    "",
    "Call answer_sources with the question first. Build the answer only from the evidence it returns, observed facts first, then curated facts, then lore. " +
      "Cite each piece with its source URL, its licence and its date, and say how many installs support an observed fact. " +
      "Where the evidence says unrecorded, say unrecorded: it is not zero. If nothing fits the question, say so, and offer the further-reading links as links only, without fetching them. " +
      `Keep the credit line the answer ends with. The methodology is at ${SITE}/methodology.`,
  ].join("\n"),
  review_talent_plan: ({ code }) => [
    `Read this talent share code with talent_plan: ${code}`,
    "",
    "Then call talent_tree for the class it names. Describe the build: points per tree, the talents taken with their ranks, and the lowest level that can hold it. " +
      "Explain every problem the tool lists in plain words (made on another build, nodes the tree does not have, ranks cut back, points the rules would not place) and what the player can do about each. " +
      "Say that the trees come from the game files and are unconfirmed until seen in play, with the build they came from. Give the calculator link the tool returns so the player can open the plan.",
  ].join("\n"),
  what_changed: ({ game }) => [
    `Summarize what changed in ${game === "classic" ? "WoW Classic" : game === "forever" ? "WoW: Forever" : "WoW: Forever and WoW Classic"} with recent_changes` +
      `${game === "forever" || game === "classic" ? ` (game ${game}, ` : " ("}filter all, limit 25).`,
    "",
    "Group by posts, hotfixes and builds, newest first. For each post give the title, who posted it and when, one line in your own words, and the link to the original. " +
      "Quote only the excerpt the tool gives: the full text is Blizzard's. For a build, say when Everloot first saw it, not when Blizzard released it. " +
      "If the tool says the timeline is not connected, say so: that is not a quiet week.",
  ].join("\n"),
};

/**
 * The prompt's user message for these arguments. A required argument that is missing is refused in words,
 * and so is a value outside an argument's listed values (matched in any case), rather than read as no value.
 */
export function promptText(name: McpPromptName, args: Record<string, string | undefined>): string {
  const given = { ...args };
  for (const [arg, def] of Object.entries(MCP_PROMPTS[name].arguments as McpPromptDef["arguments"])) {
    if (def.required && !args[arg]?.trim()) throw new Error(`${name} needs ${arg}: ${def.description}`);
    const value = args[arg]?.trim().toLowerCase();
    if (!def.values || !value) continue;
    if (!def.values.includes(value)) throw new Error(`${name} takes ${arg} ${def.values.join(" or ")}, not "${args[arg]?.trim()}": ${def.description}`);
    given[arg] = value;
  }
  return TEXT[name](given);
}
