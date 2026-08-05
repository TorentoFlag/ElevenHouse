import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import type { Money } from "../../money";
import {
  assertBankStatementClassification,
  readBankStatementEntryEvidence,
  type BankStatementEntryEvidence
} from "./bank-statement-evidence";
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
  readUnverifiedArcMerchantPayoutClearingExposureBinding,
  type UnverifiedArcMerchantPayoutClearingExposureBinding
} from "./bank-suspense-reclassification";
import { readFinanceJournalPostingContext } from "./posting-event-identity";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import { createUnverifiedFinanceJournalPostingRecipe } from "./posting-recipe";
import type { UnverifiedFinancePostingRecipe } from "./posting-types";

type JournalRecipe = Extract<UnverifiedFinancePostingRecipe, { readonly kind: "journal" }>;
type PostingInput<Authority> = Readonly<{
  context: Parameters<typeof readFinanceJournalPostingContext>[0];
  authority: Authority;
}>;

export type MerchantPayoutBankCreditDirectMatchAuthority = Readonly<{
  kind: "merchant_payout_bank_credit_direct_match";
  authorityId: string;
  version: number;
  operationId: string;
  providerAccountId: string;
  bankCashPoolId: string;
  merchantPayoutId: string;
  amount: Money;
  matchedAt: string;
  priorClearingBinding: UnverifiedArcMerchantPayoutClearingExposureBinding;
  evidence: BankStatementEntryEvidence;
}>;

const noLinks = Object.freeze({
  originalSaleId: null,
  componentId: null,
  payableLotId: null,
  payoutAllocationId: null
});

export function buildArcPayMerchantPayoutBankCreditMatchedPosting(
  input: PostingInput<MerchantPayoutBankCreditDirectMatchAuthority>,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): JournalRecipe;
export function buildArcPayMerchantPayoutBankCreditMatchedPosting(
  input: unknown,
  decoderEnvelopeInput: unknown
): JournalRecipe {
  const decoderEnvelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  const root = readExactDataRecord(input, ["context", "authority"]);
  const context = readFinanceJournalPostingContext(root.context, decoderEnvelope);
  const fields = readExactDataRecord(root.authority, [
    "kind",
    "authorityId",
    "version",
    "operationId",
    "providerAccountId",
    "bankCashPoolId",
    "merchantPayoutId",
    "amount",
    "matchedAt",
    "priorClearingBinding",
    "evidence"
  ]);
  if (fields.kind !== "merchant_payout_bank_credit_direct_match") {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  const authorityId = readFinancePostingIdentifier(fields.authorityId);
  const version = readFinancePostingVersion(fields.version);
  const operationId = readFinancePostingIdentifier(fields.operationId);
  const providerAccountId = readFinancePostingIdentifier(fields.providerAccountId);
  const bankCashPoolId = readFinancePostingIdentifier(fields.bankCashPoolId);
  const merchantPayoutId = readFinancePostingIdentifier(fields.merchantPayoutId);
  const amount = readFinancePostingMoney(fields.amount);
  const matchedAt = readFinancePostingInstant(fields.matchedAt);
  const priorClearingBinding = readUnverifiedArcMerchantPayoutClearingExposureBinding(
    fields.priorClearingBinding,
    decoderEnvelope
  );
  const evidence = readBankStatementEntryEvidence(fields.evidence, decoderEnvelope);

  assertOperationSource(
    context,
    operationId,
    evidence.bankStatementEntryId,
    "settlement",
    "merchant_payout_bank_matched"
  );
  assertBankStatementClassification(
    evidence,
    {
      classificationPath: "direct_match",
      classificationAuthorityId: authorityId,
      classificationVersion: version,
      bankCashPoolId,
      direction: "credit",
      amount
    },
    decoderEnvelope
  );
  if (
    priorClearingBinding.providerAccountId !== providerAccountId ||
    priorClearingBinding.bankCashPoolId !== bankCashPoolId
  ) {
    throw new FinancePostingIntegrityError("scope_mismatch");
  }
  if (priorClearingBinding.merchantPayoutId !== merchantPayoutId) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  assertFinancePostingMoneyEqual(amount, priorClearingBinding.amount, "amount_mismatch");
  assertFinancePostingMoneyEqual(
    amount,
    priorClearingBinding.claimedRemainingAmount,
    "amount_mismatch"
  );
  assertFinancePostingInstantEqual(context.occurredAt, evidence.bookedAt, "evidence_mismatch");
  if (
    compareFinancePostingInstants(matchedAt, evidence.observedAt) < 0 ||
    compareFinancePostingInstants(matchedAt, priorClearingBinding.issuedAt) < 0 ||
    compareFinancePostingInstants(context.postedAt, matchedAt) < 0
  ) {
    throw new FinancePostingIntegrityError("invalid_chronology");
  }

  return createUnverifiedFinanceJournalPostingRecipe(
    {
      context,
      authorityRef: {
        kind: "merchant_payout_bank_credit_direct_match",
        authorityId,
        version,
        canonicalDigest: hashFinanceCommandPayload({
          kind: "merchant_payout_bank_credit_direct_match",
          authorityId,
          version,
          operationId,
          providerAccountId,
          bankCashPoolId,
          merchantPayoutId,
          amount,
          matchedAt,
          priorClearingBinding,
          evidence
        })
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
          account: { code: "bank_cash", bankCashPoolId, currency: "RUB" },
          side: "debit",
          amount,
          links: noLinks
        },
        {
          account: {
            code: "arc_to_bank_clearing",
            arcProviderAccountId: providerAccountId,
            bankCashPoolId,
            currency: "RUB"
          },
          side: "credit",
          amount,
          links: noLinks
        }
      ]
    },
    decoderEnvelope
  );
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
