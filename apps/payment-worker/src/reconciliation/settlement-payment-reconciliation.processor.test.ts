import {
  createFinanceOperationResourcePolicyDraft,
  createProviderAccountIdentityBinding,
  publishFinanceOperationResourcePolicyDraft
} from "@elevenhouse/domain/finance-core";
import { describe, expect, it } from "vitest";

import {
  createSettlementPaymentReconciliationProcessor,
  type SettlementPaymentReconciliationCandidate
} from "./settlement-payment-reconciliation.processor";

const providerAccount = createProviderAccountIdentityBinding({
  seriesId: "arc-series-main",
  providerAccountId: "arc-account-main",
  identityVersion: 1
});

const policy = publishFinanceOperationResourcePolicyDraft(
  createFinanceOperationResourcePolicyDraft({
    policyId: "settlement-ingestion-v1",
    version: 1,
    operationKind: "settlement_ingestion",
    maximumRows: 100,
    maximumDecimalDigits: 38,
    maximumArtifactBytes: 2 * 1024 * 1024
  })
);

describe("settlement payment reconciliation processor", () => {
  it("advances an exact available ArcPay payment through settlement and provider match", async () => {
    const calls: string[] = [];
    const processor = createSettlementPaymentReconciliationProcessor(
      harness(calls, [candidate({ clearing: { state: "unmatched", version: 1 } })])
    );

    await expect(processor.tick()).resolves.toEqual({
      kind: "reconciled",
      inspected: 1,
      providerMatched: 1,
      quarantinedMissingCapture: 0,
      quarantinedRuleMismatch: 0,
      skippedPending: 0,
      alreadyMatched: 0
    });
    expect(calls).toEqual(["account", "policy", "candidates", "settlement-seen:1", "match:2", "provider-matched:2"]);
  });

  it("quarantines an ArcPay payment that has no internal captured payment and makes no financial transition", async () => {
    const calls: string[] = [];
    const processor = createSettlementPaymentReconciliationProcessor(
      harness(calls, [candidate({ capture: null, clearing: null })])
    );

    await expect(processor.tick()).resolves.toMatchObject({
      kind: "reconciled",
      quarantinedMissingCapture: 1,
      providerMatched: 0
    });
    expect(calls).toEqual(["account", "policy", "candidates", "quarantine-missing-capture"]);
  });

  it("leaves a pending provider position out of matching until ArcPay makes it available", async () => {
    const calls: string[] = [];
    const processor = createSettlementPaymentReconciliationProcessor(
      harness(calls, [candidate({ settlementStatus: "pending" })])
    );

    await expect(processor.tick()).resolves.toMatchObject({
      kind: "reconciled",
      skippedPending: 1,
      providerMatched: 0
    });
    expect(calls).toEqual(["account", "policy", "candidates"]);
  });
});

function harness(calls: string[], candidates: readonly SettlementPaymentReconciliationCandidate[]) {
  return {
    providerAccounts: {
      async findActiveProviderAccount() {
        calls.push("account");
        return providerAccount;
      }
    },
    operationPolicies: {
      async findPublishedForOperation() {
        calls.push("policy");
        return policy;
      }
    },
    candidates: {
      async listOpenPaymentCandidates() {
        calls.push("candidates");
        return candidates;
      }
    },
    settlementSeen: {
      async advance(input: { expectedClearingVersion: number }) {
        calls.push(`settlement-seen:${input.expectedClearingVersion}`);
      }
    },
    createMatcher() {
      return {
        async matchSettlementPayment(input: { expectedClearingVersion: number }) {
          calls.push(`match:${input.expectedClearingVersion}`);
          return { matchResult: "matched" as const, ref: { receiptId: "match-receipt" } };
        }
      }
    },
    providerMatched: {
      async advance(input: { expectedClearingVersion: number }) {
        calls.push(`provider-matched:${input.expectedClearingVersion}`);
      }
    },
    quarantine: {
      async quarantineMissingCapture() {
        calls.push("quarantine-missing-capture");
      }
    }
  };
}

function candidate(
  input: Partial<{
    capture: { economicPaymentIntentId: string } | null;
    clearing: { state: "unmatched" | "settlement_seen" | "provider_matched"; version: number } | null;
    settlementStatus: string | null;
  }> = {}
) : SettlementPaymentReconciliationCandidate {
  return {
    providerEntryKey: { providerAccount, providerEntryId: "entry-1" },
    batchIngestion: {
      kind: "settlement_batch_ingestion_commit_receipt" as const,
      receiptId: "batch-1",
      version: 1 as const,
      canonicalDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const
    },
    referenceType: "payment",
    direction: "credit",
    entryType: "payment_credit",
    settlementStatus: input.settlementStatus === undefined ? "available" : input.settlementStatus,
    capture: input.capture === undefined ? { economicPaymentIntentId: "payment-intent-1" } : input.capture,
    clearing: input.clearing === undefined ? { state: "unmatched" as const, version: 1 } : input.clearing
  } as unknown as SettlementPaymentReconciliationCandidate;
}
