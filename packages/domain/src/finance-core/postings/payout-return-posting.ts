import type { PayableLotReceiptDecoderEnvelope } from "../source-lot-operation-receipt";
import {
  assertBankStatementClassification,
  readBankStatementEntryEvidence
} from "./bank-statement-evidence";
import {
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataRecord
} from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";
import { readPayoutEvidenceRef } from "./payout-posting-codec";
import { preparePayoutReturnCore } from "./payout-return-posting-core";
import {
  buildReceiptPostingRecipe,
  emptyJournalLinks,
  normalizeReceiptPostingEnvelopes,
  prepareReceiptPosting
} from "./receipt-liability-posting-core";
import type { UnverifiedFinancePostingRecipe } from "./posting-types";

type JournalRecipe = Extract<UnverifiedFinancePostingRecipe, { readonly kind: "journal" }>;

const rootKeys = [
  "context",
  "receiptBinding",
  "operationReceipt",
  "componentBindings",
  "operationSnapshotRef",
  "authority",
  "previousExposureBinding"
] as const;

const commonAuthorityKeys = [
  "kind",
  "sourceAuthority",
  "receiptBinding",
  "exposureTransition",
  "priorClearingCoverage"
] as const;

export function buildUnverifiedPayoutReturnWithoutDebitPosting(
  input: unknown,
  postingEnvelopeInput: FinancePostingDecoderEnvelope,
  receiptEnvelopeInput: PayableLotReceiptDecoderEnvelope
): JournalRecipe {
  const envelopes = normalizeReceiptPostingEnvelopes(postingEnvelopeInput, receiptEnvelopeInput);
  const root = readExactDataRecord(input, rootKeys);
  const prepared = prepareReceiptPosting(root, "payout_returned_reserved", envelopes);
  const fields = readExactDataRecord(root.authority, [
    ...commonAuthorityKeys,
    "noDebitEvidenceRef"
  ]);
  if (fields.kind !== "payout_return_without_debit_posting") mismatch();
  const core = preparePayoutReturnCore(
    fields,
    root.previousExposureBinding,
    prepared,
    "without_debit",
    envelopes.posting
  );
  const evidenceRef = readPayoutEvidenceRef(fields.noDebitEvidenceRef);
  if (
    core.source.bankStatementEntryId !== null ||
    core.source.bankCreditEvidencePath !== null ||
    core.source.suspenseReclassificationId !== null ||
    evidenceRef.kind !== "payout_no_debit_outcome" ||
    evidenceRef.evidenceId !== core.source.evidenceId ||
    prepared.context.sourceKey.kind !== "payout" ||
    prepared.context.sourceKey.operation !== "returned_without_debit"
  ) {
    mismatch();
  }
  return buildReceiptPostingRecipe(
    prepared,
    {
      kind: "payout_return_without_debit_posting",
      authorityId: core.source.authorityId,
      version: core.source.version,
      canonicalDigest: hashFinanceCommandPayload({
        kind: "payout_return_without_debit_posting",
        sourceAuthority: core.source,
        receiptBinding: prepared.receiptBinding,
        exposureTransition: core.exposure,
        priorClearingCoverage: core.coverage,
        noDebitEvidenceRef: evidenceRef
      })
    },
    envelopes,
    [
      {
        account: {
          code: "bank_outbound_clearing",
          bankCashPoolId: core.exposure.bankCashPoolId,
          currency: "RUB"
        },
        side: "debit",
        amount: core.amount,
        links: emptyJournalLinks
      }
    ],
    true
  );
}

export function buildUnverifiedPayoutReturnDirectCreditPosting(
  input: unknown,
  postingEnvelopeInput: FinancePostingDecoderEnvelope,
  receiptEnvelopeInput: PayableLotReceiptDecoderEnvelope
): JournalRecipe {
  const envelopes = normalizeReceiptPostingEnvelopes(postingEnvelopeInput, receiptEnvelopeInput);
  const root = readExactDataRecord(input, rootKeys);
  const prepared = prepareReceiptPosting(root, "payout_returned_reserved", envelopes);
  const fields = readExactDataRecord(root.authority, [...commonAuthorityKeys, "evidence"]);
  if (fields.kind !== "payout_return_direct_credit_posting") mismatch();
  const core = preparePayoutReturnCore(
    fields,
    root.previousExposureBinding,
    prepared,
    "reflected",
    envelopes.posting
  );
  const evidence = readBankStatementEntryEvidence(fields.evidence, envelopes.posting);
  assertBankStatementClassification(
    evidence,
    {
      classificationPath: "direct_match",
      classificationAuthorityId: core.source.authorityId,
      classificationVersion: core.source.version,
      bankCashPoolId: core.exposure.bankCashPoolId,
      direction: "credit",
      amount: core.amount
    },
    envelopes.posting
  );
  if (
    core.source.bankCreditEvidencePath !== "direct_match" ||
    core.source.suspenseReclassificationId !== null ||
    core.source.bankStatementEntryId !== evidence.bankStatementEntryId ||
    core.source.evidenceId !== evidence.evidenceId ||
    prepared.context.sourceKey.kind !== "bank" ||
    prepared.context.sourceKey.sourceId !== evidence.bankStatementEntryId ||
    prepared.context.sourceKey.operation !== "payout_return_credit_matched" ||
    prepared.context.occurredAt !== evidence.bookedAt ||
    compareFinancePostingInstants(prepared.context.postedAt, evidence.observedAt) < 0
  ) {
    mismatch();
  }
  return buildReceiptPostingRecipe(
    prepared,
    {
      kind: "payout_return_direct_credit_posting",
      authorityId: core.source.authorityId,
      version: core.source.version,
      canonicalDigest: hashFinanceCommandPayload({
        kind: "payout_return_direct_credit_posting",
        sourceAuthority: core.source,
        receiptBinding: prepared.receiptBinding,
        exposureTransition: core.exposure,
        priorClearingCoverage: core.coverage,
        evidence
      })
    },
    envelopes,
    [
      {
        account: {
          code: "bank_cash",
          bankCashPoolId: core.exposure.bankCashPoolId,
          currency: "RUB"
        },
        side: "debit",
        amount: core.amount,
        links: emptyJournalLinks
      }
    ],
    true
  );
}

function mismatch(): never {
  throw new FinancePostingIntegrityError("authority_mismatch");
}
import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
