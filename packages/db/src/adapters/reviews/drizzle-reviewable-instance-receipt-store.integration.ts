import { randomUUID } from "node:crypto";

import { count, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { CreateFinanceOrderRecordInput } from "@elevenhouse/domain";

import type { PostgresRuntime } from "../../runtime";
import {
  availabilitySchedules,
  bookingLifecycleEvents,
  bookings,
  clientAstrologerRelationships,
  products,
  reviewSourceReceipts,
  reviewableInstances,
  scheduleReservations,
  users
} from "../../schema";
import {
  createActiveClientSubscriptionFixture,
  createClientSubscriptionIntegrationDatabase,
  seedClientSubscriptionOrderPrerequisites,
  type ClientSubscriptionIntegrationDatabase
} from "../client-subscriptions/client-subscription-integration-fixture";
import { createDrizzleOrderStore } from "../finance/drizzle-order-store";
import { createDrizzleReviewableInstanceReceiptStore } from "./drizzle-reviewable-instance-receipt-store";

describe.sequential("Drizzle reviewable instance receipt store", () => {
  let integration: ClientSubscriptionIntegrationDatabase;
  let runtime: PostgresRuntime;

  beforeAll(async () => {
    integration = await createClientSubscriptionIntegrationDatabase();
    runtime = integration.runtime;
  }, 60_000);

  afterAll(async () => {
    await integration?.close();
  }, 30_000);

  it("creates an idempotent reviewable instance from a server-owned delivery receipt", async () => {
    const fixture = await seedPaidOrderFixture(runtime);
    const store = createDrizzleReviewableInstanceReceiptStore(runtime.database);
    const sourceResourceKey = `async_delivery:${randomUUID()}`;

    const created = await store.upsertFromReceipt({
      nextReviewableInstanceId: randomUUID(),
      clientUserId: fixture.clientUserId,
      astrologerUserId: fixture.astrologerUserId,
      kind: "async_delivery",
      sourceResourceKey,
      productId: fixture.productId,
      orderId: fixture.orderId,
      bookingId: null,
      titleSnapshot: "Письменный разбор",
      contextLabelSnapshot: "Материал выдан клиенту",
      receivedAt: "2026-08-20T10:00:00.000Z",
      windowPolicy: "standard_14_days_after_receipt",
      now: "2026-08-20T10:01:00.000Z"
    });

    expect(created).toMatchObject({
      kind: "created",
      instance: {
        clientUserId: fixture.clientUserId,
        astrologerUserId: fixture.astrologerUserId,
        relationshipId: fixture.relationshipId,
        kind: "async_delivery",
        status: "reviewable",
        sourceResourceKey,
        reviewWindowClosesAt: "2026-09-03T10:00:00.000Z"
      }
    });

    const repeated = await store.upsertFromReceipt({
      nextReviewableInstanceId: randomUUID(),
      clientUserId: fixture.clientUserId,
      astrologerUserId: fixture.astrologerUserId,
      kind: "async_delivery",
      sourceResourceKey,
      productId: fixture.productId,
      orderId: fixture.orderId,
      bookingId: null,
      titleSnapshot: "Письменный разбор",
      contextLabelSnapshot: "Материал выдан клиенту",
      receivedAt: "2026-08-20T10:00:00.000Z",
      windowPolicy: "standard_14_days_after_receipt",
      now: "2026-08-20T10:02:00.000Z"
    });

    expect(repeated).toMatchObject({
      kind: "existing",
      instance: { id: created.kind === "created" ? created.instance.id : "" }
    });
    const [rowCount] = await runtime.database
      .select({ value: count() })
      .from(reviewableInstances)
      .where(eq(reviewableInstances.sourceResourceKey, sourceResourceKey));
    expect(Number(rowCount?.value ?? 0)).toBe(1);
  });

  it("creates a booking reviewable instance from an immutable completed booking event", async () => {
    const fixture = await seedCompletedBookingFixture(runtime);
    const store = createDrizzleReviewableInstanceReceiptStore(runtime.database);

    const created = await store.upsertFromCompletedBookingEvent({
      bookingLifecycleEventId: fixture.completedEventId,
      nextReviewableInstanceId: randomUUID(),
      now: "2026-08-20T10:01:00.000Z"
    });

    expect(created).toMatchObject({
      kind: "created",
      instance: {
        clientUserId: fixture.clientUserId,
        astrologerUserId: fixture.astrologerUserId,
        relationshipId: fixture.relationshipId,
        kind: "booking",
        sourceResourceKey: `booking:${fixture.bookingId}`,
        bookingId: fixture.bookingId,
        productId: fixture.productId,
        orderId: null,
        titleSnapshot: "Natal consultation",
        contextLabelSnapshot: "60 минут",
        receivedAt: "2026-08-19T11:00:00.000Z",
        reviewWindowClosesAt: "2026-09-02T11:00:00.000Z"
      }
    });

    await expect(
      store.upsertFromCompletedBookingEvent({
        bookingLifecycleEventId: fixture.completedEventId,
        nextReviewableInstanceId: randomUUID(),
        now: "2026-08-20T10:02:00.000Z"
      })
    ).resolves.toMatchObject({
      kind: "existing",
      instance: { id: created.kind === "created" ? created.instance.id : "" }
    });
  });

  it("scans pending completed booking events and opens missing reviewable instances", async () => {
    const fixture = await seedCompletedBookingFixture(runtime);
    const store = createDrizzleReviewableInstanceReceiptStore(runtime.database);

    await expect(
      store.upsertPendingCompletedBookingEvents({
        limit: 10,
        now: "2026-08-20T10:03:00.000Z"
      })
    ).resolves.toEqual({ scanned: 1, created: 1, existing: 0, rejected: 0 });

    const [rowCount] = await runtime.database
      .select({ value: count() })
      .from(reviewableInstances)
      .where(eq(reviewableInstances.sourceResourceKey, `booking:${fixture.bookingId}`));
    expect(Number(rowCount?.value ?? 0)).toBe(1);

    await expect(
      store.upsertPendingCompletedBookingEvents({
        limit: 10,
        now: "2026-08-20T10:04:00.000Z"
      })
    ).resolves.toEqual({ scanned: 0, created: 0, existing: 0, rejected: 0 });
  });

  it("creates an AstroDiary reviewable instance from an active entitlement period", async () => {
    const fixture = await createActiveClientSubscriptionFixture(
      runtime,
      "2026-08-01T10:00:00.000Z"
    );
    const store = createDrizzleReviewableInstanceReceiptStore(runtime.database);

    const created = await store.upsertFromAstroDiaryPeriod({
      periodId: fixture.periodId,
      nextReviewableInstanceId: randomUUID(),
      now: "2026-08-01T10:01:00.000Z"
    });

    expect(created).toMatchObject({
      kind: "created",
      instance: {
        clientUserId: fixture.authority.clientUserId,
        astrologerUserId: fixture.authority.astrologerUserId,
        relationshipId: fixture.authority.relationshipId,
        kind: "astro_diary_period",
        sourceResourceKey: `astro_diary_period:${fixture.periodId}`,
        productId: fixture.authority.productId,
        orderId: null,
        titleSnapshot: "AstroDiary integration",
        receivedAt: "2026-08-01T10:00:00.000Z",
        windowPolicy: "active_period_plus_14_days",
        reviewWindowClosesAt: "2026-09-15T10:00:00.000Z"
      }
    });

    await expect(
      store.upsertFromAstroDiaryPeriod({
        periodId: fixture.periodId,
        nextReviewableInstanceId: randomUUID(),
        now: "2026-08-01T10:02:00.000Z"
      })
    ).resolves.toMatchObject({
      kind: "existing",
      instance: { id: created.kind === "created" ? created.instance.id : "" }
    });
  });

  it("scans pending AstroDiary entitlement periods and opens missing reviewable instances", async () => {
    const fixture = await createActiveClientSubscriptionFixture(
      runtime,
      "2026-08-02T10:00:00.000Z"
    );
    const store = createDrizzleReviewableInstanceReceiptStore(runtime.database);

    await expect(
      store.upsertPendingAstroDiaryPeriods({
        limit: 10,
        now: "2026-08-02T10:01:00.000Z"
      })
    ).resolves.toEqual({ scanned: 1, created: 1, existing: 0, rejected: 0 });

    const [rowCount] = await runtime.database
      .select({ value: count() })
      .from(reviewableInstances)
      .where(eq(reviewableInstances.sourceResourceKey, `astro_diary_period:${fixture.periodId}`));
    expect(Number(rowCount?.value ?? 0)).toBe(1);

    await expect(
      store.upsertPendingAstroDiaryPeriods({
        limit: 10,
        now: "2026-08-02T10:02:00.000Z"
      })
    ).resolves.toEqual({ scanned: 0, created: 0, existing: 0, rejected: 0 });
  });

  it("records a durable generic source receipt and opens it through the scanner", async () => {
    const fixture = await seedPaidOrderFixture(runtime);
    const store = createDrizzleReviewableInstanceReceiptStore(runtime.database);
    const receiptId = randomUUID();
    const sourceResourceKey = `astro_calendar_service_period:${randomUUID()}`;

    await expect(
      store.recordSourceReceipt({
        id: receiptId,
        clientUserId: fixture.clientUserId,
        astrologerUserId: fixture.astrologerUserId,
        kind: "astro_calendar_service_period",
        sourceResourceKey,
        productId: fixture.productId,
        orderId: fixture.orderId,
        titleSnapshot: "AstroCalendar",
        contextLabelSnapshot: "Период услуги 20-25 августа",
        receivedAt: "2026-08-20T00:00:00.000Z",
        windowPolicy: "active_period_plus_14_days",
        activePeriodEndsAt: "2026-08-25T23:59:59.000Z",
        now: "2026-08-20T00:01:00.000Z"
      })
    ).resolves.toMatchObject({
      kind: "created",
      receipt: {
        id: receiptId,
        relationshipId: fixture.relationshipId,
        kind: "astro_calendar_service_period",
        sourceResourceKey,
        status: "received"
      }
    });

    const [receiptCount] = await runtime.database
      .select({ value: count() })
      .from(reviewSourceReceipts)
      .where(eq(reviewSourceReceipts.sourceResourceKey, sourceResourceKey));
    expect(Number(receiptCount?.value ?? 0)).toBe(1);

    await expect(
      store.upsertPendingSourceReceipts({
        limit: 10,
        now: "2026-08-20T00:02:00.000Z"
      })
    ).resolves.toEqual({ scanned: 1, created: 1, existing: 0, rejected: 0 });

    const [instance] = await runtime.database
      .select({
        sourceResourceKey: reviewableInstances.sourceResourceKey,
        reviewWindowClosesAt: reviewableInstances.reviewWindowClosesAt
      })
      .from(reviewableInstances)
      .where(eq(reviewableInstances.sourceResourceKey, sourceResourceKey))
      .limit(1);
    expect(instance).toEqual({
      sourceResourceKey,
      reviewWindowClosesAt: new Date("2026-09-08T23:59:59.000Z")
    });

    await expect(
      store.upsertPendingSourceReceipts({
        limit: 10,
        now: "2026-08-20T00:03:00.000Z"
      })
    ).resolves.toEqual({ scanned: 0, created: 0, existing: 0, rejected: 0 });
  });

  it("rejects changed source receipt context for the same source identity", async () => {
    const fixture = await seedPaidOrderFixture(runtime);
    const store = createDrizzleReviewableInstanceReceiptStore(runtime.database);
    const sourceResourceKey = `async_delivery:${randomUUID()}`;

    await expect(
      store.recordSourceReceipt({
        id: randomUUID(),
        clientUserId: fixture.clientUserId,
        astrologerUserId: fixture.astrologerUserId,
        kind: "async_delivery",
        sourceResourceKey,
        productId: fixture.productId,
        orderId: fixture.orderId,
        titleSnapshot: "Письменный разбор",
        contextLabelSnapshot: "Материал выдан клиенту",
        receivedAt: "2026-08-20T10:00:00.000Z",
        windowPolicy: "standard_14_days_after_receipt",
        now: "2026-08-20T10:01:00.000Z"
      })
    ).resolves.toMatchObject({ kind: "created" });

    await expect(
      store.recordSourceReceipt({
        id: randomUUID(),
        clientUserId: fixture.clientUserId,
        astrologerUserId: fixture.astrologerUserId,
        kind: "async_delivery",
        sourceResourceKey,
        productId: fixture.productId,
        orderId: fixture.orderId,
        titleSnapshot: "Другой материал",
        contextLabelSnapshot: "Материал выдан клиенту",
        receivedAt: "2026-08-20T10:00:00.000Z",
        windowPolicy: "standard_14_days_after_receipt",
        now: "2026-08-20T10:02:00.000Z"
      })
    ).resolves.toEqual({ kind: "rejected", reason: "source_identity_conflict" });
  });

  it("rejects changed reviewable instance context for the same source identity", async () => {
    const fixture = await seedPaidOrderFixture(runtime);
    const store = createDrizzleReviewableInstanceReceiptStore(runtime.database);
    const sourceResourceKey = `instant_delivery:${randomUUID()}`;

    await expect(
      store.upsertFromReceipt({
        nextReviewableInstanceId: randomUUID(),
        clientUserId: fixture.clientUserId,
        astrologerUserId: fixture.astrologerUserId,
        kind: "instant_delivery",
        sourceResourceKey,
        productId: fixture.productId,
        orderId: fixture.orderId,
        bookingId: null,
        titleSnapshot: "Моментальный материал",
        contextLabelSnapshot: "Материал выдан клиенту",
        receivedAt: "2026-08-20T10:00:00.000Z",
        windowPolicy: "standard_14_days_after_receipt",
        now: "2026-08-20T10:01:00.000Z"
      })
    ).resolves.toMatchObject({ kind: "created" });

    await expect(
      store.upsertFromReceipt({
        nextReviewableInstanceId: randomUUID(),
        clientUserId: fixture.clientUserId,
        astrologerUserId: fixture.astrologerUserId,
        kind: "instant_delivery",
        sourceResourceKey,
        productId: fixture.productId,
        orderId: fixture.orderId,
        bookingId: null,
        titleSnapshot: "Моментальный материал",
        contextLabelSnapshot: "Другой контекст",
        receivedAt: "2026-08-20T10:00:00.000Z",
        windowPolicy: "standard_14_days_after_receipt",
        now: "2026-08-20T10:02:00.000Z"
      })
    ).resolves.toEqual({ kind: "rejected", reason: "source_identity_conflict" });
  });

  it("allows several received products within the same client relationship", async () => {
    const fixture = await seedPaidOrderFixture(runtime);
    const secondOrderInput = {
      ...fixture.orderInput,
      id: randomUUID(),
      now: "2026-08-20T11:00:00.000Z"
    } satisfies CreateFinanceOrderRecordInput;
    const secondOrder = await createDrizzleOrderStore(runtime.database).create(secondOrderInput);
    const store = createDrizzleReviewableInstanceReceiptStore(runtime.database);

    const first = await store.upsertFromReceipt({
      nextReviewableInstanceId: randomUUID(),
      clientUserId: fixture.clientUserId,
      astrologerUserId: fixture.astrologerUserId,
      kind: "async_delivery",
      sourceResourceKey: `async_delivery:${randomUUID()}`,
      productId: fixture.productId,
      orderId: fixture.orderId,
      bookingId: null,
      titleSnapshot: "Письменный разбор",
      contextLabelSnapshot: "Материал 1",
      receivedAt: "2026-08-20T10:00:00.000Z",
      windowPolicy: "standard_14_days_after_receipt",
      now: "2026-08-20T10:01:00.000Z"
    });
    const second = await store.upsertFromReceipt({
      nextReviewableInstanceId: randomUUID(),
      clientUserId: fixture.clientUserId,
      astrologerUserId: fixture.astrologerUserId,
      kind: "instant_delivery",
      sourceResourceKey: `instant_delivery:${randomUUID()}`,
      productId: fixture.productId,
      orderId: secondOrder.id,
      bookingId: null,
      titleSnapshot: "Моментальный материал",
      contextLabelSnapshot: "Материал 2",
      receivedAt: "2026-08-21T10:00:00.000Z",
      windowPolicy: "standard_14_days_after_receipt",
      now: "2026-08-21T10:01:00.000Z"
    });

    expect(first.kind).toBe("created");
    expect(second.kind).toBe("created");
    const rows = await runtime.database
      .select({ id: reviewableInstances.id })
      .from(reviewableInstances)
      .where(eq(reviewableInstances.relationshipId, fixture.relationshipId));
    expect(rows).toHaveLength(2);
  });

  it("does not open a review window from a pending payment order context", async () => {
    const fixture = await seedPendingOrderFixture(runtime);
    const store = createDrizzleReviewableInstanceReceiptStore(runtime.database);

    await expect(
      store.upsertFromReceipt({
        nextReviewableInstanceId: randomUUID(),
        clientUserId: fixture.clientUserId,
        astrologerUserId: fixture.astrologerUserId,
        kind: "async_delivery",
        sourceResourceKey: `async_delivery:${randomUUID()}`,
        productId: fixture.productId,
        orderId: fixture.orderId,
        bookingId: null,
        titleSnapshot: "Письменный разбор",
        contextLabelSnapshot: "Материал выдан клиенту",
        receivedAt: "2026-08-20T10:00:00.000Z",
        windowPolicy: "standard_14_days_after_receipt",
        now: "2026-08-20T10:01:00.000Z"
      })
    ).resolves.toEqual({ kind: "rejected", reason: "order_not_reviewable" });
  });

  it("records review source receipts from paid async product fulfillment", async () => {
    const fixture = await seedPaidOrderFixture(runtime);
    const store = createDrizzleReviewableInstanceReceiptStore(runtime.database);

    await expect(
      store.recordPaidOrderFulfillmentReceipt({
        id: randomUUID(),
        astrologerUserId: fixture.astrologerUserId,
        orderId: fixture.orderId,
        receivedAt: "2026-08-22T10:00:00.000Z",
        now: "2026-08-22T10:01:00.000Z"
      })
    ).resolves.toMatchObject({
      kind: "created",
      receipt: {
        clientUserId: fixture.clientUserId,
        astrologerUserId: fixture.astrologerUserId,
        relationshipId: fixture.relationshipId,
        kind: "async_delivery",
        sourceResourceKey: `async_delivery:${fixture.orderId}`,
        productId: fixture.productId,
        orderId: fixture.orderId,
        contextLabelSnapshot: "Материал выдан клиенту",
        windowPolicy: "standard_14_days_after_receipt"
      }
    });

    await expect(
      store.upsertPendingSourceReceipts({
        limit: 1,
        now: "2026-08-22T10:02:00.000Z"
      })
    ).resolves.toEqual({ scanned: 1, created: 1, existing: 0, rejected: 0 });
  });

  it("maps course and subscription fulfillment receipts to their review windows", async () => {
    const courseFixture = await seedPaidOrderFixture(runtime);
    const subscriptionFixture = await seedPaidOrderFixture(runtime);
    await runtime.database
      .update(products)
      .set({
        type: "course",
        executionMode: "async",
        paymentModel: "once",
        participantMode: "solo",
        revision: sql`${products.revision} + 1`,
        updatedAt: new Date("2026-08-22T09:59:00.000Z")
      })
      .where(eq(products.id, courseFixture.productId));
    await runtime.database
      .update(products)
      .set({
        type: "sub",
        executionMode: "async",
        paymentModel: "sub",
        participantMode: "solo",
        subscriptionPeriod: "month",
        revision: sql`${products.revision} + 1`,
        updatedAt: new Date("2026-08-22T09:59:00.000Z")
      })
      .where(eq(products.id, subscriptionFixture.productId));
    const store = createDrizzleReviewableInstanceReceiptStore(runtime.database);

    await expect(
      store.recordPaidOrderFulfillmentReceipt({
        id: randomUUID(),
        astrologerUserId: courseFixture.astrologerUserId,
        orderId: courseFixture.orderId,
        receivedAt: "2026-08-22T10:00:00.000Z",
        now: "2026-08-22T10:01:00.000Z"
      })
    ).resolves.toMatchObject({
      kind: "created",
      receipt: {
        kind: "course_access",
        sourceResourceKey: `course_access:${courseFixture.orderId}`,
        contextLabelSnapshot: "Доступ к курсу открыт",
        windowPolicy: "standard_14_days_after_receipt"
      }
    });

    await expect(
      store.recordPaidOrderFulfillmentReceipt({
        id: randomUUID(),
        astrologerUserId: subscriptionFixture.astrologerUserId,
        orderId: subscriptionFixture.orderId,
        receivedAt: "2026-08-22T10:00:00.000Z",
        now: "2026-08-22T10:01:00.000Z"
      })
    ).resolves.toEqual({ kind: "rejected", reason: "active_period_end_required" });

    await expect(
      store.recordPaidOrderFulfillmentReceipt({
        id: randomUUID(),
        astrologerUserId: subscriptionFixture.astrologerUserId,
        orderId: subscriptionFixture.orderId,
        receivedAt: "2026-08-22T10:00:00.000Z",
        activePeriodEndsAt: "2026-09-22T10:00:00.000Z",
        now: "2026-08-22T10:01:00.000Z"
      })
    ).resolves.toMatchObject({
      kind: "created",
      receipt: {
        kind: "subscription_period",
        sourceResourceKey: `subscription_period:${subscriptionFixture.orderId}`,
        contextLabelSnapshot: "Период подписки активирован",
        windowPolicy: "active_period_plus_14_days",
        activePeriodEndsAt: "2026-09-22T10:00:00.000Z"
      }
    });
  });

  it("maps paid pack fulfillment to a pack session receipt", async () => {
    const fixture = await seedPaidOrderFixture(runtime);
    await runtime.database
      .update(products)
      .set({
        type: "pack",
        executionMode: "async",
        paymentModel: "once",
        participantMode: "solo",
        revision: sql`${products.revision} + 1`,
        updatedAt: new Date("2026-08-22T09:59:00.000Z")
      })
      .where(eq(products.id, fixture.productId));
    const store = createDrizzleReviewableInstanceReceiptStore(runtime.database);

    await expect(
      store.recordPaidOrderFulfillmentReceipt({
        id: randomUUID(),
        astrologerUserId: fixture.astrologerUserId,
        orderId: fixture.orderId,
        receivedAt: "2026-08-22T10:00:00.000Z",
        now: "2026-08-22T10:01:00.000Z"
      })
    ).resolves.toMatchObject({
      kind: "created",
      receipt: {
        kind: "pack_session",
        sourceResourceKey: `pack_session:${fixture.orderId}`,
        contextLabelSnapshot: "Сессия из пакета оказана",
        windowPolicy: "standard_14_days_after_receipt"
      }
    });
  });

  it("rejects AstroDiary paid order fulfillment in favor of entitlement period receipts", async () => {
    const fixture = await seedPaidOrderFixture(runtime, "astro_diary");
    const store = createDrizzleReviewableInstanceReceiptStore(runtime.database);

    await expect(
      store.recordPaidOrderFulfillmentReceipt({
        id: randomUUID(),
        astrologerUserId: fixture.astrologerUserId,
        orderId: fixture.orderId,
        receivedAt: "2026-08-22T10:00:00.000Z",
        activePeriodEndsAt: "2026-09-22T10:00:00.000Z",
        now: "2026-08-22T10:01:00.000Z"
      })
    ).resolves.toEqual({
      kind: "rejected",
      reason: "astro_diary_requires_entitlement_period"
    });
  });

  it("rejects gift paid order fulfillment without a redemption recipient receipt", async () => {
    const fixture = await seedPaidOrderFixture(runtime);
    await runtime.database
      .update(products)
      .set({
        participantMode: "gift",
        revision: sql`${products.revision} + 1`,
        updatedAt: new Date("2026-08-22T09:59:00.000Z")
      })
      .where(eq(products.id, fixture.productId));
    const store = createDrizzleReviewableInstanceReceiptStore(runtime.database);

    await expect(
      store.recordPaidOrderFulfillmentReceipt({
        id: randomUUID(),
        astrologerUserId: fixture.astrologerUserId,
        orderId: fixture.orderId,
        receivedAt: "2026-08-22T10:00:00.000Z",
        now: "2026-08-22T10:01:00.000Z"
      })
    ).resolves.toEqual({
      kind: "rejected",
      reason: "gift_requires_redemption_receipt"
    });
  });

  it("does not record paid live order fulfillment without terminal booking evidence", async () => {
    const fixture = await seedPaidOrderFixture(runtime);
    await runtime.database
      .update(products)
      .set({
        type: "single",
        executionMode: "live",
        paymentModel: "once",
        participantMode: "solo",
        durationMinutes: 60,
        revision: sql`${products.revision} + 1`,
        updatedAt: new Date("2026-08-22T09:59:00.000Z")
      })
      .where(eq(products.id, fixture.productId));
    const store = createDrizzleReviewableInstanceReceiptStore(runtime.database);

    await expect(
      store.recordPaidOrderFulfillmentReceipt({
        id: randomUUID(),
        astrologerUserId: fixture.astrologerUserId,
        orderId: fixture.orderId,
        receivedAt: "2026-08-22T10:00:00.000Z",
        now: "2026-08-22T10:01:00.000Z"
      })
    ).resolves.toEqual({ kind: "rejected", reason: "live_order_requires_terminal_booking" });
  });
});

type OrderFixture = {
  readonly clientUserId: string;
  readonly astrologerUserId: string;
  readonly productId: string;
  readonly relationshipId: string;
  readonly orderId: string;
  readonly orderInput: CreateFinanceOrderRecordInput;
};

async function seedPaidOrderFixture(
  runtime: PostgresRuntime,
  purpose: "astro_diary" | "standard" = "standard"
): Promise<OrderFixture> {
  return seedOrderFixture(runtime, "paid", purpose);
}

async function seedPendingOrderFixture(runtime: PostgresRuntime): Promise<OrderFixture> {
  return seedOrderFixture(runtime, "pending_payment", "standard");
}

type CompletedBookingFixture = {
  readonly clientUserId: string;
  readonly astrologerUserId: string;
  readonly relationshipId: string;
  readonly productId: string;
  readonly bookingId: string;
  readonly completedEventId: string;
};

async function seedCompletedBookingFixture(
  runtime: PostgresRuntime
): Promise<CompletedBookingFixture> {
  const clientUserId = randomUUID();
  const astrologerUserId = randomUUID();
  const relationshipId = randomUUID();
  const productId = randomUUID();
  const scheduleId = randomUUID();
  const bookingId = randomUUID();
  const reservationId = randomUUID();
  const confirmedEventId = randomUUID();
  const completedEventId = randomUUID();
  const now = new Date("2026-08-20T09:00:00.000Z");
  const serviceStartAt = new Date("2026-08-19T10:00:00.000Z");
  const serviceEndAt = new Date("2026-08-19T11:00:00.000Z");

  await runtime.database.transaction(async (transaction) => {
    await transaction.insert(users).values([{ id: clientUserId }, { id: astrologerUserId }]);
    await transaction.insert(clientAstrologerRelationships).values({
      id: relationshipId,
      clientUserId,
      astrologerUserId,
      source: "booking",
      status: "active",
      firstLinkedAt: now,
      lastLinkedAt: now,
      createdAt: now,
      updatedAt: now
    });
    await transaction.insert(products).values({
      id: productId,
      ownerUserId: astrologerUserId,
      type: "single",
      status: "active",
      revision: 1,
      title: "Natal consultation",
      priceMinor: 12000,
      currency: "RUB",
      executionMode: "live",
      paymentModel: "once",
      durationMinutes: 60,
      participantMode: "solo",
      createdAt: now,
      updatedAt: now
    });
    await transaction.insert(availabilitySchedules).values({
      id: scheduleId,
      ownerUserId: astrologerUserId,
      name: "Reviews completed booking",
      timeZone: "Europe/Moscow",
      isDefault: true,
      version: 1,
      startIntervalMinutes: 60,
      bookingHorizonDays: 365,
      createdAt: now,
      updatedAt: now
    });
    await transaction.insert(scheduleReservations).values({
      id: reservationId,
      ownerUserId: astrologerUserId,
      scheduleId,
      kind: "booking",
      lifecycle: "active",
      serviceStartAt,
      serviceEndAt,
      occupiedStartAt: serviceStartAt,
      occupiedEndAt: serviceEndAt,
      sourceAggregateId: bookingId,
      createdAt: serviceStartAt,
      updatedAt: serviceStartAt
    });
    await transaction.insert(bookings).values({
      id: bookingId,
      ownerUserId: astrologerUserId,
      clientUserId,
      productId,
      reservationId,
      source: "manual",
      state: "completed",
      lifecycleRevision: 2,
      holdExpiresAt: null,
      serviceStartAt,
      serviceEndAt,
      productTitleSnapshot: "Natal consultation",
      durationMinutesSnapshot: 60,
      deliveryFormatSnapshot: "video",
      priceMinorSnapshot: 12000,
      currencySnapshot: "RUB",
      timeZoneSnapshot: "Europe/Moscow",
      policySnapshot: { bufferBeforeMinutes: 0, bufferAfterMinutes: 0, minimumNoticeMinutes: 0 },
      clientDataRequirementsSnapshot: {
        schemaVersion: "booking-client-data-requirements.v1",
        executionMode: "live",
        participantMode: "solo",
        requiredClientData: [],
        methods: []
      },
      createdAt: serviceStartAt,
      updatedAt: serviceEndAt
    });
    await transaction.insert(bookingLifecycleEvents).values([
      {
        id: confirmedEventId,
        bookingId,
        ownerUserId: astrologerUserId,
        revision: 1,
        eventKind: "confirmed",
        actorKind: "system",
        actorUserId: null,
        reasonCode: null,
        beforeStartAt: null,
        beforeEndAt: null,
        beforeTimeZone: null,
        afterStartAt: serviceStartAt,
        afterEndAt: serviceEndAt,
        afterTimeZone: "Europe/Moscow",
        canonicalDigest: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        occurredAt: serviceStartAt,
        createdAt: serviceStartAt
      },
      {
        id: completedEventId,
        bookingId,
        ownerUserId: astrologerUserId,
        revision: 2,
        eventKind: "completed",
        actorKind: "system",
        actorUserId: null,
        reasonCode: null,
        beforeStartAt: serviceStartAt,
        beforeEndAt: serviceEndAt,
        beforeTimeZone: "Europe/Moscow",
        afterStartAt: null,
        afterEndAt: null,
        afterTimeZone: null,
        canonicalDigest: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
        occurredAt: serviceEndAt,
        createdAt: serviceEndAt
      }
    ]);
  });

  return { clientUserId, astrologerUserId, relationshipId, productId, bookingId, completedEventId };
}

async function seedOrderFixture(
  runtime: PostgresRuntime,
  status: "paid" | "pending_payment",
  purpose: "astro_diary" | "standard"
): Promise<OrderFixture> {
  const prerequisite = await seedClientSubscriptionOrderPrerequisites(runtime, purpose);
  const orderInput = {
    ...prerequisite.orderInput,
    status
  } satisfies CreateFinanceOrderRecordInput;
  const order = await createDrizzleOrderStore(runtime.database).create(orderInput);
  return {
    clientUserId: prerequisite.authority.clientUserId,
    astrologerUserId: prerequisite.authority.astrologerUserId,
    productId: prerequisite.authority.productId,
    relationshipId: prerequisite.authority.relationshipId,
    orderId: order.id,
    orderInput
  };
}
