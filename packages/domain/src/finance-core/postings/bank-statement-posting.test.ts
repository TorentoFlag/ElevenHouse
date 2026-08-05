import { describe, expect, it } from "vitest";
import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import {
  buildUnknownBankCreditPosting as buildUnknownBankCreditPostingWithEnvelope,
  buildUnknownBankDebitPosting as buildUnknownBankDebitPostingWithEnvelope
} from "./bank-statement-posting";
import {
  expectJournalEntries,
  expectPostingError,
  noPostingLinks as noLinks
} from "./bank-posting-test-assertions";
import {
  unknownStatementAuthority,
  validUnknownCreditInput
} from "./bank-statement-posting-test-fixtures";
import { postingContext, withPostingDecoderEnvelope } from "./posting-test-primitives";

const buildUnknownBankCreditPosting = withPostingDecoderEnvelope(
  buildUnknownBankCreditPostingWithEnvelope
);
const buildUnknownBankDebitPosting = withPostingDecoderEnvelope(
  buildUnknownBankDebitPostingWithEnvelope
);

describe("bank statement posting", () => {
  it("posts an unknown bank debit to debit suspense without classifying it as a payout", () => {
    const result = buildUnknownBankDebitPosting({
      context: postingContext(
        "journal-unknown-debit-1",
        "proof-unknown-debit-1",
        "unknown-debit-operation-1",
        {
          kind: "bank",
          sourceId: "unknown-debit-operation-1-statement-entry",
          operation: "unknown_debit_recorded"
        },
        "2026-08-05T07:00:00Z",
        "2026-08-05T07:03:00Z"
      ),
      authority: unknownStatementAuthority({
        direction: "debit",
        authorityId: "unknown-debit-classification-1",
        operationId: "unknown-debit-operation-1",
        amountMinor: 2_500_000,
        bookedAt: "2026-08-05T07:00:00Z",
        observedAt: "2026-08-05T07:02:00Z"
      })
    });

    expectJournalEntries(result, [
      {
        account: {
          code: "bank_unmatched_debit_suspense",
          bankCashPoolId: "bank-pool-rub-1",
          currency: "RUB"
        },
        side: "debit",
        amount: { amountMinor: 2_500_000, currency: "RUB" },
        links: noLinks
      },
      {
        account: {
          code: "bank_cash",
          bankCashPoolId: "bank-pool-rub-1",
          currency: "RUB"
        },
        side: "credit",
        amount: { amountMinor: 2_500_000, currency: "RUB" },
        links: noLinks
      }
    ]);
  });

  it("posts an unknown bank credit to credit suspense without treating it as revenue", () => {
    const result = buildUnknownBankCreditPosting({
      context: postingContext(
        "journal-unknown-credit-1",
        "proof-unknown-credit-1",
        "unknown-credit-operation-1",
        {
          kind: "bank",
          sourceId: "unknown-credit-operation-1-statement-entry",
          operation: "unknown_credit_recorded"
        },
        "2026-08-05T08:00:00Z",
        "2026-08-05T08:03:00Z"
      ),
      authority: unknownStatementAuthority({
        direction: "credit",
        authorityId: "unknown-credit-classification-1",
        operationId: "unknown-credit-operation-1",
        amountMinor: 5_000_000,
        bookedAt: "2026-08-05T08:00:00Z",
        observedAt: "2026-08-05T08:02:00Z"
      })
    });

    expectJournalEntries(result, [
      {
        account: {
          code: "bank_cash",
          bankCashPoolId: "bank-pool-rub-1",
          currency: "RUB"
        },
        side: "debit",
        amount: { amountMinor: 5_000_000, currency: "RUB" },
        links: noLinks
      },
      {
        account: {
          code: "bank_unmatched_credit_suspense",
          bankCashPoolId: "bank-pool-rub-1",
          currency: "RUB"
        },
        side: "credit",
        amount: { amountMinor: 5_000_000, currency: "RUB" },
        links: noLinks
      }
    ]);
  });

  it.each([
    ["zero", { amountMinor: 0, currency: "RUB" }],
    ["unsafe", { amountMinor: Number.MAX_SAFE_INTEGER + 1, currency: "RUB" }],
    ["wrong currency", { amountMinor: 5_000_000, currency: "USD" }]
  ])("rejects %s unknown-bank money", (_name, amount) => {
    const input = validUnknownCreditInput();
    expectPostingError(
      () =>
        buildUnknownBankCreditPosting({
          ...input,
          authority: { ...input.authority, amount }
        } as never),
      "invalid_money"
    );
  });

  it.each([
    ["kind", { kind: "settlement" }],
    ["source id", { sourceId: "another-operation" }],
    ["operation", { operation: "unknown_debit_recorded" }]
  ])("rejects a mismatched unknown-bank source %s", (_name, patch) => {
    const input = validUnknownCreditInput();
    expectPostingError(
      () =>
        buildUnknownBankCreditPosting({
          ...input,
          context: {
            ...input.context,
            sourceKey: { ...input.context.sourceKey, ...patch }
          }
        } as never),
      "source_mismatch"
    );
  });

  it("uses the immutable bank statement entry as duplicate-fact identity", () => {
    const first = validUnknownCreditInput();
    const statementEntryId = first.authority.evidence.bankStatementEntryId;
    const firstPosting = buildUnknownBankCreditPosting({
      ...first,
      context: {
        ...first.context,
        sourceKey: { ...first.context.sourceKey, sourceId: statementEntryId }
      }
    });
    const secondOperationId = "unknown-credit-retry-operation";
    const secondPosting = buildUnknownBankCreditPosting({
      context: {
        ...first.context,
        journalTransactionId: "journal-unknown-credit-retry",
        linkProofId: "proof-unknown-credit-retry",
        operationId: secondOperationId,
        sourceKey: { ...first.context.sourceKey, sourceId: statementEntryId }
      },
      authority: { ...first.authority, operationId: secondOperationId }
    });

    expect(firstPosting.transaction.sourceKey).toEqual(secondPosting.transaction.sourceKey);
    expect(firstPosting.transaction.sourceKey.sourceId).toBe(statementEntryId);
    expect(firstPosting.linkProof.allocationAuthorityRef.canonicalDigest).toBe(
      hashFinanceCommandPayload(first.authority)
    );
    expect(firstPosting.linkProof.sourceEvidenceRef).toEqual({
      kind: "bank_statement_entry",
      evidenceId: first.authority.evidence.evidenceId,
      canonicalDigest: first.authority.evidence.evidenceDigest
    });
  });
});
