import {
  hashFinanceCommandPayload,
  type FinanceAuthorizationPayloadHash
} from "../../finance-authorization/canonical-command-payload";
import type { PayableLotOperationReceipt } from "../source-lot-operation-receipt";
import type { RefundConfirmedAuthority, RefundFailedAuthority } from "../source-lot-types";
import { withBindingDigest } from "./refund-posting-evidence-test-fixtures";
import type { RefundPostingAllocationAuthorityV1 } from "./refund-posting-types";

export function buildTerminalEvidenceBinding(
  allocation: RefundPostingAllocationAuthorityV1,
  terminalAuthority: RefundConfirmedAuthority | RefundFailedAuthority,
  operationReceipt: PayableLotOperationReceipt
) {
  const status = terminalAuthority.kind === "refund_confirmed" ? "succeeded" : "failed";
  const observedAt =
    terminalAuthority.kind === "refund_confirmed"
      ? terminalAuthority.confirmedAt
      : terminalAuthority.failedAt;
  const evidence = Object.freeze({
    kind: "canonical_provider_read" as const,
    reference: terminalAuthority.canonicalEvidenceId,
    digest: hashFinanceCommandPayload({ terminalAuthority }),
    observedAt
  });
  const intentCore = Object.freeze({
    kind: "refund_provider_terminal_intent" as const,
    intentId: allocation.providerIntentId,
    version: 2,
    providerAccount: allocation.providerAccount,
    purpose: "client_order" as const,
    operationKind: "refund" as const,
    source: Object.freeze({ kind: "client_order" as const, id: allocation.refundId }),
    providerPaymentId: allocation.providerPaymentId,
    canonicalRequestDigest: allocation.providerRequestDigest,
    status,
    canonicalEvidence: evidence
  });
  const providerIntent = Object.freeze({
    ...intentCore,
    projectionDigest: hashFinanceCommandPayload(intentCore)
  });
  const outcome =
    terminalAuthority.kind === "refund_confirmed"
      ? Object.freeze({
          kind: "succeeded" as const,
          providerRefundId: terminalAuthority.providerRefundId,
          refundAmount: terminalAuthority.providerRefundAmount,
          priorProviderTotalRefunded: terminalAuthority.priorProviderTotalRefunded,
          nextProviderTotalRefunded: terminalAuthority.nextProviderTotalRefunded,
          recordedAt: terminalAuthority.confirmedAt
        })
      : Object.freeze({
          kind: "failed" as const,
          providerRefundId: terminalAuthority.providerRefundId,
          refundAmount: terminalAuthority.providerRefundAmount,
          failureCode: terminalAuthority.failureCode,
          recordedAt: terminalAuthority.failedAt
        });
  const core = {
    kind: "refund_terminal_evidence_binding" as const,
    schemaVersion: 1 as const,
    bindingId: `${operationReceipt.operationId}:terminal-binding`,
    version: "1",
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    allocationAuthorityRef: authorityRef(
      allocation.kind,
      allocation.authorityId,
      allocation.version,
      allocation.allocationDigest
    ),
    operationReceiptRef: Object.freeze({
      kind: "payable_lot_operation_receipt" as const,
      evidenceId: operationReceipt.receiptId,
      canonicalDigest: operationReceipt.canonicalDigest
    }),
    terminalAuthorityRef: authorityRef(
      terminalAuthority.kind,
      terminalAuthority.authorityId,
      terminalAuthority.version,
      hashFinanceCommandPayload(terminalAuthority)
    ),
    providerIntent,
    outcome
  };
  return withBindingDigest(core);
}

function authorityRef<const Kind extends string>(
  kind: Kind,
  authorityId: string,
  version: number,
  canonicalDigest: FinanceAuthorizationPayloadHash
) {
  return Object.freeze({ kind, authorityId, version, canonicalDigest });
}
