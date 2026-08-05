import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import type { Money } from "../../money";
import type { RefundConfirmedAuthority, RefundFailedAuthority } from "../source-lot-types";
import {
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingInstant,
  readFinancePostingVersion,
  readOwnDataDiscriminator
} from "./posting-codec";
import type {
  RefundCanonicalProviderEvidence,
  RefundProviderTerminalIntentProjection,
  RefundTerminalOutcome
} from "./refund-posting-types";
import { readRefundPostingMoney, readRefundProviderAccount } from "./refund-posting-value-codec";

export function readRefundProviderIntent(input: unknown): RefundProviderTerminalIntentProjection {
  const fields = readExactDataRecord(input, [
    "kind",
    "intentId",
    "version",
    "providerAccount",
    "purpose",
    "operationKind",
    "source",
    "providerPaymentId",
    "canonicalRequestDigest",
    "status",
    "canonicalEvidence",
    "projectionDigest"
  ]);
  const source = readExactDataRecord(fields.source, ["kind", "id"]);
  if (
    fields.kind !== "refund_provider_terminal_intent" ||
    fields.purpose !== "client_order" ||
    fields.operationKind !== "refund" ||
    source.kind !== "client_order" ||
    (fields.status !== "succeeded" && fields.status !== "failed")
  )
    fail("evidence_mismatch");
  const core = Object.freeze({
    kind: "refund_provider_terminal_intent" as const,
    intentId: id(fields.intentId),
    version: readFinancePostingVersion(fields.version),
    providerAccount: readRefundProviderAccount(fields.providerAccount),
    purpose: "client_order" as const,
    operationKind: "refund" as const,
    source: Object.freeze({ kind: "client_order" as const, id: id(source.id) }),
    providerPaymentId: id(fields.providerPaymentId),
    canonicalRequestDigest: readFinancePostingDigest(fields.canonicalRequestDigest),
    status: fields.status,
    canonicalEvidence: readCanonicalEvidence(fields.canonicalEvidence)
  });
  const projectionDigest = readFinancePostingDigest(fields.projectionDigest);
  if (projectionDigest !== hashFinanceCommandPayload(core)) fail("evidence_mismatch");
  return Object.freeze({ ...core, projectionDigest });
}

export function readRefundEvidenceRef(input: unknown) {
  const fields = readExactDataRecord(input, ["kind", "evidenceId", "canonicalDigest"]);
  if (fields.kind !== "payable_lot_operation_receipt") fail("evidence_mismatch");
  return Object.freeze({
    kind: "payable_lot_operation_receipt" as const,
    evidenceId: id(fields.evidenceId),
    canonicalDigest: readFinancePostingDigest(fields.canonicalDigest)
  });
}

export function readRefundTerminalOutcome(input: unknown): RefundTerminalOutcome {
  const kind = readOwnDataDiscriminator(input, "kind", ["succeeded", "failed"] as const);
  if (kind === "succeeded") {
    const f = readExactDataRecord(input, [
      "kind",
      "providerRefundId",
      "refundAmount",
      "priorProviderTotalRefunded",
      "nextProviderTotalRefunded",
      "recordedAt"
    ]);
    const refundAmount = readRefundPostingMoney(f.refundAmount, true);
    const prior = readRefundPostingMoney(f.priorProviderTotalRefunded, false);
    const next = readRefundPostingMoney(f.nextProviderTotalRefunded, true);
    if (BigInt(prior.amountMinor) + BigInt(refundAmount.amountMinor) !== BigInt(next.amountMinor))
      fail("amount_mismatch");
    return Object.freeze({
      kind,
      providerRefundId: id(f.providerRefundId),
      refundAmount,
      priorProviderTotalRefunded: prior,
      nextProviderTotalRefunded: next,
      recordedAt: readFinancePostingInstant(f.recordedAt)
    });
  }
  const f = readExactDataRecord(input, [
    "kind",
    "providerRefundId",
    "refundAmount",
    "failureCode",
    "recordedAt"
  ]);
  return Object.freeze({
    kind,
    providerRefundId: id(f.providerRefundId),
    refundAmount: readRefundPostingMoney(f.refundAmount, true),
    failureCode: id(f.failureCode),
    recordedAt: readFinancePostingInstant(f.recordedAt)
  });
}

export function readRefundTerminalAuthority(
  input: unknown
): RefundConfirmedAuthority | RefundFailedAuthority {
  const kind = readOwnDataDiscriminator(input, "kind", [
    "refund_confirmed",
    "refund_failed"
  ] as const);
  const shared = [
    "kind",
    "authorityId",
    "version",
    "refundId",
    "providerAccountId",
    "providerPaymentId",
    "providerRefundId",
    "providerRefundAmount",
    "payableAmount",
    "accountingAllocationId",
    "accountingAllocationVersion",
    "canonicalEvidenceId"
  ] as const;
  if (kind === "refund_confirmed") {
    const f = readExactDataRecord(input, [
      ...shared,
      "providerAmountBasis",
      "priorProviderTotalRefunded",
      "nextProviderTotalRefunded",
      "confirmedAt"
    ]);
    if (f.providerAmountBasis !== "incremental") fail("evidence_mismatch");
    const refund = readRefundPostingMoney(f.providerRefundAmount, true);
    const prior = readRefundPostingMoney(f.priorProviderTotalRefunded, false);
    const next = readRefundPostingMoney(f.nextProviderTotalRefunded, true);
    if (BigInt(prior.amountMinor) + BigInt(refund.amountMinor) !== BigInt(next.amountMinor))
      fail("amount_mismatch");
    return Object.freeze({
      kind,
      authorityId: id(f.authorityId),
      version: readFinancePostingVersion(f.version),
      refundId: id(f.refundId),
      providerAccountId: id(f.providerAccountId),
      providerPaymentId: id(f.providerPaymentId),
      providerRefundId: id(f.providerRefundId),
      providerAmountBasis: "incremental",
      providerRefundAmount: refund,
      priorProviderTotalRefunded: prior,
      nextProviderTotalRefunded: next,
      payableAmount: readRefundPostingMoney(f.payableAmount, false),
      accountingAllocationId: id(f.accountingAllocationId),
      accountingAllocationVersion: readFinancePostingVersion(f.accountingAllocationVersion),
      canonicalEvidenceId: id(f.canonicalEvidenceId),
      confirmedAt: readFinancePostingInstant(f.confirmedAt)
    });
  }
  const f = readExactDataRecord(input, [...shared, "failureCode", "failedAt"]);
  return Object.freeze({
    kind,
    authorityId: id(f.authorityId),
    version: readFinancePostingVersion(f.version),
    refundId: id(f.refundId),
    providerAccountId: id(f.providerAccountId),
    providerPaymentId: id(f.providerPaymentId),
    providerRefundId: id(f.providerRefundId),
    providerRefundAmount: readRefundPostingMoney(f.providerRefundAmount, true),
    payableAmount: readRefundPostingMoney(f.payableAmount, false),
    accountingAllocationId: id(f.accountingAllocationId),
    accountingAllocationVersion: readFinancePostingVersion(f.accountingAllocationVersion),
    failureCode: id(f.failureCode),
    canonicalEvidenceId: id(f.canonicalEvidenceId),
    failedAt: readFinancePostingInstant(f.failedAt)
  });
}

export function assertOutcomeMatchesTerminal(
  outcome: RefundTerminalOutcome,
  terminal: RefundConfirmedAuthority | RefundFailedAuthority
): void {
  if (outcome.kind === "succeeded" && terminal.kind === "refund_confirmed") {
    if (
      !same(outcome.priorProviderTotalRefunded, terminal.priorProviderTotalRefunded) ||
      !same(outcome.nextProviderTotalRefunded, terminal.nextProviderTotalRefunded) ||
      outcome.recordedAt !== terminal.confirmedAt
    )
      fail("amount_mismatch");
    return;
  }
  if (
    outcome.kind === "failed" &&
    terminal.kind === "refund_failed" &&
    outcome.failureCode === terminal.failureCode &&
    outcome.recordedAt === terminal.failedAt
  )
    return;
  fail("evidence_mismatch");
}

function readCanonicalEvidence(input: unknown): RefundCanonicalProviderEvidence {
  const fields = readExactDataRecord(input, ["kind", "reference", "digest", "observedAt"]);
  if (
    fields.kind !== "canonical_provider_read" &&
    fields.kind !== "verified_webhook" &&
    fields.kind !== "settlement_entry"
  )
    fail("evidence_mismatch");
  return Object.freeze({
    kind: fields.kind,
    reference: id(fields.reference),
    digest: readFinancePostingDigest(fields.digest),
    observedAt: readFinancePostingInstant(fields.observedAt)
  });
}

function same(left: Money, right: Money): boolean {
  return left.amountMinor === right.amountMinor && left.currency === right.currency;
}
function id(input: unknown): string {
  return readFinancePostingIdentifier(input);
}
function fail(reason: ConstructorParameters<typeof FinancePostingIntegrityError>[0]): never {
  throw new FinancePostingIntegrityError(reason);
}
