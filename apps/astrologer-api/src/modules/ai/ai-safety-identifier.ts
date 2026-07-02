import { createHash } from "node:crypto";

export function createAiSafetyIdentifier(ownerUserId: string): string {
  return `eh_${createHash("sha256").update(ownerUserId).digest("hex").slice(0, 61)}`;
}
