import { describe, expect, it } from "vitest";

import {
  BankStatementIngestionPersistenceError,
  normalizeBankStatementIngestionCommand
} from "./drizzle-bank-statement-ingestion-uow";

const digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("bank statement ingestion command boundary", () => {
  it("preserves the decoder checkpoint and rejects a statement without it", () => {
    expect(normalizeBankStatementIngestionCommand(command())).toMatchObject({
      bankCashPoolId: "bank-pool-rub-1",
      expectedStatementImportVersion: "1",
      evidence: { sourceCheckpoint: "bank-export:2026-08-06:001", amountMinor: "1000" }
    });

    const missingCheckpoint = command();
    delete (missingCheckpoint.evidence as Record<string, unknown>).sourceCheckpoint;
    expectInvalid(() => normalizeBankStatementIngestionCommand(missingCheckpoint));
  });

  it("fails before persistence when the artifact exceeds the server-resolved policy", () => {
    const input = command();
    (input.evidence.artifact as Record<string, unknown>).byteLength = 1025;
    (input.operationEnvelope as Record<string, unknown>).maximumArtifactBytes = 1024;
    expectInvalid(() => normalizeBankStatementIngestionCommand(input));
  });
});

function command() {
  return {
    bankCashPoolId: "bank-pool-rub-1",
    expectedStatementImportVersion: "1",
    evidence: {
      kind: "verified_bank_statement_evidence",
      bankCashPoolId: "bank-pool-rub-1",
      bankStatementEntryId: "statement-entry-1",
      sourceStatementId: "statement-2026-08-06",
      sourceCheckpoint: "bank-export:2026-08-06:001",
      sourceRowId: "row-1",
      direction: "debit",
      amountMinor: "1000",
      currency: "RUB",
      occurredAt: "2026-08-06T10:00:00.000Z",
      bankReference: "manual-bank-reference-1",
      artifact: {
        artifactId: "bank-statement-artifact-1",
        sha256Digest: digest,
        byteLength: 1024,
        bankCashPoolId: "bank-pool-rub-1",
        statementSourceFingerprint: digest
      }
    },
    operationEnvelope: {
      kind: "resolved_finance_operation_envelope",
      policyId: "bank-statement-ingestion",
      policyVersion: 1,
      policyDigest: digest,
      maximumRows: 1,
      maximumDecimalDigits: 38,
      maximumArtifactBytes: 1024
    }
  };
}

function expectInvalid(callback: () => unknown) {
  try {
    callback();
  } catch (error) {
    expect(error).toBeInstanceOf(BankStatementIngestionPersistenceError);
    expect(error).toMatchObject({
      code: "bank_statement_ingestion_persistence_error",
      reason: "invalid_command"
    } satisfies Partial<BankStatementIngestionPersistenceError>);
    return;
  }
  throw new Error("Expected invalid bank-statement command to throw");
}
