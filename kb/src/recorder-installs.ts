/**
 * Rows from a Polestar Recorder upload carry an install id the server assigns, `ps-<character>-<address>`: two
 * keyed hashes (16 hex each), one of the uploader's character and one of the address the upload came from. One
 * player can make several of these, with several characters or from several addresses, so before any rule counts
 * installs, Recorder ids that share a character or an address are folded into one voter. For Recorder rows, three
 * agreeing installs then means at least three characters uploading from three addresses. Addon installs are left
 * as they are.
 */

export const RECORDER_INSTALL = /^ps-([0-9a-f]{16})-([0-9a-f]{16})$/;

/** An id only the server gives, to Polestar Recorder rows. Addon ids are hex groups and never start with `ps-`. */
export function isRecorderInstall(installId: unknown): boolean {
  return typeof installId === "string" && installId.startsWith("ps-");
}

/**
 * The rows with every Recorder install id replaced by its voter's: the smallest id among those linked to it through
 * a shared character or address. A row whose voter already sent the same event (the same file uploaded again from
 * another address) is dropped. Order is kept; nothing else changes.
 */
export function foldRecorderInstalls<T extends { installId: string; eventId?: string }>(records: readonly T[]): T[] {
  if (!records.some((row) => isRecorderInstall(row.installId))) return [...records];
  const parent = new Map<string, string>();
  const find = (node: string): string => {
    let root = node;
    while (parent.get(root) !== root) root = parent.get(root)!;
    for (let at = node; at !== root;) { const next = parent.get(at)!; parent.set(at, root); at = next; }
    return root;
  };
  const keys = (installId: string): [string, string] | null => {
    const m = RECORDER_INSTALL.exec(installId);
    return m ? [`c:${m[1]}`, `a:${m[2]}`] : null;
  };
  for (const row of records) {
    const pair = keys(row.installId);
    if (!pair) continue;
    for (const k of pair) if (!parent.has(k)) parent.set(k, k);
    const [a, b] = [find(pair[0]), find(pair[1])];
    if (a !== b) parent.set(a < b ? b : a, a < b ? a : b);
  }
  const voter = new Map<string, string>();
  for (const row of records) {
    const pair = keys(row.installId);
    if (!pair) continue;
    const root = find(pair[0]);
    const current = voter.get(root);
    if (current === undefined || row.installId < current) voter.set(root, row.installId);
  }
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of records) {
    const pair = keys(row.installId);
    // A `ps-` id the server did not shape is not a voter anyone can be folded into: it is left out.
    if (!pair) { if (!isRecorderInstall(row.installId)) out.push(row); continue; }
    const installId = voter.get(find(pair[0]))!;
    const key = JSON.stringify([installId, row.eventId]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(installId === row.installId ? row : { ...row, installId });
  }
  return out;
}
