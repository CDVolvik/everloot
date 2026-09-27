import sax from "sax";
import type { Readable } from "node:stream";

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

const HIGH_WATER = 500;
const LOW_WATER = 50;

/**
 * Streams a MediaWiki XML export (current or full history) and yields each page with its newest
 * revision. Pauses the input while the consumer falls behind, so multi-GB dumps stay in bounded memory.
 * Pass a stream with `setEncoding("utf8")` so multi-byte characters are never split across chunks.
 */
export async function* parsePages(input: Readable): AsyncGenerator<WikiPage> {
  const parser = sax.parser(true);
  const queue: WikiPage[] = [];
  const path: string[] = [];
  let page: WikiPage | null = null;
  let rev: { timestamp: string; text: string } | null = null;
  let buf = "";
  let finished = false;
  let failure: Error | null = null;
  let wake: (() => void) | null = null;
  const notify = () => {
    const w = wake;
    wake = null;
    w?.();
  };

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
        queue.push(page);
        page = null;
        if (queue.length >= HIGH_WATER) input.pause();
        notify();
      }
    }
    path.pop();
    buf = "";
  };
  parser.onerror = (e) => {
    failure = e;
    notify();
  };

  input.on("data", (chunk: Buffer | string) => {
    try {
      parser.write(chunk.toString());
    } catch (e) {
      failure = e as Error;
      notify();
    }
  });
  input.on("end", () => {
    try {
      parser.close();
    } catch (e) {
      failure = e as Error;
    }
    finished = true;
    notify();
  });
  input.on("error", (e) => {
    failure = e;
    notify();
  });

  try {
    while (true) {
      if (queue.length > 0) {
        yield queue.shift()!;
        if (queue.length <= LOW_WATER && input.isPaused()) input.resume();
        continue;
      }
      if (failure) throw failure;
      if (finished) return;
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  } finally {
    input.destroy();
  }
}
