import type { PayableLotReceiptDecoderEnvelope } from "../source-lot-operation-receipt";
import { digestValue } from "../source-lot-operation-receipt-core";
import {
  FinancePostingIntegrityError,
  readExactDataRecord,
  sameCanonicalFinancePostingValue
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import { readUnverifiedChargebackProviderEvidenceBinding } from "./chargeback-provider-evidence";
import { projectUnverifiedReceiptLinkedPostingRows } from "./receipt-linked-posting-projection";
import { readFinancePostingReceiptDecoderEnvelope } from "./payable-lot-receipt-envelope";

export function readChargebackProviderReceiptBinding(
  input: {
    readonly providerEvidenceBinding: unknown;
    readonly operationReceipt: unknown;
    readonly componentBindings: unknown;
  },
  postingDecoderEnvelopeInput: FinancePostingDecoderEnvelope,
  receiptDecoderEnvelopeInput: PayableLotReceiptDecoderEnvelope
): Readonly<{
  binding: ReturnType<typeof readUnverifiedChargebackProviderEvidenceBinding>;
  projection: ReturnType<typeof projectUnverifiedReceiptLinkedPostingRows>;
}>;
export function readChargebackProviderReceiptBinding(
  input: unknown,
  postingDecoderEnvelopeInput: unknown,
  receiptDecoderEnvelopeInput: unknown
) {
  const postingEnvelope = normalizeFinancePostingDecoderEnvelope(postingDecoderEnvelopeInput);
  const receiptEnvelope = readReceiptEnvelope(receiptDecoderEnvelopeInput);
  const root = readExactDataRecord(input, [
    "providerEvidenceBinding",
    "operationReceipt",
    "componentBindings"
  ]);
  const binding = readUnverifiedChargebackProviderEvidenceBinding(
    root.providerEvidenceBinding,
    postingEnvelope
  );
  const projection = projectUnverifiedReceiptLinkedPostingRows(
    {
      operationReceipt: root.operationReceipt,
      componentBindings: root.componentBindings
    },
    postingEnvelope,
    receiptEnvelope
  );
  assertReceipt(projection, binding);
  return Object.freeze({ binding, projection });
}

function assertReceipt(
  projection: ReturnType<typeof projectUnverifiedReceiptLinkedPostingRows>,
  binding: ReturnType<typeof readUnverifiedChargebackProviderEvidenceBinding>
): void {
  const receipt = projection.receipt;
  const source = binding.sourceAuthority;
  const expectedAuthorityRef = Object.freeze({
    kind: "chargeback_confirmed" as const,
    authorityId: source.authorityId,
    authorityVersion: String(source.version),
    evidenceId: source.canonicalEvidenceId,
    canonicalDigest: digestValue(source),
    digestPurpose: "drift_detection_only" as const
  });
  if (
    projection.rows.length !== 0 ||
    receipt.operationKind !== "chargeback_confirmed" ||
    receipt.receiptId !== binding.operationReceiptId ||
    receipt.canonicalDigest !== binding.operationReceiptDigest ||
    receipt.sourceKey.kind !== "chargeback" ||
    receipt.sourceKey.sourceId !== source.confirmationId ||
    receipt.sourceKey.operation !== "confirmed" ||
    receipt.occurredAt !== source.confirmedAt ||
    receipt.astrologerUserId !== source.astrologerUserId ||
    receipt.authorityRefs.length !== 1 ||
    !sameCanonicalFinancePostingValue(receipt.authorityRefs[0], expectedAuthorityRef)
  ) {
    throw new FinancePostingIntegrityError("proof_operation_receipt_mismatch");
  }
}

function readReceiptEnvelope(input: unknown): PayableLotReceiptDecoderEnvelope {
  return readFinancePostingReceiptDecoderEnvelope(input);
}
