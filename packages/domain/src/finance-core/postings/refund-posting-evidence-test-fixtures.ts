import {
  hashFinanceCommandPayload,
  type FinanceAuthorizationPayloadHash
} from "../../finance-authorization/canonical-command-payload";
import { buildRefundPostingAllocationInput } from "./refund-posting-test-fixtures";

const money = (amountMinor: number) => Object.freeze({ amountMinor, currency: "RUB" as const });
const digest = (value: string) => hashFinanceCommandPayload({ value });

export function buildConfirmedRefundEvidenceInput() {
  const allocation = buildRefundPostingAllocationInput();
  const terminalAuthority = confirmedRefundAuthority();
  return buildBinding(allocation, terminalAuthority, "succeeded");
}

export function buildFailedRefundEvidenceInput() {
  const allocation = buildRefundPostingAllocationInput();
  const terminalAuthority = failedRefundAuthority();
  return buildBinding(allocation, terminalAuthority, "failed");
}

export function withBindingDigest<T extends Record<string, unknown>>(
  core: T
): Omit<T, "bindingDigest"> & { bindingDigest: FinanceAuthorizationPayloadHash } {
  const withoutDigest: Record<string, unknown> = { ...core };
  delete withoutDigest.bindingDigest;
  return {
    ...core,
    bindingDigest: hashFinanceCommandPayload(withoutDigest)
  } as Omit<T, "bindingDigest"> & { bindingDigest: FinanceAuthorizationPayloadHash };
}

function buildBinding(
  allocation: ReturnType<typeof buildRefundPostingAllocationInput>,
  terminalAuthority:
    | ReturnType<typeof confirmedRefundAuthority>
    | ReturnType<typeof failedRefundAuthority>,
  outcomeKind: "succeeded" | "failed"
) {
  const providerEvidence = {
    kind: outcomeKind === "succeeded" ? "verified_webhook" : "canonical_provider_read",
    reference: terminalAuthority.canonicalEvidenceId,
    digest: digest(`provider-evidence-${outcomeKind}`),
    observedAt: "2026-08-03T10:05:00Z"
  } as const;
  const intentCore = {
    kind: "refund_provider_terminal_intent",
    intentId: allocation.providerIntentId,
    version: 2,
    providerAccount: allocation.providerAccount,
    purpose: "client_order",
    operationKind: "refund",
    source: { kind: "client_order", id: allocation.refundId },
    providerPaymentId: allocation.providerPaymentId,
    canonicalRequestDigest: allocation.providerRequestDigest,
    status: outcomeKind,
    canonicalEvidence: providerEvidence
  } as const;
  const providerIntent = { ...intentCore, projectionDigest: hashFinanceCommandPayload(intentCore) };
  const outcome =
    terminalAuthority.kind === "refund_confirmed"
      ? {
          kind: "succeeded" as const,
          providerRefundId: terminalAuthority.providerRefundId,
          refundAmount: terminalAuthority.providerRefundAmount,
          priorProviderTotalRefunded: terminalAuthority.priorProviderTotalRefunded,
          nextProviderTotalRefunded: terminalAuthority.nextProviderTotalRefunded,
          recordedAt: terminalAuthority.confirmedAt
        }
      : {
          kind: "failed" as const,
          providerRefundId: terminalAuthority.providerRefundId,
          refundAmount: terminalAuthority.providerRefundAmount,
          failureCode: terminalAuthority.failureCode,
          recordedAt: terminalAuthority.failedAt
        };
  const core = {
    kind: "refund_terminal_evidence_binding",
    schemaVersion: 1,
    bindingId: `refund-terminal-binding-${outcomeKind}`,
    version: "1",
    authorizationStatus: "unverified",
    digestPurpose: "drift_detection_only",
    allocationAuthorityRef: authorityRef(
      allocation.kind,
      allocation.authorityId,
      allocation.version,
      allocation.allocationDigest
    ),
    operationReceiptRef: evidenceRef(
      "payable_lot_operation_receipt",
      `refund-${outcomeKind}-operation`,
      digest(`refund-${outcomeKind}-receipt`)
    ),
    terminalAuthorityRef: authorityRef(
      terminalAuthority.kind,
      terminalAuthority.authorityId,
      terminalAuthority.version,
      hashFinanceCommandPayload(terminalAuthority)
    ),
    providerIntent,
    outcome
  } as const;
  return { allocation, terminalAuthority, binding: withBindingDigest(core) };
}

function confirmedRefundAuthority() {
  return Object.freeze({
    kind: "refund_confirmed" as const,
    authorityId: "refund-confirmed-authority-1",
    version: 2,
    refundId: "refund-1",
    providerAccountId: "arc-account-live-primary",
    providerPaymentId: "arc-payment-1",
    providerRefundId: "arc-refund-1",
    providerAmountBasis: "incremental" as const,
    providerRefundAmount: money(2_500),
    priorProviderTotalRefunded: money(0),
    nextProviderTotalRefunded: money(2_500),
    payableAmount: money(1_200),
    accountingAllocationId: "refund-allocation-1",
    accountingAllocationVersion: 1,
    canonicalEvidenceId: "provider-evidence-reference-confirmed",
    confirmedAt: "2026-08-03T10:06:00Z"
  });
}

function failedRefundAuthority() {
  return Object.freeze({
    kind: "refund_failed" as const,
    authorityId: "refund-failed-authority-1",
    version: 2,
    refundId: "refund-1",
    providerAccountId: "arc-account-live-primary",
    providerPaymentId: "arc-payment-1",
    providerRefundId: "arc-refund-1",
    providerRefundAmount: money(2_500),
    payableAmount: money(1_200),
    accountingAllocationId: "refund-allocation-1",
    accountingAllocationVersion: 1,
    failureCode: "provider_refund_declined",
    canonicalEvidenceId: "provider-evidence-reference-failed",
    failedAt: "2026-08-03T10:06:00Z"
  });
}

function authorityRef(kind: string, authorityId: string, version: number, canonicalDigest: string) {
  return Object.freeze({ kind, authorityId, version, canonicalDigest });
}

function evidenceRef(kind: string, evidenceId: string, canonicalDigest: string) {
  return Object.freeze({ kind, evidenceId, canonicalDigest });
}
