import { API_SCHEMAS, PROTOCOL_VERSION, SITE, UPLOAD_LIMITS, ALL_RECORD_KINDS } from "@everloot/protocol";
import { ACCESS_LABEL, DATA_LABEL, routeDocs, toolDocs } from "@/lib/protocol-docs";

/**
 * The reference half of /connect: every MCP tool with its parameters, every JSON endpoint with its
 * parameters and responses, and where the machine-readable copies live. Rendered from the protocol
 * package, so this page, the server and the OpenAPI document cannot disagree.
 */

const link = "text-accent hover:underline underline-offset-4";
const code = "font-mono text-fg";

function Params({ rows, caption }: { rows: { name: string; type: string; required: boolean; description: string }[]; caption: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted">No parameters.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-left text-muted border-b border-line">
            <th scope="col" className="py-1 pr-3 font-medium">Parameter</th>
            <th scope="col" className="py-1 pr-3 font-medium">Type</th>
            <th scope="col" className="py-1 pr-3 font-medium">What it is</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-b border-line/60 align-top">
              <td className="py-1.5 pr-3 whitespace-nowrap">
                <code className={code}>{row.name}</code>
                {row.required && <span className="ml-1 text-xs text-muted">required</span>}
              </td>
              <td className="py-1.5 pr-3 text-fg-2">{row.type}</td>
              <td className="py-1.5 pr-3 text-fg-2">{row.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ToolReference() {
  const docs = toolDocs();
  return (
    <div className="space-y-3">
      <p className="text-fg-2">
        Every tool, with the arguments it takes. The same list, as JSON Schema, is at{" "}
        <a href="/schema/index.json" className={link}><code className={code}>/schema/index.json</code></a> and{" "}
        <code className={code}>/schema/mcp/&lt;tool&gt;.json</code>. Tools marked <em>player data</em> state a fact only
        once three installs agree, say when something is unrecorded, and end their answer with the age of the data and the
        credit line. The others carry their sources inside the answer. Tools marked <em>structured</em> also return{" "}
        <code className={code}>structuredContent</code> of the shape in their schema file, beside the text; the rest gain it
        tool by tool.
      </p>
      <ul className="divide-y divide-line border-y border-line">
        {docs.map((tool) => (
          <li key={tool.name} id={`tool-${tool.name}`} className="py-3">
            <details className="group">
              <summary className="cursor-pointer list-none grid sm:grid-cols-[13rem_1fr] gap-x-4 gap-y-1">
                <span>
                  <code className={`${code} text-sm`}>{tool.name}</code>
                  {tool.playerData && <span className="ml-2 text-xs text-muted whitespace-nowrap">player data</span>}
                  {tool.structured && <span className="ml-2 text-xs text-muted whitespace-nowrap">structured</span>}
                </span>
                <span className="text-sm text-fg-2">{tool.title}</span>
              </summary>
              <div className="mt-3 space-y-3 sm:pl-[14rem]">
                <p className="text-sm text-fg-2">{tool.description}</p>
                <Params rows={tool.params} caption={`Arguments of ${tool.name}`} />
                <p className="text-xs text-muted">
                  Schema: <a href={`/schema/mcp/${tool.name}.json`} className={link}><code className={code}>/schema/mcp/{tool.name}.json</code></a>
                </p>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ApiReference() {
  const routes = routeDocs();
  return (
    <div className="space-y-3">
      <p className="text-fg-2">
        Every JSON endpoint. The machine-readable description is{" "}
        <a href="/api/openapi.json" className={link}><code className={code}>/api/openapi.json</code></a> (OpenAPI 3.1),
        and each response shape is a JSON Schema file under <code className={code}>/schema/api/</code>. Load the OpenAPI file
        into any client generator or API tool to get typed calls. Every answer says which layer it comes from: facts players
        observed carry the licence and credit; facts read from the game files carry a <code className={code}>gameData</code>{" "}
        notice and their build instead.
      </p>
      <ul className="divide-y divide-line border-y border-line">
        {routes.map((route) => (
          <li key={`${route.method} ${route.path}`} id={`api-${route.path.replace(/^\/api\//, "").replace(/\//g, "-")}`} className="py-3">
            <details>
              <summary className="cursor-pointer list-none grid sm:grid-cols-[13rem_1fr] gap-x-4 gap-y-1">
                <span className={`${code} text-sm`}>{route.method} {route.path.replace(/^\/api/, "")}</span>
                <span className="text-sm text-fg-2">{route.summary}</span>
              </summary>
              <div className="mt-3 space-y-3 sm:pl-[14rem]">
                <p className="text-sm text-fg-2">{route.description}</p>
                <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
                  <dt className="text-muted">Access</dt><dd className="text-fg-2">{ACCESS_LABEL[route.access]}</dd>
                  <dt className="text-muted">Data</dt><dd className="text-fg-2">{DATA_LABEL[route.data]}</dd>
                  <dt className="text-muted">Paged</dt><dd className="text-fg-2">{route.paged ? "yes: offset, limit, next" : "no"}</dd>
                  <dt className="text-muted">Responses</dt>
                  <dd className="text-fg-2">
                    {Object.entries(route.responses).map(([status, response]) => (
                      <span key={status} className="block">
                        <code className={code}>{status}</code> {response.description}
                        {response.schema && (
                          <> Shape: <a href={`/schema/api/${response.schema}.json`} className={link}><code className={code}>{response.schema}</code></a>.</>
                        )}
                      </span>
                    ))}
                  </dd>
                  {route.requestBody && (
                    <>
                      <dt className="text-muted">Body</dt>
                      <dd className="text-fg-2"><a href={`/schema/api/${route.requestBody}.json`} className={link}><code className={code}>{route.requestBody}</code></a></dd>
                    </>
                  )}
                </dl>
                <Params rows={(route.query ?? []).map((q) => ({ name: q.name, type: typeText(q.schema), required: q.required ?? false, description: q.description }))} caption={`Query parameters of ${route.path}`} />
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

function typeText(schema: Record<string, unknown>): string {
  if (Array.isArray(schema.enum)) return `one of: ${schema.enum.join(", ")}`;
  const parts = [String(schema.type ?? "value")];
  if (typeof schema.minimum === "number") parts.push(`${schema.minimum} or more`);
  if (typeof schema.minLength === "number" && typeof schema.maxLength === "number") parts.push(`${schema.minLength} to ${schema.maxLength} characters`);
  return parts.join(", ");
}

export function SchemaReference() {
  return (
    <div className="space-y-3">
      <p className="text-fg-2">
        The contract behind all of this is one package, <code className={code}>@everloot/protocol</code>, version{" "}
        <code className={code}>{PROTOCOL_VERSION}</code>: the {ALL_RECORD_KINDS.length} record kinds the addon writes, the
        upload envelope and limits, the {Object.keys(API_SCHEMAS).length} response shapes above and the tool table. The
        site validates uploads with it, the MCP server registers its tools from it, and this page is rendered from it.
      </p>
      <ul className="list-disc pl-6 text-fg-2 space-y-1">
        <li>
          <a href="/schema/index.json" className={link}><code className={code}>{SITE}/schema/index.json</code></a>: what is
          published, with the protocol version.
        </li>
        <li>
          <code className={code}>/schema/records/&lt;kind&gt;.json</code>: one JSON Schema (draft 2020-12) per record kind, with
          the rules the server checks that a schema cannot express written into the description.
        </li>
        <li>
          <a href="/schema/upload.json" className={link}><code className={code}>/schema/upload.json</code></a> and{" "}
          <a href="/schema/limits.json" className={link}><code className={code}>/schema/limits.json</code></a>: the upload
          envelope and its sizes (at most {UPLOAD_LIMITS.recordsPerBatch.toLocaleString("en-US")} records and{" "}
          {Math.round(UPLOAD_LIMITS.maxBodyBytes / 1_000_000)} MB per request).
        </li>
        <li>
          <code className={code}>/schema/api/&lt;name&gt;.json</code> and <code className={code}>/schema/mcp/&lt;tool&gt;.json</code>:
          the response shapes and the tool inputs.
        </li>
        <li>
          The source and its changelog:{" "}
          <a href="https://github.com/Everloot/everloot/tree/main/packages/protocol" rel="noopener" className={link}>packages/protocol</a>.
          Semver: a new kind, field or tool is a minor release; a removal, a rename, a new required field or a tighter limit
          is a major release, and the server accepts the current major and the one before it.
        </li>
      </ul>
    </div>
  );
}
