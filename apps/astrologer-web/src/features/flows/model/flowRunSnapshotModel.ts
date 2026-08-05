import type { FlowRunSnapshot } from "@elevenhouse/contracts";

export function flowRunClientUserId(snapshot: FlowRunSnapshot): string | null {
  return snapshot.subject.clientUserId;
}
