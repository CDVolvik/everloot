import { pipeline, type Readable } from "node:stream";
import { DecompressStream } from "zstd-napi";

/**
 * The Warcraft Wiki dump's zstd frame header declares windowLog 31 (a 2 GB window), above libzstd's
 * default decoding limit of 27. Decoding it needs up to ~2 GB of memory.
 */
export const WINDOW_LOG_MAX = 31;

/**
 * zstd-decompresses `input` with libzstd (native backpressure, checksum verified). Errors surface on
 * the returned stream; destroying it also destroys `input`, so the file handle closes on early stop.
 */
export function zstdDecompress(input: Readable): Readable {
  return pipeline(input, new DecompressStream({ windowLogMax: WINDOW_LOG_MAX }), () => {
    // errors are delivered to the consumer through the returned stream
  });
}
