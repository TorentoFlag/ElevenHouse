import { describe, expect, it } from "vitest";

import { planReviewableInstanceFromReceipt } from "./reviewable-instance-receipt";

const baseInput = {
  nextReviewableInstanceId: "10000000-0000-4000-8000-000000000101",
  clientUserId: "10000000-0000-4000-8000-000000000102",
  astrologerUserId: "10000000-0000-4000-8000-000000000103",
  relationship: {
    id: "10000000-0000-4000-8000-000000000104",
    status: "active" as const
  },
  kind: "async_delivery" as const,
  sourceResourceKey: "async_delivery:10000000-0000-4000-8000-000000000105",
  productId: "10000000-0000-4000-8000-000000000106",
  orderId: "10000000-0000-4000-8000-000000000107",
  bookingId: null,
  titleSnapshot: "Письменный разбор",
  contextLabelSnapshot: "Материал выдан клиенту",
  receivedAt: "2026-08-20T10:00:00.000Z",
  windowPolicy: "standard_14_days_after_receipt" as const
};

describe("Reviewable instance receipt policy", () => {
  it("opens a standard 14 day review window from server-owned receipt time", () => {
    expect(planReviewableInstanceFromReceipt(baseInput)).toMatchObject({
      kind: "create",
      instance: {
        id: baseInput.nextReviewableInstanceId,
        status: "reviewable",
        relationshipId: baseInput.relationship.id,
        kind: "async_delivery",
        receivedAt: "2026-08-20T10:00:00.000Z",
        reviewWindowClosesAt: "2026-09-03T10:00:00.000Z"
      }
    });
  });

  it("keeps active-period services reviewable through the period and 14 days after it", () => {
    expect(
      planReviewableInstanceFromReceipt({
        ...baseInput,
        kind: "astro_calendar_service_period",
        sourceResourceKey: "astro_calendar_service_period:10000000-0000-4000-8000-000000000108",
        receivedAt: "2026-08-01T00:00:00.000Z",
        windowPolicy: "active_period_plus_14_days",
        activePeriodEndsAt: "2026-08-31T23:59:59.000Z"
      })
    ).toMatchObject({
      kind: "create",
      instance: {
        windowPolicy: "active_period_plus_14_days",
        reviewWindowClosesAt: "2026-09-14T23:59:59.000Z"
      }
    });
  });

  it("fails closed without an active relationship or period end evidence", () => {
    expect(
      planReviewableInstanceFromReceipt({
        ...baseInput,
        relationship: { id: baseInput.relationship.id, status: "blocked" }
      })
    ).toEqual({ kind: "rejected", reason: "relationship_not_active" });

    expect(
      planReviewableInstanceFromReceipt({
        ...baseInput,
        windowPolicy: "active_period_plus_14_days"
      })
    ).toEqual({ kind: "rejected", reason: "active_period_end_required" });
  });
});
