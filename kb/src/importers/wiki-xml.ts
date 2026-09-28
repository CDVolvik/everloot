import sax from "sax";
import type { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";

export interface WikiPage {
  id: string;
  title: string;
  ns: number;
  redirect: boolean;
  /** Timestamp of the newest revision seen for this page. */
  timestamp: string;
  /** Wikitext of the newest revision. */
  text: string;
}

/**
 * Streams a MediaWiki XML export (current or full history) and yields each page with its newest
 * revision. The consumer pulls input through the stream's async iterator, so backpressure is exact
 * and memory stays bounded by one input chunk. Breaking out of the loop destroys the input; an input
 * that closes early, or malformed XML, rejects. Accepts Buffer or string chunks.
 */
export async function* parsePages(input: Readable): AsyncGenerator<WikiPage> {
  const parser = sax.parser(true);
  const decoder = new StringDecoder("utf8");
  const ready: WikiPage[] = [];
  const path: string[] = [];
  let page: WikiPage | null = null;
  let rev: { timestamp: string; text: string } | null = null;
  let buf = "";
  let failure: Error | null = null;

  parser.onopentag = (node) => {
    path.push(node.name);
    buf = "";
    if (node.name === "page") page = { id: "", title: "", ns: 0, redirect: false, timestamp: "", text: "" };
    else if (node.name === "revision") rev = { timestamp: "", text: "" };
    else if (node.name === "redirect" && page) page.redirect = true;
  };
  parser.ontext = (t) => {
    buf += t;
  };
  parser.oncdata = (t) => {
    buf += t;
  };
  parser.onclosetag = (name) => {
    const parent = path[path.length - 2];
    if (page) {
      if (parent === "page" && name === "title") page.title = buf;
      else if (parent === "page" && name === "ns") page.ns = Number(buf);
      else if (parent === "page" && name === "id") page.id = buf;
      else if (rev && parent === "revision" && name === "timestamp") rev.timestamp = buf;
      else if (rev && parent === "revision" && name === "text") rev.text = buf;
      else if (rev && name === "revision") {
        if (rev.timestamp >= page.timestamp) {
          page.timestamp = rev.timestamp;
          page.text = rev.text;
        }
        rev = null;
      } else if (name === "page") {
        ready.push(page);
        page = null;
      }
    }
    path.pop();
    buf = "";
  };
  parser.onerror = (e) => {
    failure ??= e; // sax keeps going after an error; the first one is the root cause
  };

  // Throws before handing out anything parsed from a chunk that contained an error.
  function* drain(): Generator<WikiPage> {
    if (failure) throw failure;
    while (ready.length > 0) yield ready.shift()!;
  }

  for await (const chunk of input) {
    parser.write(typeof chunk === "string" ? chunk : decoder.write(chunk as Buffer));
    yield* drain();
  }
  parser.write(decoder.end());
  parser.close();
  yield* drain();
}
