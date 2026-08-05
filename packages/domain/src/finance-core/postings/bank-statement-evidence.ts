import type { FinanceAuthorizationPayloadHash } from "../../finance-authorization/canonical-command-payload";
import type { Money } from "../../money";
import {
  assertFinancePostingMoneyEqual,
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingInstant,
  readFinancePostingMoney,
  readFinancePostingVersion
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";

export type BankStatementClassificationPath = "direct_match" | "unknown_then_reclassification";

export type BankStatementEntryEvidence = Readonly<{
  kind: "bank_statement_entry";
  classificationPath: BankStatementClassificationPath;
  classificationAuthorityId: string;
  classificationVersion: number;
  evidenceId: string;
  evidenceDigest: FinanceAuthorizationPayloadHash;
  bankStatementEntryId: string;
  bankCashPoolId: string;
  direction: "debit" | "credit";
  amount: Money;
  bookedAt: string;
  observedAt: string;
  sourceCheckpointId: string;
}>;

export function readBankStatementEntryEvidence(
  input: unknown,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): {
  readonly kind: "bank_statement_entry";
  readonly classificationPath: BankStatementClassificationPath;
  readonly classificationAuthorityId: string;
  readonly classificationVersion: number;
  readonly evidenceId: string;
  readonly evidenceDigest: FinanceAuthorizationPayloadHash;
  readonly bankStatementEntryId: string;
  readonly bankCashPoolId: string;
  readonly direction: "debit" | "credit";
  readonly amount: Money;
  readonly bookedAt: string;
  readonly observedAt: string;
  readonly sourceCheckpointId: string;
} {
  normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  const fields = readExactDataRecord(input, [
    "kind",
    "classificationPath",
    "classificationAuthorityId",
    "classificationVersion",
    "evidenceId",
    "evidenceDigest",
    "bankStatementEntryId",
    "bankCashPoolId",
    "direction",
    "amount",
    "bookedAt",
    "observedAt",
    "sourceCheckpointId"
  ]);
  if (
    fields.kind !== "bank_statement_entry" ||
    (fields.classificationPath !== "direct_match" &&
      fields.classificationPath !== "unknown_then_reclassification") ||
    (fields.direction !== "debit" && fields.direction !== "credit")
  ) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  const evidenceId = readFinancePostingIdentifier(fields.evidenceId);
  const evidenceDigest = readFinancePostingDigest(fields.evidenceDigest);
  const bankStatementEntryId = readFinancePostingIdentifier(fields.bankStatementEntryId);
  const sourceCheckpointId = readFinancePostingIdentifier(fields.sourceCheckpointId);
  const bookedAt = readFinancePostingInstant(fields.bookedAt);
  const observedAt = readFinancePostingInstant(fields.observedAt);
  if (compareFinancePostingInstants(observedAt, bookedAt) < 0) {
    throw new FinancePostingIntegrityError("invalid_chronology");
  }
  return Object.freeze({
    kind: "bank_statement_entry",
    classificationPath: fields.classificationPath,
    classificationAuthorityId: readFinancePostingIdentifier(fields.classificationAuthorityId),
    classificationVersion: readFinancePostingVersion(fields.classificationVersion),
    evidenceId,
    evidenceDigest,
    bankStatementEntryId,
    bankCashPoolId: readFinancePostingIdentifier(fields.bankCashPoolId),
    direction: fields.direction,
    amount: readFinancePostingMoney(fields.amount),
    bookedAt,
    observedAt,
    sourceCheckpointId
  });
}

export function assertBankStatementClassification(
  evidence: ReturnType<typeof readBankStatementEntryEvidence>,
  expected: {
    readonly classificationPath: BankStatementClassificationPath;
    readonly classificationAuthorityId: string;
    readonly classificationVersion: number;
    readonly bankCashPoolId: string;
    readonly direction: "debit" | "credit";
    readonly amount: Money;
  },
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): void {
  normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  if (
    evidence.classificationPath !== expected.classificationPath ||
    evidence.classificationAuthorityId !== expected.classificationAuthorityId ||
    evidence.classificationVersion !== expected.classificationVersion
  ) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  if (
    evidence.bankCashPoolId !== expected.bankCashPoolId ||
    evidence.direction !== expected.direction
  ) {
    throw new FinancePostingIntegrityError("scope_mismatch");
  }
  assertFinancePostingMoneyEqual(evidence.amount, expected.amount, "amount_mismatch");
}
