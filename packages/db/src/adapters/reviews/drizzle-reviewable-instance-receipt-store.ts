import type {
  ReviewWindowPolicy,
  ReviewableInstanceKind,
  ReviewableInstanceStatus
} from "@elevenhouse/contracts";
import { planReviewableInstanceFromReceipt } from "@elevenhouse/domain";
import { and, eq } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  bookingLifecycleEvents,
  bookings,
  clientAstrologerRelationships,
  orders,
  products,
  reviewableInstances
} from "../../schema";

type ReviewReceiptTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type ReviewableInstanceRow = typeof reviewableInstances.$inferSelect;

export type ReviewableInstanceReceiptCommandInput = {
  readonly nextReviewableInstanceId: string;
  readonly clientUserId: string;
  readonly astrologerUserId: string;
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
  readonly now: string;
};

export type ReviewableInstanceReceiptRecord = {
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

export type UpsertReviewableInstanceFromReceiptResult =
  | {
      readonly kind: "created" | "existing";
      readonly instance: ReviewableInstanceReceiptRecord;
    }
  | {
      readonly kind: "rejected";
      readonly reason:
        | "relationship_not_active"
        | "booking_completion_not_found"
        | "booking_not_completed"
        | "product_not_found"
        | "order_not_found"
        | "order_identity_mismatch"
        | "order_not_reviewable"
        | "invalid_received_at"
        | "active_period_end_required"
        | "active_period_end_before_receipt";
    };

export type DrizzleReviewableInstanceReceiptStore = {
  readonly upsertFromReceipt: (
    input: ReviewableInstanceReceiptCommandInput
  ) => Promise<UpsertReviewableInstanceFromReceiptResult>;
  readonly upsertFromCompletedBookingEvent: (input: {
    readonly bookingLifecycleEventId: string;
    readonly nextReviewableInstanceId: string;
    readonly now: string;
  }) => Promise<UpsertReviewableInstanceFromReceiptResult>;
};

export function createDrizzleReviewableInstanceReceiptStore(
  database: ElevenHouseDatabase
): DrizzleReviewableInstanceReceiptStore {
  return {
    upsertFromReceipt: (input) =>
      database.transaction((transaction) => upsertReceiptInTransaction(transaction, input)),
    upsertFromCompletedBookingEvent: (input) =>
      database.transaction(async (transaction) => {
        const [row] = await transaction
          .select({
            eventId: bookingLifecycleEvents.id,
            eventKind: bookingLifecycleEvents.eventKind,
            revision: bookingLifecycleEvents.revision,
            occurredAt: bookingLifecycleEvents.occurredAt,
            bookingId: bookings.id,
            bookingState: bookings.state,
            bookingLifecycleRevision: bookings.lifecycleRevision,
            clientUserId: bookings.clientUserId,
            astrologerUserId: bookings.ownerUserId,
            productId: bookings.productId,
            productTitleSnapshot: bookings.productTitleSnapshot,
            durationMinutesSnapshot: bookings.durationMinutesSnapshot
          })
          .from(bookingLifecycleEvents)
          .innerJoin(
            bookings,
            and(
              eq(bookings.id, bookingLifecycleEvents.bookingId),
              eq(bookings.ownerUserId, bookingLifecycleEvents.ownerUserId)
            )
          )
          .where(
            and(
              eq(bookingLifecycleEvents.id, input.bookingLifecycleEventId),
              eq(bookingLifecycleEvents.eventKind, "completed")
            )
          )
          .limit(1);

        if (!row) return { kind: "rejected", reason: "booking_completion_not_found" };
        if (row.bookingState !== "completed" || row.bookingLifecycleRevision !== row.revision) {
          return { kind: "rejected", reason: "booking_not_completed" };
        }

        const [order] = await transaction
          .select({
            id: orders.id,
            status: orders.status
          })
          .from(orders)
          .where(eq(orders.bookingId, row.bookingId))
          .limit(1);
        if (order && order.status !== "paid" && order.status !== "fulfilled") {
          return { kind: "rejected", reason: "order_not_reviewable" };
        }

        return upsertReceiptInTransaction(transaction, {
          nextReviewableInstanceId: input.nextReviewableInstanceId,
          clientUserId: row.clientUserId,
          astrologerUserId: row.astrologerUserId,
          kind: "booking",
          sourceResourceKey: `booking:${row.bookingId}`,
          productId: row.productId,
          orderId: order?.id ?? null,
          bookingId: row.bookingId,
          titleSnapshot: row.productTitleSnapshot,
          contextLabelSnapshot: `${row.durationMinutesSnapshot} минут`,
          receivedAt: row.occurredAt.toISOString(),
          windowPolicy: "standard_14_days_after_receipt",
          now: input.now
        });
      })
  };
}

async function upsertReceiptInTransaction(
  transaction: ReviewReceiptTransaction,
  input: ReviewableInstanceReceiptCommandInput
): Promise<UpsertReviewableInstanceFromReceiptResult> {
  const existing = await readBySource(transaction, input);
  if (existing) return { kind: "existing", instance: toRecord(existing) };

  const [relationship] = await transaction
    .select({
      id: clientAstrologerRelationships.id,
      status: clientAstrologerRelationships.status
    })
    .from(clientAstrologerRelationships)
    .where(
      and(
        eq(clientAstrologerRelationships.clientUserId, input.clientUserId),
        eq(clientAstrologerRelationships.astrologerUserId, input.astrologerUserId)
      )
    )
    .limit(1);

  if (input.productId) {
    const [product] = await transaction
      .select({ id: products.id })
      .from(products)
      .where(
        and(eq(products.id, input.productId), eq(products.ownerUserId, input.astrologerUserId))
      )
      .limit(1);
    if (!product) return { kind: "rejected", reason: "product_not_found" };
  }

  if (input.orderId) {
    const [order] = await transaction
      .select({
        id: orders.id,
        clientUserId: orders.clientUserId,
        astrologerUserId: orders.astrologerUserId,
        productId: orders.productId,
        status: orders.status
      })
      .from(orders)
      .where(eq(orders.id, input.orderId))
      .limit(1);
    if (!order) return { kind: "rejected", reason: "order_not_found" };
    if (
      order.clientUserId !== input.clientUserId ||
      order.astrologerUserId !== input.astrologerUserId ||
      (input.productId !== null && order.productId !== input.productId)
    ) {
      return { kind: "rejected", reason: "order_identity_mismatch" };
    }
    if (order.status !== "paid" && order.status !== "fulfilled") {
      return { kind: "rejected", reason: "order_not_reviewable" };
    }
  }

  const planned = planReviewableInstanceFromReceipt({
    ...input,
    relationship:
      relationship && relationship.status === "active"
        ? { id: relationship.id, status: "active" }
        : relationship
          ? { id: relationship.id, status: relationship.status as "archived" | "blocked" }
          : null
  });
  if (planned.kind === "rejected") return planned;

  const [created] = await transaction
    .insert(reviewableInstances)
    .values({
      id: planned.instance.id,
      astrologerUserId: planned.instance.astrologerUserId,
      clientUserId: planned.instance.clientUserId,
      relationshipId: planned.instance.relationshipId,
      kind: planned.instance.kind,
      status: planned.instance.status,
      windowPolicy: planned.instance.windowPolicy,
      sourceResourceKey: planned.instance.sourceResourceKey,
      productId: planned.instance.productId,
      orderId: planned.instance.orderId,
      bookingId: planned.instance.bookingId,
      titleSnapshot: planned.instance.titleSnapshot,
      contextLabelSnapshot: planned.instance.contextLabelSnapshot,
      receivedAt: new Date(planned.instance.receivedAt),
      reviewWindowClosesAt: new Date(planned.instance.reviewWindowClosesAt),
      blockedReasonCode: planned.instance.blockedReasonCode,
      createdAt: new Date(input.now),
      updatedAt: new Date(input.now)
    })
    .onConflictDoNothing()
    .returning();

  if (created) return { kind: "created", instance: toRecord(created) };

  const afterConflict = await readBySource(transaction, input);
  if (!afterConflict) {
    throw new Error("Expected reviewable instance source conflict to be readable");
  }
  return { kind: "existing", instance: toRecord(afterConflict) };
}

async function readBySource(
  database: ReviewReceiptTransaction,
  input: Pick<
    ReviewableInstanceReceiptCommandInput,
    "astrologerUserId" | "clientUserId" | "kind" | "sourceResourceKey"
  >
): Promise<ReviewableInstanceRow | null> {
  const [row] = await database
    .select()
    .from(reviewableInstances)
    .where(
      and(
        eq(reviewableInstances.astrologerUserId, input.astrologerUserId),
        eq(reviewableInstances.clientUserId, input.clientUserId),
        eq(reviewableInstances.kind, input.kind),
        eq(reviewableInstances.sourceResourceKey, input.sourceResourceKey)
      )
    )
    .limit(1);
  return row ?? null;
}

function toRecord(row: ReviewableInstanceRow): ReviewableInstanceReceiptRecord {
  return {
    id: row.id,
    clientUserId: row.clientUserId,
    astrologerUserId: row.astrologerUserId,
    relationshipId: row.relationshipId,
    kind: row.kind as ReviewableInstanceKind,
    status: row.status as ReviewableInstanceStatus,
    windowPolicy: row.windowPolicy as ReviewWindowPolicy,
    sourceResourceKey: row.sourceResourceKey,
    productId: row.productId,
    orderId: row.orderId,
    bookingId: row.bookingId,
    titleSnapshot: row.titleSnapshot,
    contextLabelSnapshot: row.contextLabelSnapshot,
    receivedAt: row.receivedAt.toISOString(),
    reviewWindowClosesAt: row.reviewWindowClosesAt.toISOString(),
    blockedReasonCode: row.blockedReasonCode
  };
}
