import { Temporal } from "@js-temporal/polyfill";
import {
  normalizeWalletProjectionDecoderEnvelope,
  readWalletOperationExactDataRecord,
  walletOperationFail,
  walletOperationIntegrityBoundary
} from "./wallet-operation-codec-boundary";
import {
  normalizeWalletOperationDigest,
  normalizeWalletOperationIdentifier,
  normalizeWalletOperationInstant,
  normalizeWalletOperationUnsignedDecimal,
  projectWalletOperationRecord,
  walletOperationSha256,
  walletOperationUnsignedDecimalFitsSafeMaximum
} from "./wallet-operation-codec-primitives";
import type {
  UnverifiedWalletProjectionLimitPolicySnapshot,
  UnverifiedWalletProjectionLimitPolicySnapshotInput,
  WalletProjectionDecoderEnvelope
} from "./wallet-operation-snapshot-types";

const policyInputKeys = [
  "policyId",
  "version",
  "effectiveAt",
  "maxEconomicEdgesPerOperation",
  "maxAuthorityRefsPerOperation"
] as const;
const policyKeys = [...policyInputKeys, "canonicalDigest"] as const;

export function createUnverifiedWalletProjectionLimitPolicySnapshot(
  input: unknown,
  decoderEnvelope: WalletProjectionDecoderEnvelope
): UnverifiedWalletProjectionLimitPolicySnapshot {
  return walletOperationIntegrityBoundary(() => {
    const envelope = normalizeWalletProjectionDecoderEnvelope(decoderEnvelope);
    const core = normalizeLimitPolicyCore(input, envelope);
    return Object.freeze({ ...core, canonicalDigest: walletOperationSha256(core) });
  });
}

export function rehydrateUnverifiedWalletProjectionLimitPolicySnapshot(
  input: unknown,
  decoderEnvelope: WalletProjectionDecoderEnvelope
): UnverifiedWalletProjectionLimitPolicySnapshot {
  return walletOperationIntegrityBoundary(() => {
    const envelope = normalizeWalletProjectionDecoderEnvelope(decoderEnvelope);
    return rehydrateWalletProjectionLimitPolicySnapshotCore(input, envelope);
  });
}

export function normalizeResolvedWalletProjectionLimitPolicy(
  input: unknown,
  envelope: WalletProjectionDecoderEnvelope
): UnverifiedWalletProjectionLimitPolicySnapshot {
  if (input === undefined || input === null) walletOperationFail("resolved_policy_required");
  return rehydrateWalletProjectionLimitPolicySnapshotCore(input, envelope);
}

export function rehydrateWalletProjectionLimitPolicySnapshotCore(
  input: unknown,
  envelope: WalletProjectionDecoderEnvelope
): UnverifiedWalletProjectionLimitPolicySnapshot {
  const fields = readWalletOperationExactDataRecord(input, policyKeys);
  const core = normalizeLimitPolicyCore(
    projectWalletOperationRecord(fields, policyInputKeys),
    envelope
  );
  const canonicalDigest = normalizeWalletOperationDigest(fields.canonicalDigest);
  if (canonicalDigest !== walletOperationSha256(core)) walletOperationFail("digest_mismatch");
  return Object.freeze({ ...core, canonicalDigest });
}

export function assertWalletProjectionResolvedPolicy(
  embeddedPolicy: UnverifiedWalletProjectionLimitPolicySnapshot,
  resolvedPolicy: UnverifiedWalletProjectionLimitPolicySnapshot,
  operationOccurredAt: string
): void {
  for (const key of policyKeys) {
    if (embeddedPolicy[key] !== resolvedPolicy[key]) {
      walletOperationFail("resolved_policy_mismatch");
    }
  }
  if (
    Temporal.Instant.compare(
      Temporal.Instant.from(resolvedPolicy.effectiveAt),
      Temporal.Instant.from(operationOccurredAt)
    ) > 0
  ) {
    walletOperationFail("policy_not_effective");
  }
}

function normalizeLimitPolicyCore(
  input: unknown,
  envelope: WalletProjectionDecoderEnvelope
): UnverifiedWalletProjectionLimitPolicySnapshotInput {
  const fields = readWalletOperationExactDataRecord(input, policyInputKeys);
  const version = normalizeWalletOperationUnsignedDecimal(fields.version, envelope);
  const maxEconomicEdgesPerOperation = normalizeWalletOperationUnsignedDecimal(
    fields.maxEconomicEdgesPerOperation,
    envelope
  );
  const maxAuthorityRefsPerOperation = normalizeWalletOperationUnsignedDecimal(
    fields.maxAuthorityRefsPerOperation,
    envelope
  );
  if (
    !walletOperationUnsignedDecimalFitsSafeMaximum(
      maxEconomicEdgesPerOperation,
      envelope.maxEconomicEdges
    ) ||
    !walletOperationUnsignedDecimalFitsSafeMaximum(
      maxAuthorityRefsPerOperation,
      envelope.maxAuthorityRefs
    )
  ) {
    walletOperationFail("decoder_envelope_exceeded");
  }
  return Object.freeze({
    policyId: normalizeWalletOperationIdentifier(fields.policyId),
    version,
    effectiveAt: normalizeWalletOperationInstant(fields.effectiveAt),
    maxEconomicEdgesPerOperation,
    maxAuthorityRefsPerOperation
  });
}
