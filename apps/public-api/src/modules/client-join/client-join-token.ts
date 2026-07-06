import { createHash } from "node:crypto";

export function hashClientJoinIntentToken(token: string): string {
  return `sha256:${createHash("sha256").update(token, "utf8").digest("hex")}`;
}
