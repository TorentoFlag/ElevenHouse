import {
  canonicalizeFinanceCommandPayload,
  hashFinanceCommandPayload,
  type FinanceAuthorizationPayloadHash
} from "../finance-authorization/canonical-command-payload";

export const FINANCE_CANONICAL_DIGEST_ALGORITHM = "sha256" as const;
export const FINANCE_CANONICAL_DIGEST_SCHEMA_VERSION = 1 as const;

export type FinanceCanonicalDigestV1 = FinanceAuthorizationPayloadHash;

export function digestFinanceCanonicalValueV1(value: unknown): FinanceCanonicalDigestV1 {
  return hashFinanceCommandPayload(value);
}

export function sameFinanceCanonicalValueV1(left: unknown, right: unknown): boolean {
  const leftBytes = canonicalizeFinanceCommandPayload(left);
  const rightBytes = canonicalizeFinanceCommandPayload(right);
  if (leftBytes.byteLength !== rightBytes.byteLength) return false;
  for (let index = 0; index < leftBytes.byteLength; index += 1) {
    if (leftBytes[index] !== rightBytes[index]) return false;
  }
  return true;
}
