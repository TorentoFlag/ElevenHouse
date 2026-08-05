import {
  hashFinanceCommandPayload,
  type FinanceAuthorizationPayloadHash
} from "../../finance-authorization/canonical-command-payload";
import type { Money } from "../../money";
import {
  assertFinancePostingInstantEqual,
  assertFinancePostingMoneyEqual,
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingInstant,
  readFinancePostingMoney,
  readFinancePostingVersion
} from "./posting-codec";
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

export type ArcMerchantPayoutConfirmationEvidence = Readonly<{
  kind: "arc_merchant_payout_confirmation";
  evidenceId: string;
  evidenceDigest: FinanceAuthorizationPayloadHash;
  providerAccountId: string;
  bankCashPoolId: string;
  merchantPayoutId: string;
  amount: Money;
  confirmedAt: string;
  observedAt: string;
}>;

export type ArcMerchantPayoutConfirmedAuthority = Readonly<{
  kind: "arc_merchant_payout_confirmed";
  authorityId: string;
  version: number;
  operationId: string;
  providerAccountId: string;
  bankCashPoolId: string;
  merchantPayoutId: string;
  amount: Money;
  confirmedAt: string;
  evidence: ArcMerchantPayoutConfirmationEvidence;
}>;

const noLinks = Object.freeze({
  originalSaleId: null,
  componentId: null,
  payableLotId: null,
  payoutAllocationId: null
});

export function buildArcPayMerchantPayoutConfirmedPosting(
  input: PostingInput<ArcMerchantPayoutConfirmedAuthority>,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): JournalRecipe;
export function buildArcPayMerchantPayoutConfirmedPosting(
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
    "confirmedAt",
    "evidence"
  ]);
  if (fields.kind !== "arc_merchant_payout_confirmed") {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  const authorityId = readFinancePostingIdentifier(fields.authorityId);
  const version = readFinancePostingVersion(fields.version);
  const operationId = readFinancePostingIdentifier(fields.operationId);
  const providerAccountId = readFinancePostingIdentifier(fields.providerAccountId);
  const bankCashPoolId = readFinancePostingIdentifier(fields.bankCashPoolId);
  const merchantPayoutId = readFinancePostingIdentifier(fields.merchantPayoutId);
  const amount = readFinancePostingMoney(fields.amount);
  const confirmedAt = readFinancePostingInstant(fields.confirmedAt);
  const evidence = readArcMerchantPayoutConfirmationEvidence(fields.evidence);

  assertOperationSource(
    context,
    operationId,
    merchantPayoutId,
    "settlement",
    "merchant_payout_confirmed"
  );
  if (
    evidence.providerAccountId !== providerAccountId ||
    evidence.bankCashPoolId !== bankCashPoolId
  ) {
    throw new FinancePostingIntegrityError("scope_mismatch");
  }
  if (evidence.merchantPayoutId !== merchantPayoutId) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  assertFinancePostingMoneyEqual(amount, evidence.amount, "amount_mismatch");
  assertFinancePostingInstantEqual(confirmedAt, evidence.confirmedAt, "evidence_mismatch");
  assertFinancePostingInstantEqual(context.occurredAt, confirmedAt, "authority_mismatch");
  if (
    compareFinancePostingInstants(evidence.observedAt, confirmedAt) < 0 ||
    compareFinancePostingInstants(context.postedAt, evidence.observedAt) < 0
  ) {
    throw new FinancePostingIntegrityError("invalid_chronology");
  }

  return createUnverifiedFinanceJournalPostingRecipe(
    {
      context,
      authorityRef: {
        kind: "arc_merchant_payout_confirmed",
        authorityId,
        version,
        canonicalDigest: hashFinanceCommandPayload({
          kind: "arc_merchant_payout_confirmed",
          authorityId,
          version,
          operationId,
          providerAccountId,
          bankCashPoolId,
          merchantPayoutId,
          amount,
          confirmedAt,
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
          account: {
            code: "arc_to_bank_clearing",
            arcProviderAccountId: providerAccountId,
            bankCashPoolId,
            currency: "RUB"
          },
          side: "debit",
          amount,
          links: noLinks
        },
        {
          account: {
            code: "arc_provider_clearing",
            arcProviderAccountId: providerAccountId,
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

function readArcMerchantPayoutConfirmationEvidence(input: unknown): {
  readonly kind: "arc_merchant_payout_confirmation";
  readonly evidenceId: string;
  readonly evidenceDigest: FinanceAuthorizationPayloadHash;
  readonly providerAccountId: string;
  readonly bankCashPoolId: string;
  readonly merchantPayoutId: string;
  readonly amount: Money;
  readonly confirmedAt: string;
  readonly observedAt: string;
} {
  const fields = readExactDataRecord(input, [
    "kind",
    "evidenceId",
    "evidenceDigest",
    "providerAccountId",
    "bankCashPoolId",
    "merchantPayoutId",
    "amount",
    "confirmedAt",
    "observedAt"
  ]);
  if (fields.kind !== "arc_merchant_payout_confirmation") {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  const evidenceId = readFinancePostingIdentifier(fields.evidenceId);
  const evidenceDigest = readFinancePostingDigest(fields.evidenceDigest);
  return Object.freeze({
    kind: "arc_merchant_payout_confirmation",
    evidenceId,
    evidenceDigest,
    providerAccountId: readFinancePostingIdentifier(fields.providerAccountId),
    bankCashPoolId: readFinancePostingIdentifier(fields.bankCashPoolId),
    merchantPayoutId: readFinancePostingIdentifier(fields.merchantPayoutId),
    amount: readFinancePostingMoney(fields.amount),
    confirmedAt: readFinancePostingInstant(fields.confirmedAt),
    observedAt: readFinancePostingInstant(fields.observedAt)
  });
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
