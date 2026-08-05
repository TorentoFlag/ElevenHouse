import { digestValue } from "../source-lot-operation-receipt-core";
import { FinancePostingIntegrityError, sameCanonicalFinancePostingValue } from "./posting-codec";
import type { ChargebackPrincipalPostingAllocationAuthority } from "./chargeback-posting-allocation-types";
import type { UnverifiedReceiptLinkedPostingProjection } from "./receipt-linked-posting-projection";

const allowedPayableAccounts = new Set([
  "astrologer_pending",
  "astrologer_available",
  "astrologer_reserved"
]);

export function assertChargebackAllocationReceipt(
  projection: UnverifiedReceiptLinkedPostingProjection,
  authority: ChargebackPrincipalPostingAllocationAuthority
): void {
  const receipt = projection.receipt;
  const source = authority.sourceAuthority;
  const expectedAuthorityRef = Object.freeze({
    kind: "chargeback_principal_allocation" as const,
    authorityId: source.authorityId,
    authorityVersion: String(source.version),
    evidenceId: source.accountingAllocationRevisionId,
    canonicalDigest: digestValue(source),
    digestPurpose: "drift_detection_only" as const
  });
  if (
    receipt.operationKind !== "chargeback_principal_allocated" ||
    receipt.sourceKey.kind !== "chargeback" ||
    receipt.sourceKey.sourceId !== source.accountingAllocationRevisionId ||
    receipt.sourceKey.operation !== "principal_allocated" ||
    receipt.astrologerUserId !== authority.astrologerUserId ||
    receipt.occurredAt !== authority.approvedAt ||
    receipt.authorityRefs.length !== 1 ||
    !sameCanonicalFinancePostingValue(receipt.authorityRefs[0], expectedAuthorityRef)
  ) {
    throw mismatch();
  }
  let payableMinor = 0n;
  for (const row of projection.rows) {
    if (
      row.entry.side !== "debit" ||
      !allowedPayableAccounts.has(row.entry.account.code) ||
      !("astrologerUserId" in row.entry.account) ||
      row.entry.account.astrologerUserId !== authority.astrologerUserId ||
      row.entry.links.originalSaleId !== authority.orderId
    ) {
      throw mismatch();
    }
    payableMinor += BigInt(row.entry.amount.amountMinor);
  }
  if (payableMinor !== BigInt(authority.payablePrincipal.amountMinor)) {
    throw new FinancePostingIntegrityError("amount_mismatch");
  }
  const componentIds = [
    authority.confirmedProviderEvidenceBinding.principalComponentId,
    ...projection.rows.map((row) => row.entry.links.componentId),
    ...authority.recoveryAllocations.map((row) => row.componentId),
    ...authority.platformAllocations.map((row) => row.componentId)
  ];
  if (
    componentIds.some((componentId) => componentId === null) ||
    new Set(componentIds).size !== componentIds.length
  ) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
}

function mismatch(): FinancePostingIntegrityError {
  return new FinancePostingIntegrityError("proof_operation_receipt_mismatch");
}
