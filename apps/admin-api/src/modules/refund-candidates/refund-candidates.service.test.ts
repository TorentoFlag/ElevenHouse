import { HttpException } from "@nestjs/common";
import {
  RefundCandidateNotFoundError,
  type RefundCandidateStore
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";

import { AdminRefundCandidatesService } from "./refund-candidates.service";

const adminUserId = "11111111-1111-4111-8111-111111111111";
const candidateId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-08-05T12:10:00.000Z");

describe("AdminRefundCandidatesService", () => {
  it("returns an internal review receipt, not a monetary approval", async () => {
    const service = createService();

    await expect(
      service.review(
        adminUserId,
        candidateId,
        { expectedVersion: 1, action: "claimed", note: "  Investigating delivery history. " },
        "review-command-1"
      )
    ).resolves.toEqual({
      candidate: {
        id: candidateId,
        orderId: "33333333-3333-4333-8333-333333333333",
        clientUserId: "44444444-4444-4444-8444-444444444444",
        statement: "Service was not delivered.",
        status: "under_review",
        version: 2,
        submittedAt: "2026-08-05T12:00:00.000Z",
        updatedAt: now.toISOString()
      },
      review: {
        id: "55555555-5555-4555-8555-555555555555",
        candidateId,
        candidateVersion: 2,
        actorUserId: adminUserId,
        action: "claimed",
        note: "Investigating delivery history.",
        reviewedAt: now.toISOString()
      }
    });
  });

  it("maps invalid requests and unavailable candidates without inventing a refund result", async () => {
    await expect(
      createService().review(adminUserId, candidateId, { expectedVersion: 0, action: "claimed", note: "x" }, "review-command-1")
    ).rejects.toSatisfy(hasHttpError(400, "invalid_request"));
    await expect(
      createService({ missing: true }).review(
        adminUserId,
        candidateId,
        { expectedVersion: 1, action: "claimed", note: "Investigating delivery history." },
        "review-command-1"
      )
    ).rejects.toSatisfy(hasHttpError(404, new RefundCandidateNotFoundError().code));
  });

  it("lists a bounded internal queue without payment provider or amount fields", async () => {
    await expect(createService().list({ status: "submitted", limit: "10" })).resolves.toEqual({
      candidates: []
    });
    await expect(createService().list({ status: "unknown" })).rejects.toSatisfy(
      hasHttpError(400, "invalid_request")
    );
  });
});

function createService(options: { readonly missing?: boolean } = {}): AdminRefundCandidatesService {
  const candidateStore = {
    executeReviewCandidate: vi.fn(async (_command, input) => {
      if (options.missing) throw new RefundCandidateNotFoundError();
      return {
        kind: "created" as const,
        value: {
          candidate: {
            id: candidateId,
            orderId: "33333333-3333-4333-8333-333333333333",
            clientUserId: "44444444-4444-4444-8444-444444444444",
            statement: "Service was not delivered.",
            status: "under_review" as const,
            version: 2,
            submittedAt: "2026-08-05T12:00:00.000Z",
            resolvedRefundCaseId: null,
            resolvedAt: null,
            updatedAt: now.toISOString()
          },
          review: {
            id: "55555555-5555-4555-8555-555555555555",
            candidateId,
            candidateVersion: 2,
            actorUserId: adminUserId,
            action: "claimed" as const,
            note: input.note,
            refundCaseId: null,
            reviewedAt: now.toISOString()
          }
        }
      };
    }),
    listForAdmin: vi.fn(async () => [])
  } satisfies Pick<RefundCandidateStore, "executeReviewCandidate" | "listForAdmin">;
  return new AdminRefundCandidatesService(candidateStore, { now: () => now });
}

function hasHttpError(status: number, code: string): (error: unknown) => boolean {
  return (error) =>
    error instanceof HttpException &&
    error.getStatus() === status &&
    (error.getResponse() as { code?: string }).code === code;
}
