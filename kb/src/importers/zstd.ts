import { Decompress } from "fzstd";
import { Readable } from "node:stream";

/** zstd-decompresses `input` with backpressure: the source pauses whenever the output is full. */
export function zstdDecompress(input: Readable): Readable {
  let ended = false;
  const end = () => {
    if (!ended) {
      ended = true;
      out.push(null);
    }
  };
  const out = new Readable({
    read() {
      input.resume();
    },
  });
  const d = new Decompress((chunk, final) => {
    if (chunk.length > 0 && !out.push(Buffer.from(chunk))) input.pause();
    if (final) end();
  });
  input.on("data", (c: Buffer) => {
    try {
      d.push(new Uint8Array(c));
    } catch (e) {
      out.destroy(e as Error);
    }
  });
  input.on("end", () => {
    try {
      d.push(new Uint8Array(0), true);
    } catch (e) {
      out.destroy(e as Error);
      return;
    }
    end();
  });
  input.on("error", (e) => out.destroy(e));
  return out;
}
