import {
  hashFinanceCommandPayload,
  type FinanceAuthorizationPayloadHash
} from "../../finance-authorization/canonical-command-payload";
import type { Money } from "../../money";
import {
  assertFinancePostingInstantEqual,
  assertFinancePostingMoneyEqual,
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingIdentifier,
  readFinancePostingInstant,
  readFinancePostingMoney,
  readFinancePostingVersion
} from "./posting-codec";
import {
  assertBankReclassificationAuthorizationBinding,
  readBankSuspenseOriginalUnknown,
  readUnverifiedBankReclassificationApprovalBinding
} from "./bank-reclassification-approval-binding";
import { assertUnverifiedBankSuspenseExposureBinding } from "./bank-suspense-exposure-binding";
import { readFinanceJournalPostingContext } from "./posting-event-identity";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import { readBankSuspenseReclassificationTarget } from "./bank-suspense-target-resolution";
import type { BankSuspenseReclassificationTarget } from "./bank-suspense-reclassification-types";

export function readBankSuspenseReclassification(
  input: unknown,
  expectedDirection: "debit" | "credit",
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): {
  readonly context: ReturnType<typeof readFinanceJournalPostingContext>;
  readonly authorityId: string;
  readonly version: number;
  readonly authorityDigest: FinanceAuthorizationPayloadHash;
  readonly sourceEvidenceRef: Readonly<{
    kind: string;
    evidenceId: string;
    canonicalDigest: FinanceAuthorizationPayloadHash;
  }>;
  readonly bankCashPoolId: string;
  readonly amount: Money;
  readonly target: BankSuspenseReclassificationTarget;
} {
  const decoderEnvelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  const root = readExactDataRecord(input, ["context", "authority"]);
  const context = readFinanceJournalPostingContext(root.context, decoderEnvelope);
  const fields = readExactDataRecord(root.authority, [
    "kind",
    "authorityId",
    "version",
    "operationId",
    "direction",
    "bankCashPoolId",
    "amount",
    "approvedAt",
    "originalUnknown",
    "approvalBinding",
    "target"
  ]);
  if (
    fields.kind !== "unverified_bank_suspense_reclassification_binding" ||
    fields.direction !== expectedDirection
  ) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  const authorityId = readFinancePostingIdentifier(fields.authorityId);
  const version = readFinancePostingVersion(fields.version);
  const operationId = readFinancePostingIdentifier(fields.operationId);
  const bankCashPoolId = readFinancePostingIdentifier(fields.bankCashPoolId);
  const amount = readFinancePostingMoney(fields.amount);
  const approvedAt = readFinancePostingInstant(fields.approvedAt);
  const target = readBankSuspenseReclassificationTarget(fields.target, amount, decoderEnvelope);
  const original = readBankSuspenseOriginalUnknown(
    fields.originalUnknown,
    expectedDirection,
    decoderEnvelope
  );
  const approval = readUnverifiedBankReclassificationApprovalBinding(
    fields.approvalBinding,
    decoderEnvelope
  );

  assertOperationSource(
    context,
    operationId,
    original.bankStatementEntryId,
    "bank",
    "suspense_reclassified"
  );
  if (original.bankCashPoolId !== bankCashPoolId || original.direction !== expectedDirection) {
    throw new FinancePostingIntegrityError("scope_mismatch");
  }
  assertFinancePostingMoneyEqual(amount, original.amount, "amount_mismatch");
  if (compareFinancePostingInstants(approvedAt, original.postedAt) < 0) {
    throw new FinancePostingIntegrityError("invalid_chronology");
  }
  const approvalPayload = Object.freeze({
    kind: "bank_suspense_reclassification" as const,
    authorityId,
    authorityVersion: version,
    operationId,
    direction: expectedDirection,
    bankCashPoolId,
    amount,
    approvedAt,
    originalUnknown: original,
    target
  });
  const approvalPayloadHash = hashFinanceCommandPayload(approvalPayload);
  assertBankReclassificationAuthorizationBinding(
    approval,
    original,
    approvalPayloadHash,
    decoderEnvelope
  );
  assertFinancePostingInstantEqual(approvedAt, approval.issuedAt, "evidence_mismatch");
  assertFinancePostingInstantEqual(context.occurredAt, approvedAt, "authority_mismatch");
  assertUnverifiedBankSuspenseExposureBinding(
    target,
    bankCashPoolId,
    amount,
    approvedAt,
    decoderEnvelope
  );
  if (
    context.journalTransactionId === original.journalTransactionId ||
    operationId === original.operationId ||
    compareFinancePostingInstants(context.postedAt, approvedAt) < 0
  ) {
    throw new FinancePostingIntegrityError("invalid_chronology");
  }

  const authorityDigest = hashFinanceCommandPayload({
    kind: "unverified_bank_suspense_reclassification_binding",
    authorityId,
    version,
    operationId,
    direction: expectedDirection,
    bankCashPoolId,
    amount,
    approvedAt,
    originalUnknown: original,
    approvalBinding: approval,
    target
  });
  return Object.freeze({
    context,
    authorityId,
    version,
    authorityDigest,
    sourceEvidenceRef: Object.freeze({
      kind: approval.kind,
      evidenceId: approval.bindingId,
      canonicalDigest: approval.bindingDigest
    }),
    bankCashPoolId,
    amount,
    target
  });
}

function assertOperationSource(
  context: ReturnType<typeof readFinanceJournalPostingContext>,
  operationId: string,
  expectedSourceId: string,
  expectedKind: string,
  expectedOperation: string
): void {
  if (
    context.operationId !== operationId ||
    context.sourceKey.sourceId !== expectedSourceId ||
    context.sourceKey.kind !== expectedKind ||
    context.sourceKey.operation !== expectedOperation
  ) {
    throw new FinancePostingIntegrityError("source_mismatch");
  }
}
