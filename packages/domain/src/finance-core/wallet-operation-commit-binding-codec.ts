import type { FinanceJournalTransaction } from "./journal";
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
  normalizeWalletOperationSourceKey,
  normalizeWalletOperationUnsignedDecimal,
  projectWalletOperationRecord,
  walletOperationSha256
} from "./wallet-operation-codec-primitives";
import {
  hydrateWalletJournalTransactionCore,
  hydrateWalletStoredSnapshotCore
} from "./wallet-operation-hydration-codec";
import {
  assertWalletProjectionResolvedPolicy,
  normalizeResolvedWalletProjectionLimitPolicy,
  rehydrateWalletProjectionLimitPolicySnapshotCore
} from "./wallet-operation-limit-policy-codec";
import { rehydrateWalletOperationComparisonSnapshotCore } from "./wallet-operation-snapshot-codec";
import type { WalletOperationCommitBindingRecord } from "./wallet-operation-commit-binding-types";
import type {
  UnverifiedWalletOperationComparisonSnapshot,
  UnverifiedWalletProjectionLimitPolicySnapshot,
  WalletProjectionDecoderEnvelope,
  WalletStoredSnapshot
} from "./wallet-operation-snapshot-types";

const bindingInputKeys = [
  "schemaVersion",
  "bindingId",
  "operationSnapshot",
  "journalTransaction",
  "previousWallet",
  "nextWallet",
  "boundAt"
] as const;
const bindingDerivationInputKeys = bindingInputKeys.slice(1);
const bindingKeys = [
  "schemaVersion",
  "authorizationStatus",
  "atomicityStatus",
  "bindingId",
  "operationId",
  "sourceKey",
  "occurredAt",
  "journalTransactionId",
  "journalTransactionDigest",
  "operationSnapshotId",
  "operationSnapshotDigest",
  "unverifiedLimitPolicy",
  "historyRecordDigest",
  "previousLotStateDigest",
  "nextLotStateDigest",
  "previousWalletId",
  "nextWalletId",
  "astrologerUserId",
  "currency",
  "previousWalletRevision",
  "nextWalletRevision",
  "previousWalletSnapshotDigest",
  "nextWalletSnapshotDigest",
  "boundAt",
  "bindingDigest"
] as const;

export function createWalletOperationCommitBindingRecord(
  input: unknown,
  decoderEnvelope: WalletProjectionDecoderEnvelope,
  resolvedPolicy: UnverifiedWalletProjectionLimitPolicySnapshot
): WalletOperationCommitBindingRecord {
  return walletOperationIntegrityBoundary(() => {
    const envelope = normalizeWalletProjectionDecoderEnvelope(decoderEnvelope);
    const policy = normalizeResolvedWalletProjectionLimitPolicy(resolvedPolicy, envelope);
    const fields = readWalletOperationExactDataRecord(input, bindingInputKeys);
    if (fields.schemaVersion !== 1) walletOperationFail("unsupported_schema_version");
    const core = deriveWalletOperationCommitBindingCore({
      bindingId: normalizeWalletOperationIdentifier(fields.bindingId),
      operationSnapshot: rehydrateWalletOperationComparisonSnapshotCore(
        fields.operationSnapshot,
        envelope,
        policy
      ),
      journalTransaction: hydrateWalletJournalTransactionCore(fields.journalTransaction, envelope),
      previousWallet: hydrateWalletStoredSnapshotCore(fields.previousWallet, envelope),
      nextWallet: hydrateWalletStoredSnapshotCore(fields.nextWallet, envelope),
      boundAt: normalizeWalletOperationInstant(fields.boundAt)
    });
    return Object.freeze({ ...core, bindingDigest: walletOperationSha256(core) });
  });
}

export function rehydrateWalletOperationCommitBindingRecord(
  input: unknown,
  decoderEnvelope: WalletProjectionDecoderEnvelope,
  resolvedPolicy: UnverifiedWalletProjectionLimitPolicySnapshot
): WalletOperationCommitBindingRecord {
  return walletOperationIntegrityBoundary(() => {
    const envelope = normalizeWalletProjectionDecoderEnvelope(decoderEnvelope);
    const policy = normalizeResolvedWalletProjectionLimitPolicy(resolvedPolicy, envelope);
    return rehydrateCommitBinding(input, envelope, policy);
  });
}

export function deriveUnverifiedWalletOperationCommitBindingCore(
  input: unknown,
  decoderEnvelope: WalletProjectionDecoderEnvelope,
  resolvedPolicy: UnverifiedWalletProjectionLimitPolicySnapshot
): Omit<WalletOperationCommitBindingRecord, "bindingDigest"> {
  return walletOperationIntegrityBoundary(() => {
    const envelope = normalizeWalletProjectionDecoderEnvelope(decoderEnvelope);
    const policy = normalizeResolvedWalletProjectionLimitPolicy(resolvedPolicy, envelope);
    const fields = readWalletOperationExactDataRecord(input, bindingDerivationInputKeys);
    return deriveWalletOperationCommitBindingCore({
      bindingId: normalizeWalletOperationIdentifier(fields.bindingId),
      operationSnapshot: rehydrateWalletOperationComparisonSnapshotCore(
        fields.operationSnapshot,
        envelope,
        policy
      ),
      journalTransaction: hydrateWalletJournalTransactionCore(fields.journalTransaction, envelope),
      previousWallet: hydrateWalletStoredSnapshotCore(fields.previousWallet, envelope),
      nextWallet: hydrateWalletStoredSnapshotCore(fields.nextWallet, envelope),
      boundAt: normalizeWalletOperationInstant(fields.boundAt)
    });
  });
}

function deriveWalletOperationCommitBindingCore(input: {
  bindingId: string;
  operationSnapshot: UnverifiedWalletOperationComparisonSnapshot;
  journalTransaction: FinanceJournalTransaction;
  previousWallet: WalletStoredSnapshot;
  nextWallet: WalletStoredSnapshot;
  boundAt: string;
}): Omit<WalletOperationCommitBindingRecord, "bindingDigest"> {
  return Object.freeze({
    schemaVersion: 1,
    authorizationStatus: "unverified",
    atomicityStatus: "unverified",
    bindingId: input.bindingId,
    operationId: input.operationSnapshot.operationId,
    sourceKey: input.operationSnapshot.sourceKey,
    occurredAt: input.operationSnapshot.occurredAt,
    journalTransactionId: input.journalTransaction.id,
    journalTransactionDigest: walletOperationSha256(input.journalTransaction),
    operationSnapshotId: input.operationSnapshot.snapshotId,
    operationSnapshotDigest: input.operationSnapshot.snapshotDigest,
    unverifiedLimitPolicy: input.operationSnapshot.unverifiedLimitPolicy,
    historyRecordDigest: input.operationSnapshot.historyRecordDigest,
    previousLotStateDigest: input.operationSnapshot.previousLotStateDigest,
    nextLotStateDigest: input.operationSnapshot.nextLotStateDigest,
    previousWalletId: input.previousWallet.walletId,
    nextWalletId: input.nextWallet.walletId,
    astrologerUserId: input.operationSnapshot.astrologerUserId,
    currency: "RUB",
    previousWalletRevision: input.previousWallet.revision,
    nextWalletRevision: input.nextWallet.revision,
    previousWalletSnapshotDigest: walletOperationSha256(input.previousWallet),
    nextWalletSnapshotDigest: walletOperationSha256(input.nextWallet),
    boundAt: input.boundAt
  });
}

function normalizeBindingCore(
  input: unknown,
  envelope: WalletProjectionDecoderEnvelope,
  resolvedPolicy: UnverifiedWalletProjectionLimitPolicySnapshot
): Omit<WalletOperationCommitBindingRecord, "bindingDigest"> {
  const keys = bindingKeys.slice(0, -1);
  const fields = readWalletOperationExactDataRecord(input, keys);
  if (fields.schemaVersion !== 1) walletOperationFail("unsupported_schema_version");
  if (
    fields.authorizationStatus !== "unverified" ||
    fields.atomicityStatus !== "unverified" ||
    fields.currency !== "RUB"
  ) {
    walletOperationFail("invalid_field");
  }
  const occurredAt = normalizeWalletOperationInstant(fields.occurredAt);
  const unverifiedLimitPolicy = rehydrateWalletProjectionLimitPolicySnapshotCore(
    fields.unverifiedLimitPolicy,
    envelope
  );
  assertWalletProjectionResolvedPolicy(unverifiedLimitPolicy, resolvedPolicy, occurredAt);
  return Object.freeze({
    schemaVersion: 1,
    authorizationStatus: "unverified",
    atomicityStatus: "unverified",
    bindingId: normalizeWalletOperationIdentifier(fields.bindingId),
    operationId: normalizeWalletOperationIdentifier(fields.operationId),
    sourceKey: normalizeWalletOperationSourceKey(fields.sourceKey),
    occurredAt,
    journalTransactionId: normalizeWalletOperationIdentifier(fields.journalTransactionId),
    journalTransactionDigest: normalizeWalletOperationDigest(fields.journalTransactionDigest),
    operationSnapshotId: normalizeWalletOperationIdentifier(fields.operationSnapshotId),
    operationSnapshotDigest: normalizeWalletOperationDigest(fields.operationSnapshotDigest),
    unverifiedLimitPolicy,
    historyRecordDigest: normalizeWalletOperationDigest(fields.historyRecordDigest),
    previousLotStateDigest: normalizeWalletOperationDigest(fields.previousLotStateDigest),
    nextLotStateDigest: normalizeWalletOperationDigest(fields.nextLotStateDigest),
    previousWalletId: normalizeWalletOperationIdentifier(fields.previousWalletId),
    nextWalletId: normalizeWalletOperationIdentifier(fields.nextWalletId),
    astrologerUserId: normalizeWalletOperationIdentifier(fields.astrologerUserId),
    currency: "RUB",
    previousWalletRevision: normalizeWalletOperationUnsignedDecimal(
      fields.previousWalletRevision,
      envelope
    ),
    nextWalletRevision: normalizeWalletOperationUnsignedDecimal(
      fields.nextWalletRevision,
      envelope
    ),
    previousWalletSnapshotDigest: normalizeWalletOperationDigest(
      fields.previousWalletSnapshotDigest
    ),
    nextWalletSnapshotDigest: normalizeWalletOperationDigest(fields.nextWalletSnapshotDigest),
    boundAt: normalizeWalletOperationInstant(fields.boundAt)
  });
}

function rehydrateCommitBinding(
  input: unknown,
  envelope: WalletProjectionDecoderEnvelope,
  resolvedPolicy: UnverifiedWalletProjectionLimitPolicySnapshot
): WalletOperationCommitBindingRecord {
  const fields = readWalletOperationExactDataRecord(input, bindingKeys);
  const core = normalizeBindingCore(
    projectWalletOperationRecord(fields, bindingKeys.slice(0, -1)),
    envelope,
    resolvedPolicy
  );
  const bindingDigest = normalizeWalletOperationDigest(fields.bindingDigest);
  if (bindingDigest !== walletOperationSha256(core)) walletOperationFail("digest_mismatch");
  return Object.freeze({ ...core, bindingDigest });
}
