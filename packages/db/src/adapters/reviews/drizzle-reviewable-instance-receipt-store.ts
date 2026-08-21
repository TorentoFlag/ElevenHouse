import { randomUUID } from "node:crypto";

import type {
  ReviewWindowPolicy,
  ReviewableInstanceKind,
  ReviewableInstanceStatus
} from "@elevenhouse/contracts";
import { planReviewableInstanceFromReceipt } from "@elevenhouse/domain";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  bookingLifecycleEvents,
  bookings,
  clientAstrologerRelationships,
  clientEntitlementGrants,
  clientSubscriptions,
  orders,
  products,
  reviewSourceReceipts,
  reviewableInstances
} from "../../schema";

type ReviewReceiptTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type ReviewableInstanceRow = typeof reviewableInstances.$inferSelect;
type ReviewSourceReceiptRow = typeof reviewSourceReceipts.$inferSelect;

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

export type ReviewSourceReceiptCommandInput = {
  readonly id: string;
  readonly clientUserId: string;
  readonly astrologerUserId: string;
  readonly kind: ReviewableInstanceKind;
  readonly sourceResourceKey: string;
  readonly productId: string | null;
  readonly orderId: string | null;
  readonly titleSnapshot: string;
  readonly contextLabelSnapshot: string;
  readonly receivedAt: string;
  readonly windowPolicy: ReviewWindowPolicy;
  readonly activePeriodEndsAt?: string | null;
  readonly now: string;
};

export type ReviewSourceReceiptRecord = {
  readonly id: string;
  readonly clientUserId: string;
  readonly astrologerUserId: string;
  readonly relationshipId: string;
  readonly kind: ReviewableInstanceKind;
  readonly sourceResourceKey: string;
  readonly productId: string | null;
  readonly orderId: string | null;
  readonly titleSnapshot: string;
  readonly contextLabelSnapshot: string;
  readonly receivedAt: string;
  readonly windowPolicy: ReviewWindowPolicy;
  readonly activePeriodEndsAt: string | null;
  readonly status: "received" | "revoked";
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
        | "astro_diary_period_not_found"
        | "astro_diary_period_not_reviewable"
        | "product_not_found"
        | "order_not_found"
        | "order_identity_mismatch"
        | "order_not_reviewable"
        | "source_identity_conflict"
        | "invalid_received_at"
        | "active_period_end_required"
        | "active_period_end_before_receipt";
    };

export type RecordReviewSourceReceiptResult =
  | {
      readonly kind: "created" | "existing";
      readonly receipt: ReviewSourceReceiptRecord;
    }
  | Extract<UpsertReviewableInstanceFromReceiptResult, { readonly kind: "rejected" }>;

export type DrizzleReviewableInstanceReceiptStore = {
  readonly upsertFromReceipt: (
    input: ReviewableInstanceReceiptCommandInput
  ) => Promise<UpsertReviewableInstanceFromReceiptResult>;
  readonly recordSourceReceipt: (
    input: ReviewSourceReceiptCommandInput
  ) => Promise<RecordReviewSourceReceiptResult>;
  readonly upsertFromCompletedBookingEvent: (input: {
    readonly bookingLifecycleEventId: string;
    readonly nextReviewableInstanceId: string;
    readonly now: string;
  }) => Promise<UpsertReviewableInstanceFromReceiptResult>;
  readonly upsertFromAstroDiaryPeriod: (input: {
    readonly periodId: string;
    readonly nextReviewableInstanceId: string;
    readonly now: string;
  }) => Promise<UpsertReviewableInstanceFromReceiptResult>;
  readonly upsertPendingCompletedBookingEvents: (input: {
    readonly limit: number;
    readonly now: string;
    readonly idGenerator?: () => string;
  }) => Promise<{
    readonly scanned: number;
    readonly created: number;
    readonly existing: number;
    readonly rejected: number;
  }>;
  readonly upsertPendingAstroDiaryPeriods: (input: {
    readonly limit: number;
    readonly now: string;
    readonly idGenerator?: () => string;
  }) => Promise<{
    readonly scanned: number;
    readonly created: number;
    readonly existing: number;
    readonly rejected: number;
  }>;
  readonly upsertPendingSourceReceipts: (input: {
    readonly limit: number;
    readonly now: string;
    readonly idGenerator?: () => string;
  }) => Promise<{
    readonly scanned: number;
    readonly created: number;
    readonly existing: number;
    readonly rejected: number;
  }>;
};

export function createDrizzleReviewableInstanceReceiptStore(
  database: ElevenHouseDatabase
): DrizzleReviewableInstanceReceiptStore {
  return {
    upsertFromReceipt: (input) =>
      database.transaction((transaction) => upsertReceiptInTransaction(transaction, input)),
    recordSourceReceipt: (input) =>
      database.transaction((transaction) => recordSourceReceiptInTransaction(transaction, input)),
    upsertFromCompletedBookingEvent: (input) =>
      database.transaction((transaction) =>
        upsertCompletedBookingEventInTransaction(transaction, input)
      ),
    upsertFromAstroDiaryPeriod: (input) =>
      database.transaction((transaction) =>
        upsertAstroDiaryPeriodInTransaction(transaction, input)
      ),
    upsertPendingCompletedBookingEvents: async (input) => {
      if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 500) {
        throw new Error("Review completed booking source batch limit must be between 1 and 500");
      }
      const rows = await database
        .select({ lifecycleEventId: bookingLifecycleEvents.id })
        .from(bookingLifecycleEvents)
        .innerJoin(
          bookings,
          and(
            eq(bookings.id, bookingLifecycleEvents.bookingId),
            eq(bookings.ownerUserId, bookingLifecycleEvents.ownerUserId)
          )
        )
        .leftJoin(
          reviewableInstances,
          and(
            eq(reviewableInstances.kind, "booking"),
            eq(reviewableInstances.bookingId, bookings.id),
            eq(reviewableInstances.clientUserId, bookings.clientUserId),
            eq(reviewableInstances.astrologerUserId, bookings.ownerUserId)
          )
        )
        .where(
          and(
            eq(bookingLifecycleEvents.eventKind, "completed"),
            eq(bookings.state, "completed"),
            eq(bookings.lifecycleRevision, bookingLifecycleEvents.revision),
            isNull(reviewableInstances.id)
          )
        )
        .orderBy(asc(bookingLifecycleEvents.occurredAt), asc(bookingLifecycleEvents.id))
        .limit(input.limit);

      let created = 0;
      let existing = 0;
      let rejected = 0;
      const idGenerator = input.idGenerator ?? randomUUID;
      for (const row of rows) {
        const result = await database.transaction((transaction) =>
          upsertCompletedBookingEventInTransaction(transaction, {
            bookingLifecycleEventId: row.lifecycleEventId,
            nextReviewableInstanceId: idGenerator(),
            now: input.now
          })
        );
        if (result.kind === "created") created += 1;
        else if (result.kind === "existing") existing += 1;
        else rejected += 1;
      }

      return { scanned: rows.length, created, existing, rejected };
    },
    upsertPendingAstroDiaryPeriods: async (input) => {
      if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 500) {
        throw new Error("Review AstroDiary period source batch limit must be between 1 and 500");
      }
      const rows = await database
        .select({ periodId: clientEntitlementGrants.periodId })
        .from(clientEntitlementGrants)
        .innerJoin(
          clientSubscriptions,
          eq(clientSubscriptions.id, clientEntitlementGrants.subscriptionId)
        )
        .leftJoin(
          reviewableInstances,
          and(
            eq(reviewableInstances.kind, "astro_diary_period"),
            eq(
              reviewableInstances.sourceResourceKey,
              sql<string>`'astro_diary_period:' || ${clientEntitlementGrants.periodId}::text`
            )
          )
        )
        .where(
          and(
            eq(clientEntitlementGrants.capability, "astro_diary"),
            sql`${clientEntitlementGrants.state} in ('active', 'ended')`,
            sql`${clientSubscriptions.state} in ('active', 'ended')`,
            isNull(reviewableInstances.id)
          )
        )
        .orderBy(asc(clientEntitlementGrants.startsAt), asc(clientEntitlementGrants.periodId))
        .limit(input.limit);

      let created = 0;
      let existing = 0;
      let rejected = 0;
      const idGenerator = input.idGenerator ?? randomUUID;
      for (const row of rows) {
        const result = await database.transaction((transaction) =>
          upsertAstroDiaryPeriodInTransaction(transaction, {
            periodId: row.periodId,
            nextReviewableInstanceId: idGenerator(),
            now: input.now
          })
        );
        if (result.kind === "created") created += 1;
        else if (result.kind === "existing") existing += 1;
        else rejected += 1;
      }

      return { scanned: rows.length, created, existing, rejected };
    },
    upsertPendingSourceReceipts: async (input) => {
      if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 500) {
        throw new Error("Review source receipt batch limit must be between 1 and 500");
      }
      const rows = await database
        .select({ receiptId: reviewSourceReceipts.id })
        .from(reviewSourceReceipts)
        .leftJoin(
          reviewableInstances,
          and(
            eq(reviewableInstances.kind, reviewSourceReceipts.kind),
            eq(reviewableInstances.sourceResourceKey, reviewSourceReceipts.sourceResourceKey),
            eq(reviewableInstances.clientUserId, reviewSourceReceipts.clientUserId),
            eq(reviewableInstances.astrologerUserId, reviewSourceReceipts.astrologerUserId)
          )
        )
        .where(and(eq(reviewSourceReceipts.status, "received"), isNull(reviewableInstances.id)))
        .orderBy(asc(reviewSourceReceipts.receivedAt), asc(reviewSourceReceipts.id))
        .limit(input.limit);

      let created = 0;
      let existing = 0;
      let rejected = 0;
      const idGenerator = input.idGenerator ?? randomUUID;
      for (const row of rows) {
        const result = await database.transaction((transaction) =>
          upsertSourceReceiptInTransaction(transaction, {
            receiptId: row.receiptId,
            nextReviewableInstanceId: idGenerator(),
            now: input.now
          })
        );
        if (result.kind === "created") created += 1;
        else if (result.kind === "existing") existing += 1;
        else rejected += 1;
      }

      return { scanned: rows.length, created, existing, rejected };
    }
  };
}

async function recordSourceReceiptInTransaction(
  transaction: ReviewReceiptTransaction,
  input: ReviewSourceReceiptCommandInput
): Promise<RecordReviewSourceReceiptResult> {
  const existing = await readSourceReceiptBySource(transaction, input);
  if (existing) {
    if (!sourceReceiptMatchesInput(existing, input)) {
      return { kind: "rejected", reason: "source_identity_conflict" };
    }
    return { kind: "existing", receipt: toSourceReceiptRecord(existing) };
  }

  const context = await validateReceiptContextInTransaction(transaction, {
    ...input,
    nextReviewableInstanceId: input.id,
    bookingId: null
  });
  if (context.kind === "rejected") return context;

  const [created] = await transaction
    .insert(reviewSourceReceipts)
    .values({
      id: input.id,
      astrologerUserId: input.astrologerUserId,
      clientUserId: input.clientUserId,
      relationshipId: context.planned.instance.relationshipId,
      kind: input.kind,
      sourceResourceKey: input.sourceResourceKey,
      productId: input.productId,
      orderId: input.orderId,
      titleSnapshot: input.titleSnapshot,
      contextLabelSnapshot: input.contextLabelSnapshot,
      receivedAt: new Date(context.planned.instance.receivedAt),
      windowPolicy: input.windowPolicy,
      activePeriodEndsAt: input.activePeriodEndsAt ? new Date(input.activePeriodEndsAt) : null,
      status: "received",
      createdAt: new Date(input.now),
      updatedAt: new Date(input.now)
    })
    .onConflictDoNothing()
    .returning();

  if (created) return { kind: "created", receipt: toSourceReceiptRecord(created) };

  const afterConflict = await readSourceReceiptBySource(transaction, input);
  if (!afterConflict) {
    throw new Error("Expected review source receipt conflict to be readable");
  }
  return { kind: "existing", receipt: toSourceReceiptRecord(afterConflict) };
}

async function upsertSourceReceiptInTransaction(
  transaction: ReviewReceiptTransaction,
  input: {
    readonly receiptId: string;
    readonly nextReviewableInstanceId: string;
    readonly now: string;
  }
): Promise<UpsertReviewableInstanceFromReceiptResult> {
  const [receipt] = await transaction
    .select()
    .from(reviewSourceReceipts)
    .where(eq(reviewSourceReceipts.id, input.receiptId))
    .limit(1);
  if (!receipt || receipt.status !== "received") {
    return { kind: "rejected", reason: "relationship_not_active" };
  }

  return upsertReceiptInTransaction(transaction, {
    nextReviewableInstanceId: input.nextReviewableInstanceId,
    clientUserId: receipt.clientUserId,
    astrologerUserId: receipt.astrologerUserId,
    kind: receipt.kind as ReviewableInstanceKind,
    sourceResourceKey: receipt.sourceResourceKey,
    productId: receipt.productId,
    orderId: receipt.orderId,
    bookingId: null,
    titleSnapshot: receipt.titleSnapshot,
    contextLabelSnapshot: receipt.contextLabelSnapshot,
    receivedAt: receipt.receivedAt.toISOString(),
    windowPolicy: receipt.windowPolicy as ReviewWindowPolicy,
    activePeriodEndsAt: receipt.activePeriodEndsAt?.toISOString() ?? null,
    now: input.now
  });
}

async function upsertAstroDiaryPeriodInTransaction(
  transaction: ReviewReceiptTransaction,
  input: {
    readonly periodId: string;
    readonly nextReviewableInstanceId: string;
    readonly now: string;
  }
): Promise<UpsertReviewableInstanceFromReceiptResult> {
  const [row] = await transaction
    .select({
      grantId: clientEntitlementGrants.id,
      grantState: clientEntitlementGrants.state,
      capability: clientEntitlementGrants.capability,
      periodId: clientEntitlementGrants.periodId,
      startsAt: clientEntitlementGrants.startsAt,
      endsAt: clientEntitlementGrants.endsAt,
      grantCreatedAt: clientEntitlementGrants.createdAt,
      subscriptionState: clientSubscriptions.state,
      productId: clientSubscriptions.productId,
      relationshipId: clientAstrologerRelationships.id,
      clientUserId: clientAstrologerRelationships.clientUserId,
      astrologerUserId: clientAstrologerRelationships.astrologerUserId,
      productTitle: products.title
    })
    .from(clientEntitlementGrants)
    .innerJoin(
      clientSubscriptions,
      eq(clientSubscriptions.id, clientEntitlementGrants.subscriptionId)
    )
    .innerJoin(
      clientAstrologerRelationships,
      eq(clientAstrologerRelationships.id, clientEntitlementGrants.relationshipId)
    )
    .innerJoin(products, eq(products.id, clientSubscriptions.productId))
    .where(
      and(
        eq(clientEntitlementGrants.periodId, input.periodId),
        eq(clientEntitlementGrants.capability, "astro_diary")
      )
    )
    .limit(1);

  if (!row) return { kind: "rejected", reason: "astro_diary_period_not_found" };
  if (
    (row.grantState !== "active" && row.grantState !== "ended") ||
    (row.subscriptionState !== "active" && row.subscriptionState !== "ended")
  ) {
    return { kind: "rejected", reason: "astro_diary_period_not_reviewable" };
  }

  return upsertReceiptInTransaction(transaction, {
    nextReviewableInstanceId: input.nextReviewableInstanceId,
    clientUserId: row.clientUserId,
    astrologerUserId: row.astrologerUserId,
    kind: "astro_diary_period",
    sourceResourceKey: `astro_diary_period:${row.periodId}`,
    productId: row.productId,
    orderId: null,
    bookingId: null,
    titleSnapshot: row.productTitle,
    contextLabelSnapshot: `AstroDiary ${row.startsAt.toISOString()} - ${row.endsAt.toISOString()}`,
    receivedAt: row.grantCreatedAt.toISOString(),
    windowPolicy: "standard_14_days_after_receipt",
    now: input.now
  });
}

async function upsertCompletedBookingEventInTransaction(
  transaction: ReviewReceiptTransaction,
  input: {
    readonly bookingLifecycleEventId: string;
    readonly nextReviewableInstanceId: string;
    readonly now: string;
  }
): Promise<UpsertReviewableInstanceFromReceiptResult> {
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
}

async function upsertReceiptInTransaction(
  transaction: ReviewReceiptTransaction,
  input: ReviewableInstanceReceiptCommandInput
): Promise<UpsertReviewableInstanceFromReceiptResult> {
  const existing = await readBySource(transaction, input);
  if (existing) {
    if (!reviewableInstanceMatchesInput(existing, input)) {
      return { kind: "rejected", reason: "source_identity_conflict" };
    }
    return { kind: "existing", instance: toRecord(existing) };
  }

  const context = await validateReceiptContextInTransaction(transaction, input);
  if (context.kind === "rejected") return context;

  const [created] = await transaction
    .insert(reviewableInstances)
    .values({
      id: context.planned.instance.id,
      astrologerUserId: context.planned.instance.astrologerUserId,
      clientUserId: context.planned.instance.clientUserId,
      relationshipId: context.planned.instance.relationshipId,
      kind: context.planned.instance.kind,
      status: context.planned.instance.status,
      windowPolicy: context.planned.instance.windowPolicy,
      sourceResourceKey: context.planned.instance.sourceResourceKey,
      productId: context.planned.instance.productId,
      orderId: context.planned.instance.orderId,
      bookingId: context.planned.instance.bookingId,
      titleSnapshot: context.planned.instance.titleSnapshot,
      contextLabelSnapshot: context.planned.instance.contextLabelSnapshot,
      receivedAt: new Date(context.planned.instance.receivedAt),
      reviewWindowClosesAt: new Date(context.planned.instance.reviewWindowClosesAt),
      blockedReasonCode: context.planned.instance.blockedReasonCode,
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

async function validateReceiptContextInTransaction(
  transaction: ReviewReceiptTransaction,
  input: ReviewableInstanceReceiptCommandInput
): Promise<
  | {
      readonly kind: "ok";
      readonly planned: Extract<
        ReturnType<typeof planReviewableInstanceFromReceipt>,
        { readonly kind: "create" }
      >;
    }
  | Extract<UpsertReviewableInstanceFromReceiptResult, { readonly kind: "rejected" }>
> {
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
  return { kind: "ok", planned };
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

async function readSourceReceiptBySource(
  database: ReviewReceiptTransaction,
  input: Pick<
    ReviewSourceReceiptCommandInput,
    "astrologerUserId" | "clientUserId" | "kind" | "sourceResourceKey"
  >
): Promise<ReviewSourceReceiptRow | null> {
  const [row] = await database
    .select()
    .from(reviewSourceReceipts)
    .where(
      and(
        eq(reviewSourceReceipts.astrologerUserId, input.astrologerUserId),
        eq(reviewSourceReceipts.clientUserId, input.clientUserId),
        eq(reviewSourceReceipts.kind, input.kind),
        eq(reviewSourceReceipts.sourceResourceKey, input.sourceResourceKey)
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

function toSourceReceiptRecord(row: ReviewSourceReceiptRow): ReviewSourceReceiptRecord {
  return {
    id: row.id,
    clientUserId: row.clientUserId,
    astrologerUserId: row.astrologerUserId,
    relationshipId: row.relationshipId,
    kind: row.kind as ReviewableInstanceKind,
    sourceResourceKey: row.sourceResourceKey,
    productId: row.productId,
    orderId: row.orderId,
    titleSnapshot: row.titleSnapshot,
    contextLabelSnapshot: row.contextLabelSnapshot,
    receivedAt: row.receivedAt.toISOString(),
    windowPolicy: row.windowPolicy as ReviewWindowPolicy,
    activePeriodEndsAt: row.activePeriodEndsAt?.toISOString() ?? null,
    status: row.status as "received" | "revoked"
  };
}

function reviewableInstanceMatchesInput(
  row: ReviewableInstanceRow,
  input: ReviewableInstanceReceiptCommandInput
): boolean {
  return (
    row.productId === input.productId &&
    row.orderId === input.orderId &&
    row.bookingId === input.bookingId &&
    row.titleSnapshot === input.titleSnapshot &&
    row.contextLabelSnapshot === input.contextLabelSnapshot &&
    row.windowPolicy === input.windowPolicy &&
    row.receivedAt.toISOString() === toIsoOrNull(input.receivedAt)
  );
}

function sourceReceiptMatchesInput(
  row: ReviewSourceReceiptRow,
  input: ReviewSourceReceiptCommandInput
): boolean {
  return (
    row.productId === input.productId &&
    row.orderId === input.orderId &&
    row.titleSnapshot === input.titleSnapshot &&
    row.contextLabelSnapshot === input.contextLabelSnapshot &&
    row.windowPolicy === input.windowPolicy &&
    row.status === "received" &&
    row.receivedAt.toISOString() === toIsoOrNull(input.receivedAt) &&
    (row.activePeriodEndsAt?.toISOString() ?? null) ===
      (input.activePeriodEndsAt ? toIsoOrNull(input.activePeriodEndsAt) : null)
  );
}

function toIsoOrNull(value: string): string | null {
  const date = new Date(value);
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? date.toISOString() : null;
}
