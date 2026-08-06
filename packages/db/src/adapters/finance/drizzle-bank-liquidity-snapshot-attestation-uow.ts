import {
  BankLiquiditySnapshotAttestationIssuanceError,
  createBankLiquiditySnapshotAttestationAuthorizationPayload,
  issueVerifiedBankLiquiditySnapshotEvidence,
  type AttestBankLiquiditySnapshotCommand,
  type BankLiquiditySnapshotAttestationCommitReceipt,
  type BankLiquiditySnapshotAttestationUnitOfWork
} from "@elevenhouse/domain/finance-core";

import { financeBankLiquidityAttestationReceipts } from "../../schema/finance/bank-liquidity.schema";
import type { FinanceDatabase, FinanceTransaction } from "./drizzle-finance-command-store";

export class BankLiquiditySnapshotAttestationPersistenceError extends Error {
  readonly code = "bank_liquidity_snapshot_attestation_persistence_error";

  constructor(
    readonly reason:
      | "invalid_command"
      | "attestation_conflict"
      | "attestation_dependency_missing"
      | "attestation_binding_invalid"
      | "retryable_concurrency_conflict"
      | "persistence_write_incomplete"
  ) {
    super("Bank liquidity snapshot attestation could not be persisted safely");
    this.name = "BankLiquiditySnapshotAttestationPersistenceError";
  }
}

/**
 * Persists the exact manual-bank attestation before its evidence can be adopted as payout
 * liquidity. The caller composes this UOW with `executeAuthorized`, so the consumed passkey grant
 * and this receipt are one outer transaction.
 */
export function createDrizzleBankLiquiditySnapshotAttestationUnitOfWork(input: {
  readonly database: FinanceDatabase;
}): BankLiquiditySnapshotAttestationUnitOfWork {
  return Object.freeze({
    async attestBankLiquiditySnapshot(command) {
      try {
        createBankLiquiditySnapshotAttestationAuthorizationPayload(command);
        return await input.database.transaction((transaction) => attestInTransaction(transaction, command));
      } catch (error) {
        if (error instanceof BankLiquiditySnapshotAttestationPersistenceError) throw error;
        if (error instanceof BankLiquiditySnapshotAttestationIssuanceError) fail("invalid_command");
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("attestation_conflict");
        if (code === "23503") fail("attestation_dependency_missing");
        if (code === "23514") fail("attestation_binding_invalid");
        throw error;
      }
    }
  } satisfies BankLiquiditySnapshotAttestationUnitOfWork);
}

async function attestInTransaction(
  transaction: FinanceTransaction,
  command: AttestBankLiquiditySnapshotCommand
): Promise<BankLiquiditySnapshotAttestationCommitReceipt> {
  const [receipt] = await transaction
    .insert(financeBankLiquidityAttestationReceipts)
    .values({
      attestationId: command.attestationId,
      bankCashPoolId: command.bankCashPoolId,
      currency: command.currency,
      expectedBankLiquidityRevision: command.expectedBankLiquidityRevision,
      unrestrictedAvailableMinor: command.unrestrictedAvailableMinor,
      sourceCheckpoint: command.sourceCheckpoint,
      asOf: new Date(command.asOf),
      expiresAt: new Date(command.expiresAt),
      evidenceArtifactId: command.evidenceArtifact.artifactId,
      evidenceArtifactDigest: command.evidenceArtifact.sha256Digest,
      authorizationId: command.authorization.authorizationId,
      authorizationPayloadDigest: command.authorization.payloadHash,
      attestedByActorId: command.authorization.actorUserId,
      attestedAt: new Date(command.authorization.verifiedAt)
    })
    .returning();
  if (!receipt) fail("persistence_write_incomplete");
  const ref = {
    kind: "bank_liquidity_snapshot_attestation_receipt",
    attestationId: receipt.attestationId,
    version: receipt.attestationVersion,
    canonicalDigest: receipt.canonicalDigest
  } as const;
  const evidence = issueVerifiedBankLiquiditySnapshotEvidence({
    ...command,
    receipt: ref as never
  });
  return Object.freeze({
    ref: ref as BankLiquiditySnapshotAttestationCommitReceipt["ref"],
    bankCashPoolId: receipt.bankCashPoolId,
    currency: "RUB",
    expectedBankLiquidityRevision: receipt.expectedBankLiquidityRevision,
    evidence,
    attestedAt: receipt.attestedAt.toISOString()
  });
}

function postgresCode(error: unknown): string | null {
  let current = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current !== "object" || current === null) return null;
    if ("code" in current && typeof current.code === "string") return current.code;
    current = "cause" in current ? current.cause : null;
  }
  return null;
}

function fail(reason: BankLiquiditySnapshotAttestationPersistenceError["reason"]): never {
  throw new BankLiquiditySnapshotAttestationPersistenceError(reason);
}
