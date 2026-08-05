export type FinancePostingIntegrityReason =
  | "invalid_shape"
  | "invalid_identifier"
  | "invalid_version"
  | "invalid_money"
  | "invalid_digest"
  | "invalid_instant"
  | "invalid_chronology"
  | "source_mismatch"
  | "authority_mismatch"
  | "evidence_mismatch"
  | "scope_mismatch"
  | "amount_mismatch"
  | "proof_digest_mismatch"
  | "proof_transaction_mismatch"
  | "proof_operation_receipt_mismatch"
  | "decoder_envelope_required"
  | "decoder_envelope_exceeded"
  | "no_posting_reason_mismatch"
  | "trusted_reclassification_commit_receipt_required"
  | "payable_lot_operation_receipt_required"
  | "unbalanced_proof";

export class FinancePostingIntegrityError extends Error {
  readonly code = "finance_posting_integrity_error";

  constructor(readonly reason: FinancePostingIntegrityReason) {
    super("Finance posting input violates the approved posting contract");
    this.name = "FinancePostingIntegrityError";
  }
}
