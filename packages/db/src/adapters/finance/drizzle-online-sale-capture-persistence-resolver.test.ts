import { createHash } from "node:crypto";

import type { CanonicalOnlineSaleCaptureSemanticCommitReceipt } from "@elevenhouse/domain/finance-core";
import { describe, expect, it } from "vitest";

import {
  buildOnlineSaleCapturePersistenceCommand,
  ensureCanonicalClientOrderCaptureFactInTransaction,
  OnlineSaleCapturePersistenceResolutionError,
  type LockedOnlineSaleCaptureResolution
} from "./drizzle-online-sale-capture-persistence-resolver";

const astrologerId = "11111111-1111-4111-8111-111111111111";
const clientId = "22222222-2222-4222-8222-222222222222";
const orderId = "33333333-3333-4333-8333-333333333333";
const policyId = "44444444-4444-4444-8444-444444444444";
const digest = `sha256:${"a".repeat(64)}`;

describe("buildOnlineSaleCapturePersistenceCommand", () => {
  it("derives a bounded v2 receipt and balanced sale journal only from locked authority", () => {
    const command = buildOnlineSaleCapturePersistenceCommand(fixture());

    expect(command.kind).toBe("online_sale_capture_persistence_command");
    expect(command.astrologerUserId).toBe(astrologerId);
    expect(command.receipt.operationId).toBe(captureFactId());
    expect(command.receipt.expectedWalletRevision).toBe("7");
    expect(command.receipt.previousCommitmentDigest).toBe(`sha256:${"b".repeat(64)}`);
    expect(command.receipt.rootLot).toMatchObject({
      sourceId: orderId,
      astrologerUserId: astrologerId,
      bucket: "pending",
      amount: { amountMinor: 9_000, currency: "RUB" },
      captureSource: {
        canonicalEvidenceId: captureFactId(),
        intentId: "intent-1",
        providerPaymentId: "payment-1"
      }
    });
    expect(command.journal).toMatchObject({
      sourceKey: { kind: "order", sourceId: orderId, operation: "sale_captured" },
      totalDebitMinor: "10000",
      totalCreditMinor: "10000"
    });
    expect(command.journal.entries).toEqual([
      expect.objectContaining({
        account: {
          code: "arc_provider_clearing",
          arcProviderAccountId: "arc-account",
          currency: "RUB"
        },
        side: "debit",
        amount: { amountMinor: 10_000, currency: "RUB" }
      }),
      expect.objectContaining({
        account: {
          code: "astrologer_pending",
          astrologerUserId: astrologerId,
          currency: "RUB"
        },
        side: "credit",
        amount: { amountMinor: 9_000, currency: "RUB" },
        links: expect.objectContaining({ payableLotId: command.receipt.rootLot.lotId })
      }),
      expect.objectContaining({
        account: { code: "platform_commission_deferred", currency: "RUB" },
        side: "credit",
        amount: { amountMinor: 1_000, currency: "RUB" }
      })
    ]);
  });

  it("rejects authority whose immutable order owner is not the economics owner", () => {
    const input = fixture();
    input.order.astrologerUserId = clientId;

    expect(() => buildOnlineSaleCapturePersistenceCommand(input)).toThrow(
      OnlineSaleCapturePersistenceResolutionError
    );
  });

  it("rejects a semantic capture amount that differs from locked order economics", () => {
    const input = fixture();
    input.semanticCapture = semantic({ amountMinor: "9999" });

    expect(() => buildOnlineSaleCapturePersistenceCommand(input)).toThrow(
      OnlineSaleCapturePersistenceResolutionError
    );
  });

  it("rejects a semantic payment intent that is not the checkout authorization", () => {
    const input = fixture();
    input.semanticCapture = semantic({ economicPaymentIntentId: "other-intent" });

    expect(() => buildOnlineSaleCapturePersistenceCommand(input)).toThrow(
      OnlineSaleCapturePersistenceResolutionError
    );
  });
});

describe("ensureCanonicalClientOrderCaptureFactInTransaction", () => {
  it("writes the deterministic capture fact from sealed semantic evidence", async () => {
    let inserted: Record<string, unknown> | null = null;
    const query = {
      from() {
        return query;
      },
      where() {
        return query;
      },
      limit() {
        return query;
      },
      for() {
        return Promise.resolve([]);
      }
    };
    const transaction = {
      select() {
        return query;
      },
      insert() {
        return {
          values(value: Record<string, unknown>) {
            inserted = value;
            return {
              returning() {
                return Promise.resolve([{ id: value.id }]);
              }
            };
          }
        };
      }
    };

    await expect(
      ensureCanonicalClientOrderCaptureFactInTransaction(transaction as never, semantic())
    ).resolves.toBe(captureFactId());
    expect(inserted).toMatchObject({
      id: captureFactId(),
      economicPaymentIntentId: "intent-1",
      economicPaymentSessionId: "session-1",
      providerAccountId: "arc-account",
      providerPaymentId: "payment-1",
      amountMinor: "10000",
      evidenceAuthorityKind: "provider_semantic_fact",
      evidenceAuthorityId: "semantic-1",
      evidenceArtifactId: "artifact-1"
    });
  });
});

function fixture(): LockedOnlineSaleCaptureResolution {
  return {
    semanticCapture: semantic(),
    authorization: {
      orderId,
      clientUserId: clientId,
      economicPaymentIntentId: "intent-1",
      economicPaymentSessionId: "session-1",
      riskPolicyId: policyId,
      riskPolicyVersion: "1",
      riskPolicyDigest: digest,
      fulfillmentDecisionId: "single.once.live.solo",
      fulfillmentDecisionVersion: "1",
      fulfillmentDecisionDigest: digest
    },
    order: {
      id: orderId,
      clientUserId: clientId,
      astrologerUserId: astrologerId,
      status: "pending_payment",
      grossAmountMinor: "10000",
      grossCurrency: "RUB",
      platformFeeAmountMinor: "1000",
      platformFeeCurrency: "RUB",
      astrologerNetAmountMinor: "9000",
      astrologerNetCurrency: "RUB",
      tariffCommissionBps: 1000
    },
    economics: {
      orderId,
      astrologerUserId: astrologerId,
      planId: "plan-1",
      planVersionId: "plan-version-1",
      grossAmountMinor: "10000",
      grossCurrency: "RUB",
      commissionAmountMinor: "1000",
      commissionCurrency: "RUB",
      payableAmountMinor: "9000",
      payableCurrency: "RUB",
      commissionBps: 1000,
      allocationRevision: "bps_half_up_v1"
    },
    risk: {
      policyId,
      policyVersion: "1",
      canonicalDigest: digest,
      effectiveRiskTier: "standard",
      holdAnchor: "booking_completed",
      holdDurationHours: 48,
      reserveBps: 0,
      reserveReleaseDelayDays: 0,
      providerSettlementRequired: true,
      payoutMinimumAmountMinor: "100",
      payoutMinimumCurrency: "RUB",
      exceptionAuthorityId: null,
      exceptionAuthorityVersion: null,
      effectiveAt: "2026-08-01T00:00:00Z"
    },
    fulfillment: {
      registryKey: "single.once.live.solo",
      registryRevision: "1",
      canonicalDigest: digest,
      supported: true,
      holdAnchor: "booking_completed",
      terminalEvidenceOwner: "booking",
      terminalEvidenceStatus: "completed",
      terminalEvidenceContractVersion: "1",
      cancellationAllocatorOwner: "booking",
      cancellationAllocatorPort: "BookingCancellationRefundDecisionPort",
      cancellationAllocatorPolicyVersion: "1"
    },
    walletHead: {
      id: "55555555-5555-4555-8555-555555555555",
      astrologerUserId: astrologerId,
      currency: "RUB",
      revision: "7",
      lastCommitmentDigest: `sha256:${"b".repeat(64)}`
    }
  };
}

function semantic(
  overrides: Partial<CanonicalOnlineSaleCaptureSemanticCommitReceipt> = {}
): CanonicalOnlineSaleCaptureSemanticCommitReceipt {
  return {
    kind: "webhook_semantic_commit_receipt",
    receiptId: "66666666-6666-4666-8666-666666666666",
    inboxItemId: "inbox-1",
    inboxVersion: 2,
    committedCheckpointSequence: 1,
    semanticFactId: "semantic-1",
    semanticSourceKind: "payment_transition",
    semanticSourceId: "provider-event-1",
    providerAccount: {
      seriesId: "arc-series",
      providerAccountId: "arc-account",
      identityVersion: 1
    },
    economicPaymentIntentId: "intent-1",
    economicPaymentSessionId: "session-1",
    purpose: "client_order",
    providerPaymentId: "payment-1",
    amountMinor: "10000",
    currency: "RUB",
    canonicalFactDigest: digest,
    evidenceArtifactId: "artifact-1",
    evidenceArtifactDigest: digest,
    observedAt: "2026-08-05T00:00:00Z",
    businessEffect: "applied_once",
    walletJournalCommitReceipt: null,
    persistenceTransactionBoundaryRef: "postgres-xid:1",
    committedAt: "2026-08-05T00:00:01Z",
    ...overrides
  } as CanonicalOnlineSaleCaptureSemanticCommitReceipt;
}

function captureFactId(): string {
  return `capture:semantic:${createHash("sha256").update("semantic-1", "utf8").digest("hex")}`;
}
