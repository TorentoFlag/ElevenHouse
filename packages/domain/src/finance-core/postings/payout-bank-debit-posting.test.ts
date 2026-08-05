import { describe, expect, it } from "vitest";
import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { buildUnverifiedPayoutBankDebitDirectMatchPosting } from "./payout-bank-debit-posting";
import { PayoutPostingContradictionError } from "./payout-posting-contradiction";
import { payoutExposureBindingFixture } from "./payout-bank-exposure-test-fixtures";
import { postingDecoderEnvelope, sha } from "./posting-test-primitives";

describe("payout bank debit direct match", () => {
  it("uses the statement natural ID and clears bank cash exactly once", () => {
    const fixture = debitFixture();
    const recipe = buildUnverifiedPayoutBankDebitDirectMatchPosting(
      fixture.input,
      postingDecoderEnvelope
    );
    expect(recipe.transaction.sourceKey).toEqual({
      kind: "bank",
      sourceId: "statement-debit-1",
      operation: "payout_debit_matched"
    });
    expect(recipe.transaction.occurredAt).toBe("2026-09-04T03:00:00Z");
    expect(recipe.transaction.entries.map((entry) => [entry.account.code, entry.side])).toEqual([
      ["bank_outbound_clearing", "debit"],
      ["bank_cash", "credit"]
    ]);
  });

  it.each([
    [
      "partial coverage",
      (fixture: ReturnType<typeof debitFixture>) => ({
        ...fixture.input,
        authority: {
          ...fixture.input.authority,
          priorClearingCoverage: rehashCoverage({
            ...fixture.input.authority.priorClearingCoverage,
            claimedRemainingAmount: { amountMinor: 8_999, currency: "RUB" }
          })
        }
      })
    ],
    [
      "wrong direction",
      (fixture: ReturnType<typeof debitFixture>) => ({
        ...fixture.input,
        authority: {
          ...fixture.input.authority,
          evidence: { ...fixture.input.authority.evidence, direction: "credit" }
        }
      })
    ],
    [
      "wrong path",
      (fixture: ReturnType<typeof debitFixture>) => ({
        ...fixture.input,
        authority: {
          ...fixture.input.authority,
          evidence: {
            ...fixture.input.authority.evidence,
            classificationPath: "unknown_then_reclassification"
          }
        }
      })
    ]
  ] as const)("rejects %s", (_label, mutate) => {
    const fixture = debitFixture();
    expect(() =>
      buildUnverifiedPayoutBankDebitDirectMatchPosting(mutate(fixture), postingDecoderEnvelope)
    ).toThrow();
  });

  it("quarantines a bank debit after definitive no-debit return", () => {
    const fixture = debitFixture();
    const terminal = payoutExposureBindingFixture({
      previous: fixture.paid,
      transitionKind: "returned_without_debit",
      exposureVersion: "4",
      status: "returned_without_debit",
      occurredAt: "2026-09-04T02:30:00Z",
      overrides: fixture.scope
    });
    expect(() =>
      buildUnverifiedPayoutBankDebitDirectMatchPosting(
        { ...fixture.input, previousExposureBinding: terminal },
        postingDecoderEnvelope
      )
    ).toThrowError(
      expect.objectContaining<Partial<PayoutPostingContradictionError>>({
        reason: "bank_debit_after_definitive_no_debit"
      })
    );
  });
});

function debitFixture() {
  const scope = {
    payoutRequestId: "receipt-payout",
    amount: { amountMinor: 9_000, currency: "RUB" }
  } as const;
  const committed = payoutExposureBindingFixture({ overrides: scope });
  const initiated = payoutExposureBindingFixture({
    previous: committed,
    transitionKind: "bank_work_initiated",
    exposureVersion: "2",
    status: "initiated_unreflected",
    occurredAt: "2026-09-04T01:00:00Z",
    overrides: scope
  });
  const paid = payoutExposureBindingFixture({
    previous: initiated,
    transitionKind: "paid_proven",
    exposureVersion: "3",
    status: "paid_unreflected",
    occurredAt: "2026-09-04T02:00:00Z",
    overrides: scope
  });
  const matchAuthorityRef = Object.freeze({
    kind: "bank_statement_match",
    authorityId: "bank-statement-match-1",
    version: 1,
    canonicalDigest: sha("d")
  });
  const exposureTransition = payoutExposureBindingFixture({
    previous: paid,
    transitionKind: "statement_debit_reflected",
    exposureVersion: "4",
    status: "statement_reflected",
    occurredAt: "2026-09-04T03:02:00Z",
    overrides: { ...scope, transitionAuthorityRef: matchAuthorityRef }
  });
  const coverageCore = {
    kind: "unverified_payout_outbound_clearing_coverage_binding" as const,
    schemaVersion: 1 as const,
    bindingId: "payout-clearing-coverage-1",
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    bankExposureId: paid.bankExposureId,
    payoutRequestId: scope.payoutRequestId,
    bankCashPoolId: paid.bankCashPoolId,
    amount: scope.amount,
    claimedRemainingAmount: scope.amount,
    claimedConsumptionStatus: "unconsumed" as const,
    paidExposureBindingRef: {
      bindingId: paid.bindingId,
      exposureVersion: paid.exposureVersion,
      status: paid.status,
      bindingDigest: paid.bindingDigest
    },
    paidOperationReceiptId: "receipt-payout-paid",
    paidOperationReceiptDigest: sha("a"),
    paidAuthorityRef: {
      kind: "payout_paid",
      authorityId: "payout-paid-authority-1",
      version: 1,
      canonicalDigest: sha("b")
    },
    bankReference: "receipt-bank-reference",
    clearingJournalTransactionId: "journal-payout-paid",
    clearingJournalTransactionDigest: sha("c"),
    issuedAt: "2026-09-04T02:01:00Z"
  };
  const priorClearingCoverage = Object.freeze({
    ...coverageCore,
    bindingDigest: hashFinanceCommandPayload(coverageCore)
  });
  const evidence = Object.freeze({
    kind: "bank_statement_entry" as const,
    classificationPath: "direct_match" as const,
    classificationAuthorityId: matchAuthorityRef.authorityId,
    classificationVersion: matchAuthorityRef.version,
    evidenceId: "statement-debit-evidence-1",
    evidenceDigest: sha("e"),
    bankStatementEntryId: "statement-debit-1",
    bankCashPoolId: paid.bankCashPoolId,
    direction: "debit" as const,
    amount: scope.amount,
    bookedAt: "2026-09-04T03:00:00Z",
    observedAt: "2026-09-04T03:01:00Z",
    sourceCheckpointId: "statement-checkpoint-1"
  });
  return {
    paid,
    scope,
    input: {
      context: {
        journalTransactionId: "journal-statement-debit-1",
        linkProofId: "proof-statement-debit-1",
        operationId: "payout-debit-match-operation-1",
        sourceKey: {
          kind: "bank" as const,
          sourceId: evidence.bankStatementEntryId,
          operation: "payout_debit_matched" as const
        },
        occurredAt: evidence.bookedAt,
        postedAt: "2026-09-04T03:02:00Z"
      },
      authority: {
        kind: "payout_bank_debit_direct_match" as const,
        authorityId: "payout-debit-match-authority-1",
        version: 1,
        operationId: "payout-debit-match-operation-1",
        payoutRequestId: scope.payoutRequestId,
        bankCashPoolId: paid.bankCashPoolId,
        amount: scope.amount,
        matchedAt: "2026-09-04T03:02:00Z",
        priorClearingCoverage,
        exposureTransition,
        evidence,
        matchAuthorityRef
      },
      previousExposureBinding: paid
    }
  };
}

function rehashCoverage<T extends Record<string, unknown>>(value: T): T {
  const core = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "bindingDigest"));
  return { ...value, bindingDigest: hashFinanceCommandPayload(core) };
}
