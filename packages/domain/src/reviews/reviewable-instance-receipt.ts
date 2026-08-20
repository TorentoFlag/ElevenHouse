import type {
  ReviewWindowPolicy,
  ReviewableInstanceKind,
  ReviewableInstanceStatus
} from "@elevenhouse/contracts";

const reviewWindowMs = 14 * 24 * 60 * 60 * 1000;

export type ReviewableInstanceReceiptRelationshipState = {
  readonly id: string;
  readonly status: "active" | "archived" | "blocked";
};

export type ReviewableInstanceReceiptInput = {
  readonly nextReviewableInstanceId: string;
  readonly clientUserId: string;
  readonly astrologerUserId: string;
  readonly relationship: ReviewableInstanceReceiptRelationshipState | null;
  readonly kind: ReviewableInstanceKind;
  readonly sourceResourceKey: string;
  readonly productId: string | null;
  readonly orderId: string | null;
  readonly bookingId: string | null;
  readonly titleSnapshot: string;
  readonly contextLabelSnapshot: string;
  readonly receivedAt: string;
  readonly windowPolicy: ReviewWindowPolicy;
  readonly activePeriodEndsAt?: string | null;
};

export type ReviewableInstanceReceiptState = {
  readonly id: string;
  readonly clientUserId: string;
  readonly astrologerUserId: string;
  readonly relationshipId: string;
  readonly kind: ReviewableInstanceKind;
  readonly status: ReviewableInstanceStatus;
  readonly windowPolicy: ReviewWindowPolicy;
  readonly sourceResourceKey: string;
  readonly productId: string | null;
  readonly orderId: string | null;
  readonly bookingId: string | null;
  readonly titleSnapshot: string;
  readonly contextLabelSnapshot: string;
  readonly receivedAt: string;
  readonly reviewWindowClosesAt: string;
  readonly blockedReasonCode: string | null;
};

export type PlanReviewableInstanceFromReceiptResult =
  | {
      readonly kind: "create";
      readonly instance: ReviewableInstanceReceiptState;
    }
  | {
      readonly kind: "rejected";
      readonly reason:
        | "relationship_not_active"
        | "invalid_received_at"
        | "active_period_end_required"
        | "active_period_end_before_receipt";
    };

export function planReviewableInstanceFromReceipt(
  input: ReviewableInstanceReceiptInput
): PlanReviewableInstanceFromReceiptResult {
  if (!input.relationship || input.relationship.status !== "active") {
    return { kind: "rejected", reason: "relationship_not_active" };
  }

  const receivedAtMs = Date.parse(input.receivedAt);
  if (!Number.isFinite(receivedAtMs)) {
    return { kind: "rejected", reason: "invalid_received_at" };
  }

  const windowClose = reviewWindowClose(input.windowPolicy, receivedAtMs, input.activePeriodEndsAt);
  if (windowClose.kind === "rejected") return windowClose;

  return {
    kind: "create",
    instance: {
      id: input.nextReviewableInstanceId,
      clientUserId: input.clientUserId,
      astrologerUserId: input.astrologerUserId,
      relationshipId: input.relationship.id,
      kind: input.kind,
      status: "reviewable",
      windowPolicy: input.windowPolicy,
      sourceResourceKey: input.sourceResourceKey,
      productId: input.productId,
      orderId: input.orderId,
      bookingId: input.bookingId,
      titleSnapshot: input.titleSnapshot,
      contextLabelSnapshot: input.contextLabelSnapshot,
      receivedAt: new Date(receivedAtMs).toISOString(),
      reviewWindowClosesAt: new Date(windowClose.closesAtMs).toISOString(),
      blockedReasonCode: null
    }
  };
}

function reviewWindowClose(
  policy: ReviewWindowPolicy,
  receivedAtMs: number,
  activePeriodEndsAt: string | null | undefined
):
  | { readonly kind: "ok"; readonly closesAtMs: number }
  | {
      readonly kind: "rejected";
      readonly reason: "active_period_end_required" | "active_period_end_before_receipt";
    } {
  if (policy === "standard_14_days_after_receipt") {
    return { kind: "ok", closesAtMs: receivedAtMs + reviewWindowMs };
  }

  if (!activePeriodEndsAt) {
    return { kind: "rejected", reason: "active_period_end_required" };
  }
  const activePeriodEndsAtMs = Date.parse(activePeriodEndsAt);
  if (!Number.isFinite(activePeriodEndsAtMs) || activePeriodEndsAtMs < receivedAtMs) {
    return { kind: "rejected", reason: "active_period_end_before_receipt" };
  }
  return { kind: "ok", closesAtMs: activePeriodEndsAtMs + reviewWindowMs };
}
