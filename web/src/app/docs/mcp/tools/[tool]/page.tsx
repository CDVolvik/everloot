import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MCP_TOOL_NAMES } from "@everloot/protocol";
import { C, Callout, H2, P, Params, docLink } from "@/components/docs/blocks";
import { CodeGroup } from "@/components/docs/DocsClient";
import DocPage from "@/components/docs/DocPage";
import { toolFromSlug, toolHref } from "@/lib/docs/nav";
import { toolSamples } from "@/lib/docs/examples";
import { toolDocs } from "@/lib/protocol-docs";
import { pageMetadata } from "@/lib/seo";

/** One page per MCP tool, generated from the protocol's tool definitions (MCP_TOOLS). */

export const dynamicParams = false;

export function generateStaticParams() {
  return MCP_TOOL_NAMES.map((name) => ({ tool: name.replaceAll("_", "-") }));
}

export async function generateMetadata({ params }: { params: Promise<{ tool: string }> }): Promise<Metadata> {
  const name = toolFromSlug((await params).tool);
  const doc = name && toolDocs().find((d) => d.name === name);
  if (!doc) return {};
  return pageMetadata({ title: `${doc.name}: ${doc.title} · MCP tool`, description: doc.description.split(/(?<=\.)\s/)[0] ?? doc.title, path: toolHref(doc.name) });
}

export default async function ToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const name = toolFromSlug((await params).tool);
  const doc = name && toolDocs().find((d) => d.name === name);
  if (!doc) notFound();
  const aside = (
    <>
      <CodeGroup title="Call it" tabs={toolSamples(doc.name)} />
      <p data-md-skip className="text-xs leading-5 text-muted">Arguments show the shape of a call; check the parameters for real values.</p>
    </>
  );
  return (
    <DocPage href={toolHref(doc.name)} title={<span className="font-mono text-2xl sm:text-3xl">{doc.name}</span>} lede={doc.title} aside={aside}>
      <P>{doc.description}</P>
      {doc.playerData ? (
        <Callout kind="note"><p>Built on player uploads: a fact appears once 3 installs agree on it, an answer says when something is not recorded yet, and it ends with the age of the data and the credit line.</p></Callout>
      ) : (
        <Callout kind="note"><p>Carries its sources inside the answer. Anything read from the game files is labelled unconfirmed, with its build.</p></Callout>
      )}

      <H2 id="parameters">Parameters</H2>
      <Params rows={doc.params} empty="This tool takes no arguments." />

      <H2 id="answer">The answer</H2>
      <P>
        Text for the assistant to read{doc.structured ? <>, and <C>structuredContent</C> with these top-level fields</> : ""}. The JSON Schema is at{" "}
        <a href={`/schema/mcp/${doc.name}.json`} className={docLink}><C>{`/schema/mcp/${doc.name}.json`}</C></a>.
      </P>
      {doc.structured && <Params rows={doc.output} />}

      <H2 id="without-mcp">Without an MCP client</H2>
      <P>
        The same answer is a GET away: <C>{`/api/tools/${doc.name}`}</C> with the arguments in the query string. See{" "}
        <Link href="/docs/api/tools" className={docLink}>the endpoint</Link> and{" "}
        <Link href="/docs/cookbook/tools-over-http" className={docLink}>the recipe</Link>.
      </P>
    </DocPage>
  );
}
