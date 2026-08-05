import { HttpException } from "@nestjs/common";
import {
  RefundCandidateAlreadyOpenError,
  type FinanceOrder,
  type FinanceOrderStore,
  type RefundCandidateStore
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";

import { RefundCandidatesService } from "./refund-candidates.service";

const clientUserId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-08-05T12:00:00.000Z");

describe("RefundCandidatesService", () => {
  it("accepts a client statement as an internal review candidate without exposing refund economics", async () => {
    const service = createService();

    await expect(
      service.submit(clientUserId, orderId, { statement: "  Service was not provided.  " }, "dispute-1")
    ).resolves.toEqual({
      id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      ),
      orderId,
      clientUserId,
      statement: "Service was not provided.",
      status: "submitted",
      submittedAt: now.toISOString(),
      updatedAt: now.toISOString()
    });
  });

  it("maps malformed input and an already-open review candidate to stable client errors", async () => {
    await expect(createService().submit(clientUserId, orderId, { statement: "\n" }, "dispute-1"))
      .rejects.toSatisfy(hasHttpError(400, "invalid_request"));
    await expect(
      createService({ duplicate: true }).submit(
        clientUserId,
        orderId,
        { statement: "Service was not provided." },
        "dispute-2"
      )
    ).rejects.toSatisfy(hasHttpError(409, new RefundCandidateAlreadyOpenError().code));
  });

  it("returns only the caller's review timeline fields", async () => {
    const service = createService({
      candidates: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          orderId,
          clientUserId,
          statement: "Service was not provided.",
          status: "under_review",
          version: 2,
          submittedAt: now.toISOString(),
          resolvedRefundCaseId: null,
          resolvedAt: null,
          updatedAt: "2026-08-05T12:10:00.000Z"
        }
      ]
    });

    await expect(service.list(clientUserId, orderId)).resolves.toEqual([
      {
        id: "33333333-3333-4333-8333-333333333333",
        orderId,
        clientUserId,
        statement: "Service was not provided.",
        status: "under_review",
        submittedAt: now.toISOString(),
        updatedAt: "2026-08-05T12:10:00.000Z"
      }
    ]);
  });
});

function createService(options: {
  readonly duplicate?: boolean;
  readonly candidates?: readonly import("@elevenhouse/domain").RefundCandidate[];
} = {}): RefundCandidatesService {
  const orderStore = {
    findById: vi.fn(async () => paidOrder())
  } satisfies Pick<FinanceOrderStore, "findById">;
  const candidateStore = {
    executeSubmitCandidate: vi.fn(async (_command, create) => {
      if (options.duplicate) throw new RefundCandidateAlreadyOpenError();
      return { kind: "created" as const, value: await create() };
    }),
    listByOrderAndClient: vi.fn(async () => options.candidates ?? [])
  } satisfies Pick<RefundCandidateStore, "executeSubmitCandidate" | "listByOrderAndClient">;
  return new RefundCandidatesService(orderStore, candidateStore, { now: () => now });
}

function paidOrder(): FinanceOrder {
  return {
    id: orderId,
    clientUserId,
    astrologerUserId: "44444444-4444-4444-8444-444444444444",
    productId: "55555555-5555-4555-8555-555555555555",
    productTitleSnapshot: "Natal consultation",
    directLinkIntentId: null,
    bookingId: null,
    status: "paid",
    grossAmount: { amountMinor: 10_000, currency: "RUB" },
    platformFee: { amountMinor: 800, currency: "RUB" },
    astrologerNetAmount: { amountMinor: 9_200, currency: "RUB" },
    financePolicySnapshotId: "66666666-6666-4666-8666-666666666666",
    financePolicyRiskTier: "standard",
    financePolicyHoldDurationHours: 48,
    financePolicyReserveBps: 0,
    financePolicyReserveReleaseDelayDays: 0,
    tariffSeriesId: "pro",
    tariffVersion: 1,
    tariffVersionDigest: `sha256:${"a".repeat(64)}`,
    tariffCommissionBps: 800,
    financePolicyProviderSettlementRequired: true,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function hasHttpError(status: number, code: string): (error: unknown) => boolean {
  return (error) =>
    error instanceof HttpException &&
    error.getStatus() === status &&
    (error.getResponse() as { code?: string }).code === code;
}
