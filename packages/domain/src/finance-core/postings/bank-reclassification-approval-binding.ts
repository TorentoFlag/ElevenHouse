import {
  hashFinanceCommandPayload,
  type FinanceAuthorizationPayloadHash
} from "../../finance-authorization/canonical-command-payload";
import {
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingInstant,
  readFinancePostingMoney,
  readFinancePostingUnsignedDecimal,
  readFinancePostingVersion
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import type {
  BankSuspenseReclassificationOriginalUnknown,
  UnverifiedBankReclassificationApprovalBinding,
  UnverifiedConsumedBankStatementMatchAuthorizationBinding
} from "./bank-suspense-reclassification-types";

export function readBankSuspenseOriginalUnknown(
  input: unknown,
  expectedDirection: "debit" | "credit",
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): BankSuspenseReclassificationOriginalUnknown {
  normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  const fields = readExactDataRecord(input, [
    "classificationPath",
    "classificationAuthorityId",
    "classificationVersion",
    "journalTransactionId",
    "journalTransactionDigest",
    "occurredAt",
    "postedAt",
    "operationId",
    "sourceKey",
    "evidenceId",
    "evidenceDigest",
    "bankStatementEntryId",
    "bankCashPoolId",
    "direction",
    "amount"
  ]);
  if (
    fields.classificationPath !== "unknown_then_reclassification" ||
    fields.direction !== expectedDirection
  ) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  const classificationAuthorityId = readFinancePostingIdentifier(fields.classificationAuthorityId);
  const classificationVersion = readFinancePostingVersion(fields.classificationVersion);
  const journalTransactionId = readFinancePostingIdentifier(fields.journalTransactionId);
  const journalTransactionDigest = readFinancePostingDigest(fields.journalTransactionDigest);
  const occurredAt = readFinancePostingInstant(fields.occurredAt);
  const postedAt = readFinancePostingInstant(fields.postedAt);
  if (compareFinancePostingInstants(postedAt, occurredAt) < 0) {
    throw new FinancePostingIntegrityError("invalid_chronology");
  }
  const operationId = readFinancePostingIdentifier(fields.operationId);
  const evidenceId = readFinancePostingIdentifier(fields.evidenceId);
  const evidenceDigest = readFinancePostingDigest(fields.evidenceDigest);
  const bankStatementEntryId = readFinancePostingIdentifier(fields.bankStatementEntryId);
  const source = readExactDataRecord(fields.sourceKey, ["kind", "sourceId", "operation"]);
  const expectedOperation =
    expectedDirection === "debit" ? "unknown_debit_recorded" : "unknown_credit_recorded";
  if (
    source.kind !== "bank" ||
    source.sourceId !== bankStatementEntryId ||
    source.operation !== expectedOperation
  ) {
    throw new FinancePostingIntegrityError("source_mismatch");
  }
  return Object.freeze({
    classificationPath: "unknown_then_reclassification",
    classificationAuthorityId,
    classificationVersion,
    journalTransactionId,
    journalTransactionDigest,
    occurredAt,
    postedAt,
    operationId,
    sourceKey: Object.freeze({
      kind: "bank",
      sourceId: bankStatementEntryId,
      operation: expectedOperation
    }),
    evidenceId,
    evidenceDigest,
    bankStatementEntryId,
    bankCashPoolId: readFinancePostingIdentifier(fields.bankCashPoolId),
    direction: expectedDirection,
    amount: readFinancePostingMoney(fields.amount)
  });
}

export function readUnverifiedBankReclassificationApprovalBinding(
  input: unknown,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): UnverifiedBankReclassificationApprovalBinding {
  const decoderEnvelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  const fields = readExactDataRecord(input, [
    "kind",
    "bindingId",
    "version",
    "authorizationStatus",
    "digestPurpose",
    "payloadHash",
    "makerBinding",
    "checkerBinding",
    "issuedAt",
    "bindingDigest"
  ]);
  if (
    fields.kind !== "bank_reclassification_approval_binding" ||
    fields.authorizationStatus !== "unverified" ||
    fields.digestPurpose !== "drift_detection_only"
  ) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  const version = readPositiveDecimalVersion(fields.version, decoderEnvelope.maxDecimalDigits);
  const makerBinding = readUnverifiedConsumedBankStatementMatchAuthorizationBinding(
    fields.makerBinding
  );
  const checkerBinding = readUnverifiedConsumedBankStatementMatchAuthorizationBinding(
    fields.checkerBinding
  );
  const issuedAt = readFinancePostingInstant(fields.issuedAt);
  if (
    makerBinding.authorizationId === checkerBinding.authorizationId ||
    makerBinding.actorUserId === checkerBinding.actorUserId ||
    compareFinancePostingInstants(checkerBinding.consumedAt, makerBinding.consumedAt) < 0 ||
    compareFinancePostingInstants(issuedAt, checkerBinding.consumedAt) < 0
  ) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  const core = Object.freeze({
    kind: "bank_reclassification_approval_binding" as const,
    bindingId: readFinancePostingIdentifier(fields.bindingId),
    version,
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    payloadHash: readFinancePostingDigest(fields.payloadHash),
    makerBinding,
    checkerBinding,
    issuedAt
  });
  const bindingDigest = readFinancePostingDigest(fields.bindingDigest);
  if (bindingDigest !== hashFinanceCommandPayload(core)) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  return Object.freeze({ ...core, bindingDigest });
}

export function assertBankReclassificationAuthorizationBinding(
  binding: UnverifiedBankReclassificationApprovalBinding,
  original: BankSuspenseReclassificationOriginalUnknown,
  expectedPayloadHash: FinanceAuthorizationPayloadHash,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): void {
  normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  for (const authorization of [binding.makerBinding, binding.checkerBinding]) {
    if (
      authorization.aggregateId !== original.bankStatementEntryId ||
      authorization.expectedVersion !== original.classificationVersion ||
      authorization.payloadHash !== expectedPayloadHash
    ) {
      throw new FinancePostingIntegrityError("authority_mismatch");
    }
  }
  if (binding.payloadHash !== expectedPayloadHash) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
}

function readUnverifiedConsumedBankStatementMatchAuthorizationBinding(
  input: unknown
): UnverifiedConsumedBankStatementMatchAuthorizationBinding {
  const fields = readExactDataRecord(input, [
    "authorizationId",
    "actorUserId",
    "actionKind",
    "aggregateId",
    "expectedVersion",
    "payloadHash",
    "claimedStatus",
    "consumedAt"
  ]);
  if (fields.actionKind !== "bank_statement_match" || fields.claimedStatus !== "consumed") {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  return Object.freeze({
    authorizationId: readFinancePostingIdentifier(fields.authorizationId),
    actorUserId: readFinancePostingIdentifier(fields.actorUserId),
    actionKind: "bank_statement_match",
    aggregateId: readFinancePostingIdentifier(fields.aggregateId),
    expectedVersion: readFinancePostingVersion(fields.expectedVersion),
    payloadHash: readFinancePostingDigest(fields.payloadHash),
    claimedStatus: "consumed",
    consumedAt: readFinancePostingInstant(fields.consumedAt)
  });
}

function readPositiveDecimalVersion(input: unknown, maximumDigits: number): string {
  const value = readFinancePostingUnsignedDecimal(input, maximumDigits);
  if (BigInt(value) === 0n) {
    throw new FinancePostingIntegrityError("invalid_version");
  }
  return value;
}
