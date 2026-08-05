import {
  assertBankStatementClassification,
  readBankStatementEntryEvidence
} from "./bank-statement-evidence";
import {
  readUnverifiedPayoutBankExposureBinding,
  readUnverifiedPayoutBankExposureTransitionBinding
} from "./payout-bank-exposure-binding";
import { readUnverifiedPayoutOutboundClearingCoverageBinding } from "./payout-clearing-coverage-binding";
import {
  assertFinancePostingMoneyEqual,
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingIdentifier,
  readFinancePostingInstant,
  readFinancePostingMoney,
  readFinancePostingVersion,
  sameCanonicalFinancePostingValue
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import { readFinanceJournalPostingContext } from "./posting-event-identity";
import { readPayoutAuthorityRef } from "./payout-posting-codec";
import { PayoutPostingContradictionError } from "./payout-posting-contradiction";
import { emptyJournalLinks } from "./receipt-liability-posting-core";
import { createUnverifiedFinanceJournalPostingRecipe } from "./posting-recipe";
import type { UnverifiedFinancePostingRecipe } from "./posting-types";

type JournalRecipe = Extract<UnverifiedFinancePostingRecipe, { readonly kind: "journal" }>;

export function buildUnverifiedPayoutBankDebitDirectMatchPosting(
  input: unknown,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): JournalRecipe {
  const envelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  const root = readExactDataRecord(input, ["context", "authority", "previousExposureBinding"]);
  const context = readFinanceJournalPostingContext(root.context, envelope);
  const fields = readExactDataRecord(root.authority, [
    "kind",
    "authorityId",
    "version",
    "operationId",
    "payoutRequestId",
    "bankCashPoolId",
    "amount",
    "matchedAt",
    "priorClearingCoverage",
    "exposureTransition",
    "evidence",
    "matchAuthorityRef"
  ]);
  if (fields.kind !== "payout_bank_debit_direct_match") mismatch();
  const previous = readUnverifiedPayoutBankExposureBinding(root.previousExposureBinding, envelope);
  if (previous.status === "returned_without_debit") {
    throw new PayoutPostingContradictionError("bank_debit_after_definitive_no_debit");
  }
  const authorityId = readFinancePostingIdentifier(fields.authorityId);
  const version = readFinancePostingVersion(fields.version);
  const operationId = readFinancePostingIdentifier(fields.operationId);
  const payoutRequestId = readFinancePostingIdentifier(fields.payoutRequestId);
  const bankCashPoolId = readFinancePostingIdentifier(fields.bankCashPoolId);
  const amount = readFinancePostingMoney(fields.amount);
  const matchedAt = readFinancePostingInstant(fields.matchedAt);
  const matchAuthorityRef = readPayoutAuthorityRef(fields.matchAuthorityRef);
  const coverage = readUnverifiedPayoutOutboundClearingCoverageBinding(
    fields.priorClearingCoverage,
    envelope
  );
  const evidence = readBankStatementEntryEvidence(fields.evidence, envelope);
  assertBankStatementClassification(
    evidence,
    {
      classificationPath: "direct_match",
      classificationAuthorityId: matchAuthorityRef.authorityId,
      classificationVersion: matchAuthorityRef.version,
      bankCashPoolId,
      direction: "debit",
      amount
    },
    envelope
  );
  assertCoverage(previous, coverage, payoutRequestId, bankCashPoolId, amount);
  const exposure = readUnverifiedPayoutBankExposureTransitionBinding(
    { binding: fields.exposureTransition, previousBinding: root.previousExposureBinding },
    envelope
  );
  if (
    previous.status !== "paid_unreflected" ||
    exposure.transitionKind !== "statement_debit_reflected" ||
    exposure.status !== "statement_reflected" ||
    exposure.payoutRequestId !== payoutRequestId ||
    exposure.bankCashPoolId !== bankCashPoolId ||
    exposure.occurredAt !== matchedAt ||
    context.operationId !== operationId ||
    context.sourceKey.kind !== "bank" ||
    context.sourceKey.sourceId !== evidence.bankStatementEntryId ||
    context.sourceKey.operation !== "payout_debit_matched" ||
    context.occurredAt !== evidence.bookedAt ||
    compareFinancePostingInstants(coverage.issuedAt, previous.occurredAt) < 0 ||
    compareFinancePostingInstants(matchedAt, coverage.issuedAt) < 0 ||
    compareFinancePostingInstants(matchedAt, evidence.observedAt) < 0 ||
    compareFinancePostingInstants(context.postedAt, matchedAt) < 0 ||
    !sameCanonicalFinancePostingValue(exposure.transitionAuthorityRef, matchAuthorityRef)
  ) {
    mismatch();
  }
  assertFinancePostingMoneyEqual(exposure.amount, amount, "amount_mismatch");
  const authorityCore = Object.freeze({
    kind: "payout_bank_debit_direct_match" as const,
    authorityId,
    version,
    operationId,
    payoutRequestId,
    bankCashPoolId,
    amount,
    matchedAt,
    priorClearingCoverage: coverage,
    exposureTransition: exposure,
    evidence,
    matchAuthorityRef
  });
  return createUnverifiedFinanceJournalPostingRecipe(
    {
      context,
      authorityRef: {
        kind: authorityCore.kind,
        authorityId,
        version,
        canonicalDigest: hashFinanceCommandPayload(authorityCore)
      },
      sourceEvidenceRef: {
        kind: evidence.kind,
        evidenceId: evidence.evidenceId,
        canonicalDigest: evidence.evidenceDigest
      },
      operationSnapshotRef: null,
      entrySourceLinks: [null, null],
      entries: [
        {
          account: { code: "bank_outbound_clearing", bankCashPoolId, currency: "RUB" },
          side: "debit",
          amount,
          links: emptyJournalLinks
        },
        {
          account: { code: "bank_cash", bankCashPoolId, currency: "RUB" },
          side: "credit",
          amount,
          links: emptyJournalLinks
        }
      ]
    },
    envelope
  );
}

function assertCoverage(
  previous: ReturnType<typeof readUnverifiedPayoutBankExposureBinding>,
  coverage: ReturnType<typeof readUnverifiedPayoutOutboundClearingCoverageBinding>,
  payoutRequestId: string,
  bankCashPoolId: string,
  amount: ReturnType<typeof readFinancePostingMoney>
): void {
  if (
    coverage.bankExposureId !== previous.bankExposureId ||
    coverage.payoutRequestId !== payoutRequestId ||
    coverage.bankCashPoolId !== bankCashPoolId ||
    !sameCanonicalFinancePostingValue(coverage.paidExposureBindingRef, {
      bindingId: previous.bindingId,
      exposureVersion: previous.exposureVersion,
      status: previous.status,
      bindingDigest: previous.bindingDigest
    })
  )
    mismatch();
  assertFinancePostingMoneyEqual(coverage.amount, amount, "amount_mismatch");
}

function mismatch(): never {
  throw new FinancePostingIntegrityError("authority_mismatch");
}
import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
