import { BadRequestException } from "@nestjs/common";
import {
  canonicalizeFinanceCommandPayload,
  hashFinanceCommandPayload
} from "@elevenhouse/domain";
import type {
  FinanceOperationResourcePolicyReader,
  FinancePrivateObjectStoragePort,
  OnlineWalletRefundApprovalPreparation,
  OnlineWalletRefundApprovalPreparationReader
} from "@elevenhouse/domain/finance-core";
import {
  createFinanceOperationResourcePolicyDraft,
  publishFinanceOperationResourcePolicyDraft
} from "@elevenhouse/domain/finance-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const financeAdapters = vi.hoisted(() => ({
  approveOnlineWalletRefundInTransaction: vi.fn(),
  createDrizzleOnlineWalletRefundApprovalPreparationReader: vi.fn(),
  createFinanceArtifactRegistry: vi.fn(),
  transactDrizzleFinanceAuthorizationCommand: vi.fn()
}));
const auditLog = vi.hoisted(() => ({ createDrizzleAuditLogStore: vi.fn() }));
const financeAuthorization = vi.hoisted(() => ({ consumeFinanceAuthorizationGrant: vi.fn() }));

vi.mock("@elevenhouse/db/finance", () => ({
  ...financeAdapters,
  FinanceArtifactRegistryError: class FinanceArtifactRegistryError extends Error {}
}));
vi.mock("@elevenhouse/db/audit-log", () => auditLog);
vi.mock("@elevenhouse/domain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@elevenhouse/domain")>()),
  consumeFinanceAuthorizationGrant: financeAuthorization.consumeFinanceAuthorizationGrant
}));

import { AdminOnlineWalletRefundsService } from "./online-wallet-refunds.service";

const candidateId = "11111111-1111-4111-8111-111111111111";
const account = {
  id: "22222222-2222-4222-8222-222222222222",
  sessionId: "33333333-3333-4333-8333-333333333333",
  roles: ["super_admin"]
};

const preparation: OnlineWalletRefundApprovalPreparation = Object.freeze({
  refundCandidateId: candidateId,
  refundCandidateVersion: 3,
  refundCandidateReviewId: "44444444-4444-4444-8444-444444444444",
  orderId: "55555555-5555-4555-8555-555555555555",
  captureApplicationId: "66666666-6666-4666-8666-666666666666",
  walletId: "77777777-7777-4777-8777-777777777777",
  walletRevision: "4",
  economicPaymentIntentId: "88888888-8888-4888-8888-888888888888",
  economicPaymentVersion: 2,
  providerAccount: { seriesId: "arc-main", providerAccountId: "elevenhouse", identityVersion: 1 },
  providerPaymentId: "arc-payment-1",
  grossAmountMinor: "10000",
  previousCumulativeRefundedMinor: "1000",
  providerOperationSourceVersion: 0
});
const findForApproval = vi.fn();
const beginResolved = vi.fn();

describe("AdminOnlineWalletRefundsService authorization boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findForApproval.mockResolvedValue(preparation);
    beginResolved.mockResolvedValue({ challengeId: candidateId, expiresAt: "2026-08-06T12:05:00.000Z", publicKey: {} });
    financeAdapters.createDrizzleOnlineWalletRefundApprovalPreparationReader.mockReturnValue({ findForApproval });
    financeAdapters.transactDrizzleFinanceAuthorizationCommand.mockImplementation(async ({ operation }) =>
      operation({ transaction: {}, authorizationStore: {} })
    );
    financeAdapters.createFinanceArtifactRegistry.mockReturnValue({
      registerSealedArtifact: vi.fn(async ({ artifact }) => artifact)
    });
    auditLog.createDrizzleAuditLogStore.mockReturnValue({ createEntry: vi.fn(async () => undefined) });
  });

  it("rejects caller-supplied provider, capture, wallet and position fields before any lookup", async () => {
    const service = createService();
    await expect(
      service.beginAuthorization(account as never, candidateId, {
        refundAmountMinor: "500",
        providerPaymentId: "attacker-value",
        captureApplicationId: "66666666-6666-4666-8666-666666666666",
        walletId: "77777777-7777-4777-8777-777777777777",
        previousCumulativeRefundedMinor: "0"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findForApproval).not.toHaveBeenCalled();
    expect(beginResolved).not.toHaveBeenCalled();
  });

  it("binds the sole amount decision to the server-derived candidate review and version", async () => {
    const service = createService();
    await service.beginAuthorization(account as never, candidateId, { refundAmountMinor: "500" });

    expect(findForApproval).toHaveBeenCalledWith({ refundCandidateId: candidateId });
    expect(beginResolved).toHaveBeenCalledWith(
      account,
      expect.objectContaining({
        actionKind: "refund_execute",
        aggregateId: candidateId,
        expectedVersion: 3,
        payload: {
          candidateId,
          candidateReviewId: preparation.refundCandidateReviewId,
          candidateVersion: 3,
          refundAmountMinor: "500",
          currency: "RUB"
        }
      })
    );
  });

  it("rejects an amount above the server-derived currently refundable position", async () => {
    const service = createService();
    await expect(
      service.beginAuthorization(account as never, candidateId, { refundAmountMinor: "9001" })
    ).rejects.toMatchObject({ status: 409 });
    expect(beginResolved).not.toHaveBeenCalled();
  });

  it("approves an unchanged re-read preparation even when its provider account is a new object", async () => {
    const refreshedPreparation: OnlineWalletRefundApprovalPreparation = {
      ...preparation,
      providerAccount: { ...preparation.providerAccount }
    };
    findForApproval
      .mockResolvedValueOnce(preparation)
      .mockResolvedValueOnce(refreshedPreparation);
    financeAuthorization.consumeFinanceAuthorizationGrant.mockResolvedValue({
      authorizationId: "99999999-9999-4999-8999-999999999999",
      actorUserId: account.id,
      sessionId: account.sessionId,
      actionKind: "refund_execute",
      aggregateId: candidateId,
      expectedVersion: 3,
      payloadHash: hashFinanceCommandPayload({
        candidateId,
        candidateReviewId: preparation.refundCandidateReviewId,
        candidateVersion: 3,
        refundAmountMinor: "500",
        currency: "RUB"
      }),
      verifiedAt: "2026-08-06T12:00:00.000Z",
      expiresAt: "2026-08-06T12:05:00.000Z",
      status: "consumed"
    });
    financeAdapters.approveOnlineWalletRefundInTransaction.mockResolvedValue({
      refundCaseId: `online-wallet-refund:${candidateId}`,
      walletId: preparation.walletId,
      walletRevision: "5",
      providerOperationIntentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    });
    const service = createService({
      policies: { findPublishedForOperation: vi.fn(async () => refundPolicy()) }
    });

    await expect(
      service.approve(account as never, candidateId, {
        authorizationId: "99999999-9999-4999-8999-999999999999",
        refundAmountMinor: "500"
      })
    ).resolves.toMatchObject({
      refundCaseId: `online-wallet-refund:${candidateId}`,
      status: "approved"
    });
  });

  it("uses a UUIDv7 idempotency key for the ArcPay refund dispatch", async () => {
    const providerDispatches: unknown[] = [];
    financeAuthorization.consumeFinanceAuthorizationGrant.mockResolvedValue({
      authorizationId: "99999999-9999-4999-8999-999999999999",
      actorUserId: account.id,
      sessionId: account.sessionId,
      actionKind: "refund_execute",
      aggregateId: candidateId,
      expectedVersion: 3,
      payloadHash: hashFinanceCommandPayload({
        candidateId,
        candidateReviewId: preparation.refundCandidateReviewId,
        candidateVersion: 3,
        refundAmountMinor: "500",
        currency: "RUB"
      }),
      verifiedAt: "2026-08-06T12:00:00.000Z",
      expiresAt: "2026-08-06T12:05:00.000Z",
      status: "consumed"
    });
    financeAdapters.approveOnlineWalletRefundInTransaction.mockImplementation(async (_transaction, command) => {
      providerDispatches.push(command.providerDispatch);
      return {
        refundCaseId: `online-wallet-refund:${candidateId}`,
        walletId: preparation.walletId,
        walletRevision: "5",
        providerOperationIntentId: command.providerDispatch.providerOperationIntentId
      };
    });
    const service = createService({
      policies: { findPublishedForOperation: vi.fn(async () => refundPolicy()) }
    });

    await service.approve(account as never, candidateId, {
      authorizationId: "99999999-9999-4999-8999-999999999999",
      refundAmountMinor: "500"
    });

    expect(providerDispatches).toHaveLength(1);
    expect(providerDispatches[0]).toEqual(
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        )
      })
    );
  });
});

function createService(input: Readonly<{
  policies?: FinanceOperationResourcePolicyReader;
}> = {}): AdminOnlineWalletRefundsService {
  const preparations: OnlineWalletRefundApprovalPreparationReader = { findForApproval };
  const policies: FinanceOperationResourcePolicyReader = input.policies ?? { findPublishedForOperation: vi.fn() };
  const storage: FinancePrivateObjectStoragePort = {
    writeImmutable: vi.fn(async ({ artifactId, contentType, bytes, expectedSha256Digest }) => ({
      privateObjectKey: `finance/${artifactId}`,
      privateObjectVersion: "v1",
      envelopeKeyVersion: "kms-1",
      sha256Digest: expectedSha256Digest,
      byteLength: bytes.byteLength,
      contentType
    })),
    readImmutable: vi.fn(),
    deleteImmutable: vi.fn()
  };
  return new AdminOnlineWalletRefundsService(
    { database: {} } as never,
    { beginResolved } as never,
    preparations,
    policies,
    storage,
    {
      getOrThrow: vi.fn(() => ({
        financeRefundDispatch: {
          artifactStorage: {},
          retentionPolicy: { policyId: "refund-request", policyVersion: "1" }
        }
      }))
    } as never,
    { now: () => new Date("2026-08-06T12:00:00.000Z") } as never
  );
}

function refundPolicy() {
  return publishFinanceOperationResourcePolicyDraft(
    createFinanceOperationResourcePolicyDraft({
      policyId: "refund-execution",
      version: 1,
      operationKind: "refund_execute",
      maximumRows: 10,
      maximumDecimalDigits: 38,
      maximumArtifactBytes: 4_096
    })
  );
}
