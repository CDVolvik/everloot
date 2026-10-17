import { authorizedOwners, completionFactsOf } from "../../../kb/src/completion-rollup";
import type { CompletionFacts } from "../../../kb/src/completion";
import { sharingStore, uploadStore } from "./upload-store";

/**
 * What the completion page and the MCP tool read: the agreed catalog (computed once per rollup the store
 * hands out) and owned progress for the installs whose grant is live right now. Null when the rollup could
 * not be read, which is unrecorded, not zero.
 */
export async function loadCompletion(): Promise<{ facts: CompletionFacts; dataAsOf: string | null } | null> {
  const read = await uploadStore.loadCompletion();
  if (!read.state) return null;
  const owners = authorizedOwners(read.state, await sharingStore.loadState(), new Date());
  return { facts: completionFactsOf(read.state, owners), dataAsOf: read.dataAsOf };
}
