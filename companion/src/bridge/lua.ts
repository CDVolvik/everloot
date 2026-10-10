/**
 * A Lua 5.1 double-quoted string literal for text the game will load. Quotes, backslashes and every
 * control byte are escaped (control bytes as three-digit \ddd), so no input can end the string early
 * or become code. UTF-8 above the control range passes through; the client renders it.
 */
export function luaString(text: string): string {
  let out = '"';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\n") out += "\\n";
    else if (code < 32 || code === 127) out += `\\${String(code).padStart(3, "0")}`;
    else out += ch;
  }
  return `${out}"`;
}

/** Adler-32 over UTF-8 bytes: the addon can verify it with Lua 5.1 arithmetic alone (no bit library). */
export function adler32(text: string): number {
  let a = 1;
  let b = 0;
  for (const byte of new TextEncoder().encode(text)) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return b * 65536 + a;
}
