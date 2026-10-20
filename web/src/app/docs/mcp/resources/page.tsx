import type { Metadata } from "next";
import Link from "next/link";
import { C, H2, P, Table, docLink } from "@/components/docs/blocks";
import DocPage from "@/components/docs/DocPage";
import { MCP_PROMPTS, MCP_RESOURCE_TEMPLATES, MCP_RESOURCES } from "@/lib/docs/connect-data";
import { toolHref } from "@/lib/docs/nav";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Resources and prompts",
  description: "The documents, entity pages and ready-made prompts Everloot's MCP server offers beside its tools, with their addresses and arguments.",
  path: "/docs/mcp/resources",
});

export default function ResourcesPage() {
  return (
    <DocPage href="/docs/mcp/resources">
      <H2 id="resources">Resources</H2>
      <P>
        Documents an assistant reads whole, with <C>resources/read</C>, instead of calling a tool with arguments. Their shapes are
        in <a href="/schema/mcp/resources.json" className={docLink}><C>/schema/mcp/resources.json</C></a>.
      </P>
      <Table
        head={["URI", "What it holds"]}
        rows={MCP_RESOURCES.map((resource) => [<C key="u">{resource.uri}</C>, resource.text])}
      />

      <H2 id="entity-resources">Entity resources</H2>
      <P>
        Entity pages read as resources too, one URI per entity. Each answers with the same JSON as the named tool&apos;s structured
        answer, so a client that prefers resources to tool calls gets the same page. The tools are on{" "}
        <Link href="/docs/mcp" className={docLink}>the overview</Link>; one example is{" "}
        <Link href={toolHref("item_page")} className={docLink}><C>item_page</C></Link>.
      </P>
      <Table
        head={["URI template", "What it holds"]}
        rows={MCP_RESOURCE_TEMPLATES.map((t) => [<C key="u">{t.uriTemplate}</C>, t.text])}
      />

      <H2 id="prompts">Prompts</H2>
      <P>
        Ready-made instructions a client offers as commands (<C>prompts/get</C>). You fill the argument, and the assistant gets a
        message that says which tools to call and how to treat what they return. Their arguments are in{" "}
        <a href="/schema/mcp/prompts.json" className={docLink}><C>/schema/mcp/prompts.json</C></a>.
      </P>
      <Table
        head={["Prompt", "What it does"]}
        rows={MCP_PROMPTS.map((prompt) => [<C key="n">{prompt.name}</C>, prompt.text])}
      />
    </DocPage>
  );
}
