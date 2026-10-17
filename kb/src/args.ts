/**
 * Splits command-line words into `--flag value` pairs and plain arguments. A flag followed by another
 * flag, or by nothing, has an empty value, so a bare `--refresh` or `--dry-run` never swallows the next word.
 */
export function parseArgs(rest: string[]): { flags: Map<string, string>; args: string[] } {
  const flags = new Map<string, string>();
  const args: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith("--")) flags.set(rest[i].slice(2), rest[i + 1] === undefined || rest[i + 1].startsWith("--") ? "" : rest[++i]);
    else args.push(rest[i]);
  }
  return { flags, args };
}
