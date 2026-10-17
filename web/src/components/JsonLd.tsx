import { serializeJsonLd, type JsonLd as JsonLdData } from "@/lib/jsonld";

/** One JSON-LD block. Renders nothing for null, so a gated builder can be passed straight in. */
export default function JsonLd({ data }: { data: JsonLdData | null }) {
  if (!data) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
