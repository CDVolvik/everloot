import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export interface AnswerEngine { answer(question: string): Promise<{ answer: string; source: string }> }

export const MAX_ANSWER = 600;

/** The first hit's text and its Source line. No source means no answer: nothing unsourced reaches the game. */
export function answerFromSearch(text: string): { answer: string; source: string } {
  const lines = text.split("\n");
  const sourceAt = lines.findIndex((l) => l.startsWith("Source: "));
  if (sourceAt < 0) return { answer: "No sourced answer found.", source: "none" };
  const body = lines.slice(0, sourceAt).filter((l) => l.trim() && !/^\[[^\]]+\]/.test(l)).join(" ").trim();
  return { answer: (body || "No sourced answer found.").slice(0, MAX_ANSWER), source: lines[sourceAt].slice("Source: ".length).trim() };
}

/** Answers from the Everloot knowledge server's search tool. LLM provider adapters come later. */
export function mcpEngine(options: { url: string; token: string }): AnswerEngine {
  return {
    async answer(question) {
      const client = new Client({ name: "everloot-companion", version: "0.1.0" });
      const transport = new StreamableHTTPClientTransport(new URL(options.url), {
        requestInit: { headers: { Authorization: `Bearer ${options.token}` } },
      });
      await client.connect(transport);
      try {
        const result = await client.callTool({ name: "search_knowledge", arguments: { query: question, limit: 1 } });
        const content = (result.content as { type: string; text?: string }[] | undefined) ?? [];
        return answerFromSearch(content.find((c) => c.type === "text")?.text ?? "");
      } finally {
        await client.close();
      }
    },
  };
}
