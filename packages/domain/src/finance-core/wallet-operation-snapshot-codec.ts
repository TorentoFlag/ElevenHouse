import type { FinanceJournalEntryLinks } from "./journal";
import {
  normalizeWalletProjectionDecoderEnvelope,
  readWalletOperationExactDataArray,
  readWalletOperationExactDataRecord,
  walletOperationFail,
  walletOperationIntegrityBoundary
} from "./wallet-operation-codec-boundary";
import {
  normalizeWalletOperationDigest,
  normalizeWalletOperationIdentifier,
  normalizeWalletOperationInstant,
  normalizeWalletOperationNullableIdentifier,
  normalizeWalletOperationSourceKey,
  normalizeWalletOperationUnsignedDecimal,
  projectWalletOperationRecord,
  walletOperationSha256
} from "./wallet-operation-codec-primitives";
import {
  assertWalletProjectionResolvedPolicy,
  normalizeResolvedWalletProjectionLimitPolicy,
  rehydrateWalletProjectionLimitPolicySnapshotCore
} from "./wallet-operation-limit-policy-codec";
import {
  walletLotBalanceBucketValues,
  type UnverifiedWalletOperationComparisonSnapshot,
  type UnverifiedWalletOperationComparisonSnapshotInput,
  type UnverifiedWalletProjectionLimitPolicySnapshot,
  type WalletLotBalanceBucket,
  type WalletLotEconomicEdge,
  type WalletLotOperationAuthorityRef,
  type WalletProjectionDecoderEnvelope
} from "./wallet-operation-snapshot-types";

const bucketValues = new Set<string>(walletLotBalanceBucketValues);
const snapshotInputKeys = [
  "schemaVersion",
  "authorizationStatus",
  "snapshotId",
  "operationId",
  "sourceKey",
  "occurredAt",
  "astrologerUserId",
  "currency",
  "unverifiedLimitPolicy",
  "previousLotStateDigest",
  "nextLotStateDigest",
  "historyRecordDigest",
  "previousWalletRevision",
  "nextWalletRevision",
  "authorityRefs",
  "economicEdges"
] as const;
const snapshotKeys = [...snapshotInputKeys, "snapshotDigest"] as const;
const authorityRefKeys = ["kind", "authorityId", "version", "canonicalDigest"] as const;
const economicEdgeKeys = ["edgeId", "bucket", "side", "amount", "links"] as const;
const moneyKeys = ["amountMinor", "currency"] as const;
const linksKeys = ["originalSaleId", "componentId", "payableLotId", "payoutAllocationId"] as const;

export function createUnverifiedWalletOperationComparisonSnapshot(
  input: unknown,
  decoderEnvelope: WalletProjectionDecoderEnvelope,
  resolvedPolicy: UnverifiedWalletProjectionLimitPolicySnapshot
): UnverifiedWalletOperationComparisonSnapshot {
  return walletOperationIntegrityBoundary(() => {
    const envelope = normalizeWalletProjectionDecoderEnvelope(decoderEnvelope);
    const policy = normalizeResolvedWalletProjectionLimitPolicy(resolvedPolicy, envelope);
    const core = normalizeOperationSnapshotCore(input, envelope, policy);
    return Object.freeze({ ...core, snapshotDigest: walletOperationSha256(core) });
  });
}

export function rehydrateUnverifiedWalletOperationComparisonSnapshot(
  input: unknown,
  decoderEnvelope: WalletProjectionDecoderEnvelope,
  resolvedPolicy: UnverifiedWalletProjectionLimitPolicySnapshot
): UnverifiedWalletOperationComparisonSnapshot {
  return walletOperationIntegrityBoundary(() => {
    const envelope = normalizeWalletProjectionDecoderEnvelope(decoderEnvelope);
    const policy = normalizeResolvedWalletProjectionLimitPolicy(resolvedPolicy, envelope);
    return rehydrateWalletOperationComparisonSnapshotCore(input, envelope, policy);
  });
}

export function rehydrateWalletOperationComparisonSnapshotCore(
  input: unknown,
  envelope: WalletProjectionDecoderEnvelope,
  resolvedPolicy: UnverifiedWalletProjectionLimitPolicySnapshot
): UnverifiedWalletOperationComparisonSnapshot {
  const fields = readWalletOperationExactDataRecord(input, snapshotKeys);
  const core = normalizeOperationSnapshotCore(
    projectWalletOperationRecord(fields, snapshotInputKeys),
    envelope,
    resolvedPolicy
  );
  const snapshotDigest = normalizeWalletOperationDigest(fields.snapshotDigest);
  if (snapshotDigest !== walletOperationSha256(core)) walletOperationFail("digest_mismatch");
  return Object.freeze({ ...core, snapshotDigest });
}

function normalizeOperationSnapshotCore(
  input: unknown,
  envelope: WalletProjectionDecoderEnvelope,
  resolvedPolicy: UnverifiedWalletProjectionLimitPolicySnapshot
): UnverifiedWalletOperationComparisonSnapshotInput {
  const fields = readWalletOperationExactDataRecord(input, snapshotInputKeys);
  if (fields.schemaVersion !== 1) walletOperationFail("unsupported_schema_version");
  if (fields.authorizationStatus !== "unverified" || fields.currency !== "RUB") {
    walletOperationFail("invalid_field");
  }
  const occurredAt = normalizeWalletOperationInstant(fields.occurredAt);
  const unverifiedLimitPolicy = rehydrateWalletProjectionLimitPolicySnapshotCore(
    fields.unverifiedLimitPolicy,
    envelope
  );
  assertWalletProjectionResolvedPolicy(unverifiedLimitPolicy, resolvedPolicy, occurredAt);
  const authorityRefs = readWalletOperationExactDataArray(
    fields.authorityRefs,
    1,
    unverifiedLimitPolicy.maxAuthorityRefsPerOperation,
    envelope.maxAuthorityRefs
  ).map((authorityRef) => normalizeAuthorityRef(authorityRef, envelope));
  const authorityIdentities = new Set<string>();
  for (const authorityRef of authorityRefs) {
    const identity = JSON.stringify([
      authorityRef.kind,
      authorityRef.authorityId,
      authorityRef.version
    ]);
    if (authorityIdentities.has(identity)) walletOperationFail("invalid_field");
    authorityIdentities.add(identity);
  }
  const economicEdges = readWalletOperationExactDataArray(
    fields.economicEdges,
    0,
    unverifiedLimitPolicy.maxEconomicEdgesPerOperation,
    envelope.maxEconomicEdges
  ).map((edge) => normalizeEconomicEdge(edge));
  return Object.freeze({
    schemaVersion: 1,
    authorizationStatus: "unverified",
    snapshotId: normalizeWalletOperationIdentifier(fields.snapshotId),
    operationId: normalizeWalletOperationIdentifier(fields.operationId),
    sourceKey: normalizeWalletOperationSourceKey(fields.sourceKey),
    occurredAt,
    astrologerUserId: normalizeWalletOperationIdentifier(fields.astrologerUserId),
    currency: "RUB",
    unverifiedLimitPolicy,
    previousLotStateDigest: normalizeWalletOperationDigest(fields.previousLotStateDigest),
    nextLotStateDigest: normalizeWalletOperationDigest(fields.nextLotStateDigest),
    historyRecordDigest: normalizeWalletOperationDigest(fields.historyRecordDigest),
    previousWalletRevision: normalizeWalletOperationUnsignedDecimal(
      fields.previousWalletRevision,
      envelope
    ),
    nextWalletRevision: normalizeWalletOperationUnsignedDecimal(
      fields.nextWalletRevision,
      envelope
    ),
    authorityRefs: Object.freeze(authorityRefs),
    economicEdges: Object.freeze(economicEdges)
  });
}

function normalizeAuthorityRef(
  input: unknown,
  envelope: WalletProjectionDecoderEnvelope
): WalletLotOperationAuthorityRef {
  const fields = readWalletOperationExactDataRecord(input, authorityRefKeys);
  return Object.freeze({
    kind: normalizeWalletOperationIdentifier(fields.kind),
    authorityId: normalizeWalletOperationIdentifier(fields.authorityId),
    version: normalizeWalletOperationUnsignedDecimal(fields.version, envelope),
    canonicalDigest: normalizeWalletOperationDigest(fields.canonicalDigest)
  });
}

function normalizeEconomicEdge(input: unknown): WalletLotEconomicEdge {
  const fields = readWalletOperationExactDataRecord(input, economicEdgeKeys);
  if (typeof fields.bucket !== "string" || !bucketValues.has(fields.bucket)) {
    walletOperationFail("invalid_field");
  }
  if (fields.side !== "debit" && fields.side !== "credit") {
    walletOperationFail("invalid_field");
  }
  const amountFields = readWalletOperationExactDataRecord(fields.amount, moneyKeys);
  if (
    amountFields.currency !== "RUB" ||
    !Number.isSafeInteger(amountFields.amountMinor) ||
    (amountFields.amountMinor as number) <= 0
  ) {
    walletOperationFail("invalid_field");
  }
  return Object.freeze({
    edgeId: normalizeWalletOperationIdentifier(fields.edgeId),
    bucket: fields.bucket as WalletLotBalanceBucket,
    side: fields.side,
    amount: Object.freeze({
      amountMinor: amountFields.amountMinor as number,
      currency: "RUB"
    }),
    links: normalizeLinks(fields.links)
  });
}

function normalizeLinks(input: unknown): FinanceJournalEntryLinks {
  const fields = readWalletOperationExactDataRecord(input, linksKeys);
  return Object.freeze({
    originalSaleId: normalizeWalletOperationNullableIdentifier(fields.originalSaleId),
    componentId: normalizeWalletOperationNullableIdentifier(fields.componentId),
    payableLotId: normalizeWalletOperationNullableIdentifier(fields.payableLotId),
    payoutAllocationId: normalizeWalletOperationNullableIdentifier(fields.payoutAllocationId)
  });
}
