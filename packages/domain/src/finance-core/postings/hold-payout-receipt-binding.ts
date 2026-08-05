import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import type { PayableLotOperationReceipt } from "../source-lot-operation-receipt";
import {
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingInstant,
  readFinancePostingSourceKey,
  readFinancePostingVersion,
  sameFinancePostingSourceKey
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import type { UnverifiedPayableLotPostingAuthorityBinding } from "./hold-payout-posting-types";

export function readUnverifiedPayableLotPostingAuthorityBinding(
  input: unknown,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): UnverifiedPayableLotPostingAuthorityBinding {
  normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  const fields = readExactDataRecord(input, [
    "kind",
    "schemaVersion",
    "bindingId",
    "version",
    "authorizationStatus",
    "atomicityStatus",
    "digestPurpose",
    "operationReceiptId",
    "operationReceiptDigest",
    "operationKind",
    "sourceKey",
    "authorityRefsDigest",
    "issuedAt",
    "bindingDigest"
  ]);
  if (
    fields.kind !== "unverified_payable_lot_posting_authority_binding" ||
    fields.schemaVersion !== 1 ||
    fields.authorizationStatus !== "unverified" ||
    fields.atomicityStatus !== "unverified" ||
    fields.digestPurpose !== "drift_detection_only" ||
    typeof fields.operationKind !== "string"
  ) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  const core = Object.freeze({
    kind: "unverified_payable_lot_posting_authority_binding" as const,
    schemaVersion: 1 as const,
    bindingId: readFinancePostingIdentifier(fields.bindingId),
    version: readFinancePostingVersion(fields.version),
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    operationReceiptId: readFinancePostingIdentifier(fields.operationReceiptId),
    operationReceiptDigest: readFinancePostingDigest(fields.operationReceiptDigest),
    operationKind:
      fields.operationKind as UnverifiedPayableLotPostingAuthorityBinding["operationKind"],
    sourceKey: readFinancePostingSourceKey(fields.sourceKey),
    authorityRefsDigest: readFinancePostingDigest(fields.authorityRefsDigest),
    issuedAt: readFinancePostingInstant(fields.issuedAt)
  });
  const bindingDigest = readFinancePostingDigest(fields.bindingDigest);
  if (bindingDigest !== hashFinanceCommandPayload(core)) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  return Object.freeze({ ...core, bindingDigest });
}

export function assertPayableLotPostingBindingMatchesReceipt(
  binding: UnverifiedPayableLotPostingAuthorityBinding,
  receipt: PayableLotOperationReceipt
): void {
  if (
    binding.operationReceiptId !== receipt.receiptId ||
    binding.operationReceiptDigest !== receipt.canonicalDigest ||
    binding.operationKind !== receipt.operationKind ||
    !sameFinancePostingSourceKey(binding.sourceKey, receipt.sourceKey) ||
    binding.authorityRefsDigest !== hashFinanceCommandPayload(receipt.authorityRefs) ||
    binding.issuedAt !== receipt.occurredAt
  ) {
    throw new FinancePostingIntegrityError("proof_operation_receipt_mismatch");
  }
}
