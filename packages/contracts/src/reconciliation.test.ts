import { describe, expect, it } from "vitest";
import {
  adminReconciliationExceptionQueueResponseSchema,
  resolveReconciliationExceptionRequestSchema
} from "./reconciliation";

describe("reconciliation contracts", () => {
  it("accepts admin exception queue responses with provider evidence", () => {
    expect(
      adminReconciliationExceptionQueueResponseSchema.parse({
        summary: {
          openCount: 1,
          oldestOpenAt: "2026-07-27T08:00:00.000Z"
        },
        exceptions: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            provider: "arc_pay",
            environment: "sandbox",
            providerPaymentId: "provider-payment-1",
            providerPayoutId: null,
            providerSettlementId: "settlement-2026-07-27",
            providerEventId: "22222222-2222-4222-8222-222222222222",
            status: "exception",
            exceptionCode: "missing_on_bank",
            exceptionMessage: "Capture is absent from bank settlement file",
            providerOccurredAt: "2026-07-27T07:30:00.000Z",
            checkedAt: "2026-07-27T08:00:00.000Z",
            resolvedAt: null,
            payload: { source: "reconciliation.exception" }
          }
        ]
      })
    ).toMatchObject({ summary: { openCount: 1 } });
  });

  it("rejects blank admin resolution notes", () => {
    expect(
      resolveReconciliationExceptionRequestSchema.safeParse({
        resolution: "waived",
        adminNote: "Below audit threshold after finance review"
      }).success
    ).toBe(true);
    expect(
      resolveReconciliationExceptionRequestSchema.safeParse({
        resolution: "waived",
        adminNote: " "
      }).success
    ).toBe(false);
  });
});
