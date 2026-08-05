import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import type { Money } from "../../money";
import {
  assertFinancePostingInstantEqual,
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingIdentifier,
  readFinancePostingInstant,
  readFinancePostingMoney,
  readFinancePostingVersion
} from "./posting-codec";
import {
  assertBankStatementClassification,
  readBankStatementEntryEvidence,
  type BankStatementEntryEvidence
} from "./bank-statement-evidence";
import {
  readFinanceJournalPostingContext,
  type FinanceJournalPostingContext
} from "./posting-event-identity";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import { createUnverifiedFinanceJournalPostingRecipe } from "./posting-recipe";
import type { UnverifiedFinancePostingRecipe } from "./posting-types";

export {
  assertBankStatementClassification,
  readBankStatementEntryEvidence,
  type BankStatementClassificationPath,
  type BankStatementEntryEvidence
} from "./bank-statement-evidence";

type JournalRecipe = Extract<UnverifiedFinancePostingRecipe, { readonly kind: "journal" }>;
type PostingInput<Authority> = Readonly<{
  context: Parameters<typeof readFinanceJournalPostingContext>[0];
  authority: Authority;
}>;

export type UnknownBankStatementEntryAuthority = Readonly<{
  kind: "unknown_bank_statement_entry";
  authorityId: string;
  version: number;
  operationId: string;
  direction: "debit" | "credit";
  bankCashPoolId: string;
  amount: Money;
  classifiedAt: string;
  evidence: BankStatementEntryEvidence;
}>;

const noLinks = Object.freeze({
  originalSaleId: null,
  componentId: null,
  payableLotId: null,
  payoutAllocationId: null
});

export function buildUnknownBankDebitPosting(
  input: PostingInput<UnknownBankStatementEntryAuthority>,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): JournalRecipe;
export function buildUnknownBankDebitPosting(
  input: unknown,
  decoderEnvelopeInput: unknown
): JournalRecipe {
  const decoderEnvelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  return buildUnknownBankStatementPosting(input, "debit", decoderEnvelope);
}

export function buildUnknownBankCreditPosting(
  input: PostingInput<UnknownBankStatementEntryAuthority>,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): JournalRecipe;
export function buildUnknownBankCreditPosting(
  input: unknown,
  decoderEnvelopeInput: unknown
): JournalRecipe {
  const decoderEnvelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  return buildUnknownBankStatementPosting(input, "credit", decoderEnvelope);
}

function buildUnknownBankStatementPosting(
  input: unknown,
  expectedDirection: "debit" | "credit",
  decoderEnvelope: FinancePostingDecoderEnvelope
): JournalRecipe {
  const root = readExactDataRecord(input, ["context", "authority"]);
  const context = readFinanceJournalPostingContext(root.context, decoderEnvelope);
  const fields = readExactDataRecord(root.authority, [
    "kind",
    "authorityId",
    "version",
    "operationId",
    "direction",
    "bankCashPoolId",
    "amount",
    "classifiedAt",
    "evidence"
  ]);
  if (fields.kind !== "unknown_bank_statement_entry" || fields.direction !== expectedDirection) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  const authorityId = readFinancePostingIdentifier(fields.authorityId);
  const version = readFinancePostingVersion(fields.version);
  const operationId = readFinancePostingIdentifier(fields.operationId);
  const bankCashPoolId = readFinancePostingIdentifier(fields.bankCashPoolId);
  const amount = readFinancePostingMoney(fields.amount);
  const classifiedAt = readFinancePostingInstant(fields.classifiedAt);
  const evidence = readBankStatementEntryEvidence(fields.evidence, decoderEnvelope);
  const expectedOperation =
    expectedDirection === "debit" ? "unknown_debit_recorded" : "unknown_credit_recorded";

  assertOperationSource(
    context,
    operationId,
    evidence.bankStatementEntryId,
    "bank",
    expectedOperation
  );
  assertBankStatementClassification(
    evidence,
    {
      classificationPath: "unknown_then_reclassification",
      classificationAuthorityId: authorityId,
      classificationVersion: version,
      bankCashPoolId,
      direction: expectedDirection,
      amount
    },
    decoderEnvelope
  );
  assertFinancePostingInstantEqual(classifiedAt, evidence.observedAt, "evidence_mismatch");
  assertFinancePostingInstantEqual(context.occurredAt, evidence.bookedAt, "evidence_mismatch");
  if (compareFinancePostingInstants(context.postedAt, classifiedAt) < 0) {
    throw new FinancePostingIntegrityError("invalid_chronology");
  }

  const entries =
    expectedDirection === "debit"
      ? [
          {
            account: {
              code: "bank_unmatched_debit_suspense" as const,
              bankCashPoolId,
              currency: "RUB" as const
            },
            side: "debit" as const,
            amount,
            links: noLinks
          },
          {
            account: { code: "bank_cash" as const, bankCashPoolId, currency: "RUB" as const },
            side: "credit" as const,
            amount,
            links: noLinks
          }
        ]
      : [
          {
            account: { code: "bank_cash" as const, bankCashPoolId, currency: "RUB" as const },
            side: "debit" as const,
            amount,
            links: noLinks
          },
          {
            account: {
              code: "bank_unmatched_credit_suspense" as const,
              bankCashPoolId,
              currency: "RUB" as const
            },
            side: "credit" as const,
            amount,
            links: noLinks
          }
        ];
  return createUnverifiedFinanceJournalPostingRecipe(
    {
      context,
      authorityRef: {
        kind: "unknown_bank_statement_entry",
        authorityId,
        version,
        canonicalDigest: hashFinanceCommandPayload({
          kind: "unknown_bank_statement_entry",
          authorityId,
          version,
          operationId,
          direction: expectedDirection,
          bankCashPoolId,
          amount,
          classifiedAt,
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
      entries
    },
    decoderEnvelope
  );
}

function assertOperationSource(
  context: FinanceJournalPostingContext,
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
