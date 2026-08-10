import {
  createFinanceOperationResourcePolicyDraft,
  createSettlementCursorKey,
  createSettlementPageCheckpointKey,
  publishFinanceOperationResourcePolicyDraft
} from "@elevenhouse/domain/finance-core";
import { describe, expect, it, vi } from "vitest";

import {
  createSettlementIngestionProcessor,
  createSettlementLedgerIngestionProcessor
} from "./settlement-ledger-ingestion.processor";

const providerAccount = Object.freeze({
  seriesId: "arc-pay-company-merchant",
  providerAccountId: "merchant-1",
  identityVersion: 1
});

describe("createSettlementLedgerIngestionProcessor", () => {
  it("claims, seals and ingests one cursor page before releasing its lease", async () => {
    const cursorKey = createSettlementCursorKey({ providerAccount, stream: "settlement_ledger" });
    const checkpointIdentity = createSettlementPageCheckpointKey({
      cursorKey,
      windowGeneration: 1,
      providerPageCursor: null
    });
    const acquireNextPage = vi
      .fn()
      .mockResolvedValueOnce({
        lease: {
          kind: "settlement_cursor_lease_receipt",
          cursorKey,
          cursorVersion: 2,
          leaseOwnerId: "payment-worker:test",
          leaseToken: "lease-token",
          fencingToken: 1,
          databaseClaimedAt: "2026-08-08T09:59:00.000Z",
          databaseExpiresAt: "2026-08-08T10:10:00.000Z",
          state: "active"
        },
        checkpointIdentity,
        windowStart: "2026-08-08T00:00:00.000Z",
        windowEnd: "2026-08-08T10:00:00.000Z"
      })
      .mockResolvedValueOnce(null);
    const fetchVerifiedPage = vi.fn(async (command) => ({
      kind: "verified_settlement_page_bundle",
      providerAccount,
      checkpointIdentity: command.checkpointIdentity,
      rawArtifact: {
        artifactId: "settlement-page-1",
        sha256Digest: `sha256:${"a".repeat(64)}`,
        byteLength: 100
      },
      decodedEntriesDigest: `sha256:${"b".repeat(64)}`,
      pageEvidence: {
        kind: "verified_settlement_page_evidence",
        providerAccount,
        stream: "settlement_ledger",
        windowGeneration: 1,
        providerPageCursor: null,
        artifact: {
          artifactId: "settlement-page-1",
          sha256Digest: `sha256:${"a".repeat(64)}`,
          byteLength: 100
        },
        fetchedAt: "2026-08-08T10:00:00.000Z"
      },
      verifiedAt: "2026-08-08T10:00:00.000Z",
      stream: "settlement_ledger",
      normalizedEntries: { rows: [], nextCursor: null, returnedCount: 0, operationEnvelope: command.operationEnvelope }
    }));
    const ingestVerifiedPage = vi.fn(async () => ({
      cursorVersion: 3,
      insertedEntryCount: 2,
      replayedEntryCount: 1
    }));
    const releaseLease = vi.fn(async () => ({}));
    const processor = createSettlementLedgerIngestionProcessor({
      providerAccounts: {
        findActiveProviderAccount: vi.fn(async () => providerAccount)
      } as never,
      operationPolicies: {
        findPublishedForOperation: vi.fn(async () => settlementPolicy())
      } as never,
      cursors: {
        ensureCursor: vi.fn(async () => ({ cursorKey, cursorVersion: 1, created: true })),
        acquireNextPage
      } as never,
      leases: { releaseLease } as never,
      provider: { transactionBoundary: "outside_database_transaction", fetchVerifiedPage } as never,
      ingestion: { ingestVerifiedPage } as never,
      workerId: "payment-worker:test",
      initialBackfillStart: () => "2026-08-06T10:00:00.000Z",
      overlapSeconds: 3600,
      leaseDurationSeconds: 90,
      maximumPageCount: 100
    });

    await expect(processor.tick()).resolves.toEqual({
      kind: "ingested",
      cursorCreated: true,
      pages: 1,
      insertedEntries: 2,
      replayedEntries: 1
    });
    expect(fetchVerifiedPage).toHaveBeenCalledWith(
      expect.objectContaining({ cursorKey, checkpointIdentity })
    );
    expect(ingestVerifiedPage).toHaveBeenCalledWith(
      expect.objectContaining({ expectedCursorVersion: 2 })
    );
    expect(releaseLease).toHaveBeenCalledWith({
      cursorKey,
      expectedCursorVersion: 3,
      leaseOwnerId: "payment-worker:test",
      leaseToken: "lease-token",
      fencingToken: 1
    });
  });

  it("does not fetch when another worker holds the cursor lease", async () => {
    const processor = createSettlementLedgerIngestionProcessor({
      providerAccounts: { findActiveProviderAccount: vi.fn(async () => providerAccount) } as never,
      operationPolicies: { findPublishedForOperation: vi.fn(async () => settlementPolicy()) } as never,
      cursors: {
        ensureCursor: vi.fn(async () => ({ created: false })),
        acquireNextPage: vi.fn(async () => {
          throw { reason: "lease_already_active" };
        })
      } as never,
      leases: { releaseLease: vi.fn() } as never,
      provider: { transactionBoundary: "outside_database_transaction", fetchVerifiedPage: vi.fn() } as never,
      ingestion: { ingestVerifiedPage: vi.fn() } as never,
      workerId: "payment-worker:test",
      initialBackfillStart: () => "2026-08-06T10:00:00.000Z",
      overlapSeconds: 3600,
      leaseDurationSeconds: 90,
      maximumPageCount: 100
    });

    await expect(processor.tick()).resolves.toEqual({ kind: "concurrent_worker" });
  });

  it("keeps ArcPay payout ingestion on its own cursor stream", async () => {
    const cursorKey = createSettlementCursorKey({ providerAccount, stream: "settlement_payouts" });
    const checkpointIdentity = createSettlementPageCheckpointKey({
      cursorKey,
      windowGeneration: 1,
      providerPageCursor: null
    });
    const processor = createSettlementIngestionProcessor({
      stream: "settlement_payouts",
      providerAccounts: { findActiveProviderAccount: vi.fn(async () => providerAccount) } as never,
      operationPolicies: { findPublishedForOperation: vi.fn(async () => settlementPolicy()) } as never,
      cursors: {
        ensureCursor: vi.fn(async () => ({ cursorKey, cursorVersion: 1, created: true })),
        acquireNextPage: vi.fn(async () => ({
          lease: {
            kind: "settlement_cursor_lease_receipt",
            cursorKey,
            cursorVersion: 1,
            leaseOwnerId: "payment-worker:test",
            leaseToken: "payout-lease-token",
            fencingToken: 1,
            databaseClaimedAt: "2026-08-08T09:59:00.000Z",
            databaseExpiresAt: "2026-08-08T10:10:00.000Z",
            state: "active"
          },
          checkpointIdentity,
          windowStart: "2026-08-08T00:00:00.000Z",
          windowEnd: "2026-08-08T10:00:00.000Z"
        }))
      } as never,
      leases: { releaseLease: vi.fn(async () => ({})) } as never,
      provider: {
        transactionBoundary: "outside_database_transaction",
        fetchVerifiedPage: vi.fn(async (command) => ({
          kind: "verified_settlement_page_bundle",
          providerAccount,
          checkpointIdentity: command.checkpointIdentity,
          rawArtifact: {
            artifactId: "settlement-payout-page-1",
            sha256Digest: `sha256:${"a".repeat(64)}`,
            byteLength: 100
          },
          decodedEntriesDigest: `sha256:${"b".repeat(64)}`,
          pageEvidence: {
            kind: "verified_settlement_page_evidence",
            providerAccount,
            stream: "settlement_payouts",
            windowGeneration: 1,
            providerPageCursor: null,
            artifact: {
              artifactId: "settlement-payout-page-1",
              sha256Digest: `sha256:${"a".repeat(64)}`,
              byteLength: 100
            },
            fetchedAt: "2026-08-08T10:00:00.000Z"
          },
          verifiedAt: "2026-08-08T10:00:00.000Z",
          stream: "settlement_payouts",
          normalizedEntries: {
            rows: [],
            nextCursor: null,
            returnedCount: 0,
            operationEnvelope: command.operationEnvelope
          }
        }))
      } as never,
      ingestion: {
        ingestVerifiedPage: vi.fn(async () => ({
          cursorVersion: 2,
          insertedEntryCount: 1,
          replayedEntryCount: 0
        }))
      } as never,
      workerId: "payment-worker:test:payouts",
      initialBackfillStart: () => "2026-08-06T10:00:00.000Z",
      overlapSeconds: 3600,
      leaseDurationSeconds: 90,
      maximumPageCount: 1
    });

    await expect(processor.tick()).resolves.toMatchObject({
      kind: "ingested",
      pages: 1,
      insertedEntries: 1
    });
  });
});

function settlementPolicy() {
  return publishFinanceOperationResourcePolicyDraft(
    createFinanceOperationResourcePolicyDraft({
      policyId: "settlement-ingestion-v1",
      version: 1,
      operationKind: "settlement_ingestion",
      maximumRows: 100,
      maximumDecimalDigits: 38,
      maximumArtifactBytes: 2 * 1024 * 1024
    })
  );
}
