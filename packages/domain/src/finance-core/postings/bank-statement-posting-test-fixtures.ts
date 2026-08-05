import { postingContext, sha } from "./posting-test-primitives";

export function bankStatementEvidence(input: {
  classificationPath: "direct_match" | "unknown_then_reclassification";
  classificationAuthorityId: string;
  classificationVersion: number;
  evidenceId: string;
  evidenceDigest: `sha256:${string}`;
  bankStatementEntryId: string;
  direction: "debit" | "credit";
  amountMinor: number;
  bookedAt: string;
  observedAt: string;
}) {
  return {
    kind: "bank_statement_entry" as const,
    classificationPath: input.classificationPath,
    classificationAuthorityId: input.classificationAuthorityId,
    classificationVersion: input.classificationVersion,
    evidenceId: input.evidenceId,
    evidenceDigest: input.evidenceDigest,
    bankStatementEntryId: input.bankStatementEntryId,
    bankCashPoolId: "bank-pool-rub-1",
    direction: input.direction,
    amount: { amountMinor: input.amountMinor, currency: "RUB" as const },
    bookedAt: input.bookedAt,
    observedAt: input.observedAt,
    sourceCheckpointId: "bank-checkpoint-1"
  };
}

export function unknownStatementAuthority(input: {
  direction: "debit" | "credit";
  authorityId: string;
  operationId: string;
  amountMinor: number;
  bookedAt: string;
  observedAt: string;
}) {
  return {
    kind: "unknown_bank_statement_entry" as const,
    authorityId: input.authorityId,
    version: 1,
    operationId: input.operationId,
    direction: input.direction,
    bankCashPoolId: "bank-pool-rub-1",
    amount: { amountMinor: input.amountMinor, currency: "RUB" as const },
    classifiedAt: input.observedAt,
    evidence: bankStatementEvidence({
      classificationPath: "unknown_then_reclassification",
      classificationAuthorityId: input.authorityId,
      classificationVersion: 1,
      evidenceId: `${input.operationId}-evidence`,
      evidenceDigest: sha(input.direction === "debit" ? "d" : "e"),
      bankStatementEntryId: `${input.operationId}-statement-entry`,
      direction: input.direction,
      amountMinor: input.amountMinor,
      bookedAt: input.bookedAt,
      observedAt: input.observedAt
    })
  };
}

export function validUnknownCreditInput() {
  return {
    context: postingContext(
      "journal-unknown-credit-validation",
      "proof-unknown-credit-validation",
      "unknown-credit-validation-operation",
      {
        kind: "bank",
        sourceId: "unknown-credit-validation-operation-statement-entry",
        operation: "unknown_credit_recorded"
      },
      "2026-08-05T08:00:00Z",
      "2026-08-05T08:03:00Z"
    ),
    authority: unknownStatementAuthority({
      direction: "credit",
      authorityId: "unknown-credit-validation-authority",
      operationId: "unknown-credit-validation-operation",
      amountMinor: 5_000_000,
      bookedAt: "2026-08-05T08:00:00Z",
      observedAt: "2026-08-05T08:02:00Z"
    })
  };
}
