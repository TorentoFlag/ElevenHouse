import type { FinanceJournalEntryInput } from "../journal";
import type { FinanceLedgerAccountCode } from "../ledger-chart";
import {
  assertFinancePostingMoneyEqual,
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataRecord
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import {
  readFinanceJournalPostingContext,
  type FinanceJournalPostingContext
} from "./posting-event-identity";
import {
  readProviderFeeConfirmedFact,
  readProviderFeeReturnedFact,
  sameProviderFeeSubject,
  type ProviderFeeConfirmedFact,
  type ProviderFeeReturnedFact,
  type ProviderFeeType
} from "./provider-fee-posting-fact";
import { createUnverifiedFinanceJournalPostingRecipe } from "./posting-recipe";
import type { UnverifiedFinancePostingRecipe } from "./posting-types";

type JournalRecipe = Extract<UnverifiedFinancePostingRecipe, { readonly kind: "journal" }>;

const expenseCodes = Object.freeze({
  acquiring: "provider_fee_expense",
  chargeback_processing: "chargeback_fee_expense"
} satisfies Record<ProviderFeeType, FinanceLedgerAccountCode>);

const noLinks = Object.freeze({
  originalSaleId: null,
  componentId: null,
  payableLotId: null,
  payoutAllocationId: null
});

export function buildProviderFeeConfirmedPosting(
  input: Readonly<{ context: FinanceJournalPostingContext; fact: ProviderFeeConfirmedFact }>,
  envelopeInput: FinancePostingDecoderEnvelope
): JournalRecipe;
export function buildProviderFeeConfirmedPosting(
  input: unknown,
  envelopeInput: unknown
): JournalRecipe {
  const envelope = normalizeFinancePostingDecoderEnvelope(envelopeInput);
  const root = readExactDataRecord(input, ["context", "fact"]);
  const context = readFinanceJournalPostingContext(root.context, envelope);
  const fact = readProviderFeeConfirmedFact(root.fact);
  assertContext(context, fact.providerFeeId, "confirmed", fact.occurredAt, fact.observedAt);
  return buildRecipe(context, fact, confirmedEntries(fact), envelope);
}

export function buildProviderFeeReturnedPosting(
  input: Readonly<{
    context: FinanceJournalPostingContext;
    fact: ProviderFeeReturnedFact;
    originalFact: ProviderFeeConfirmedFact;
  }>,
  envelopeInput: FinancePostingDecoderEnvelope
): JournalRecipe;
export function buildProviderFeeReturnedPosting(
  input: unknown,
  envelopeInput: unknown
): JournalRecipe {
  const envelope = normalizeFinancePostingDecoderEnvelope(envelopeInput);
  const root = readExactDataRecord(input, ["context", "fact", "originalFact"]);
  const context = readFinanceJournalPostingContext(root.context, envelope);
  const fact = readProviderFeeReturnedFact(root.fact);
  const original = readProviderFeeConfirmedFact(root.originalFact);
  assertContext(context, fact.providerFeeReturnId, "returned", fact.occurredAt, fact.observedAt);
  assertReturn(fact, original);
  return buildRecipe(context, fact, returnedEntries(fact), envelope);
}

function buildRecipe(
  context: FinanceJournalPostingContext,
  fact: ProviderFeeConfirmedFact | ProviderFeeReturnedFact,
  entries: readonly FinanceJournalEntryInput[],
  envelope: FinancePostingDecoderEnvelope
): JournalRecipe {
  const evidenceId =
    fact.kind === "provider_fee_confirmed_fact" ? fact.providerFeeId : fact.providerFeeReturnId;
  return createUnverifiedFinanceJournalPostingRecipe(
    {
      context,
      authorityRef: {
        kind: fact.kind,
        authorityId: evidenceId,
        version: fact.version,
        canonicalDigest: fact.canonicalDigest
      },
      sourceEvidenceRef: {
        kind: fact.kind,
        evidenceId,
        canonicalDigest: fact.canonicalDigest
      },
      operationSnapshotRef: null,
      entries,
      entrySourceLinks: [null, null]
    },
    envelope
  );
}

function confirmedEntries(fact: ProviderFeeConfirmedFact): readonly FinanceJournalEntryInput[] {
  return Object.freeze([
    {
      account: { code: expenseCodes[fact.feeType], currency: "RUB" },
      side: "debit",
      amount: fact.amount,
      links: noLinks
    },
    {
      account: {
        code: "arc_provider_clearing",
        arcProviderAccountId: fact.arcProviderAccountId,
        currency: "RUB"
      },
      side: "credit",
      amount: fact.amount,
      links: noLinks
    }
  ]);
}

function returnedEntries(fact: ProviderFeeReturnedFact): readonly FinanceJournalEntryInput[] {
  return Object.freeze([
    {
      account: {
        code: "arc_provider_clearing",
        arcProviderAccountId: fact.arcProviderAccountId,
        currency: "RUB"
      },
      side: "debit",
      amount: fact.amount,
      links: noLinks
    },
    {
      account: { code: expenseCodes[fact.feeType], currency: "RUB" },
      side: "credit",
      amount: fact.amount,
      links: noLinks
    }
  ]);
}

function assertReturn(fact: ProviderFeeReturnedFact, original: ProviderFeeConfirmedFact): void {
  const ref = fact.originalFeeRef;
  if (
    ref.providerFeeId !== original.providerFeeId ||
    ref.version !== original.version ||
    ref.canonicalDigest !== original.canonicalDigest ||
    !sameProviderFeeSubject(fact, original)
  ) {
    fail("evidence_mismatch");
  }
  if (fact.providerFeeReturnId === original.providerFeeId) fail("source_mismatch");
  if (fact.arcProviderAccountId !== original.arcProviderAccountId) fail("scope_mismatch");
  assertFinancePostingMoneyEqual(fact.amount, original.amount, "amount_mismatch");
  if (
    compareFinancePostingInstants(original.observedAt, original.occurredAt) < 0 ||
    compareFinancePostingInstants(fact.occurredAt, original.observedAt) < 0
  ) {
    fail("invalid_chronology");
  }
}

function assertContext(
  context: FinanceJournalPostingContext,
  sourceId: string,
  operation: "confirmed" | "returned",
  occurredAt: string,
  observedAt: string
): void {
  if (
    context.operationId !== sourceId ||
    context.sourceKey.kind !== "provider_fee" ||
    context.sourceKey.sourceId !== sourceId ||
    context.sourceKey.operation !== operation
  ) {
    fail("source_mismatch");
  }
  if (
    context.occurredAt !== occurredAt ||
    compareFinancePostingInstants(observedAt, occurredAt) < 0 ||
    compareFinancePostingInstants(context.postedAt, observedAt) < 0
  ) {
    fail("invalid_chronology");
  }
}

function fail(reason: ConstructorParameters<typeof FinancePostingIntegrityError>[0]): never {
  throw new FinancePostingIntegrityError(reason);
}
