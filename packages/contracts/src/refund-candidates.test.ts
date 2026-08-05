import { describe, expect, it } from "vitest";

import {
  clientRefundCandidateResponseSchema,
  submitClientRefundCandidateRequestSchema
} from "./refund-candidates";

const candidate = {
  id: "11111111-1111-4111-8111-111111111111",
  orderId: "22222222-2222-4222-8222-222222222222",
  clientUserId: "33333333-3333-4333-8333-333333333333",
  statement: "Service was not provided as agreed.",
  status: "submitted",
  submittedAt: "2026-08-05T12:00:00.000Z",
  updatedAt: "2026-08-05T12:00:00.000Z"
};

describe("refund candidate contracts", () => {
  it("normalizes a bounded client statement without accepting arbitrary fields", () => {
    expect(
      submitClientRefundCandidateRequestSchema.parse({
        statement: "  Service was not provided as agreed.  "
      })
    ).toEqual({ statement: candidate.statement });
    expect(() =>
      submitClientRefundCandidateRequestSchema.parse({ statement: "\n", amountMinor: 10_000 })
    ).toThrow();
  });

  it("does not expose a refund amount, provider id, or internal resolved case id to the client", () => {
    expect(clientRefundCandidateResponseSchema.parse(candidate)).toEqual(candidate);
    expect(() =>
      clientRefundCandidateResponseSchema.parse({
        ...candidate,
        amountMinor: 10_000,
        providerRefundId: "provider-refund-1",
        resolvedRefundCaseId: "internal-case-1"
      })
    ).toThrow();
  });
});
