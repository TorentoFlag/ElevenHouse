import { randomUUID } from "node:crypto";

import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { CreateFinanceOrderRecordInput } from "@elevenhouse/domain";

import type { PostgresRuntime } from "../../runtime";
import {
  availabilitySchedules,
  bookingLifecycleEvents,
  bookings,
  clientAstrologerRelationships,
  products,
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
        reviewWindowClosesAt: "2026-08-15T10:00:00.000Z"
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
});

type OrderFixture = {
  readonly clientUserId: string;
  readonly astrologerUserId: string;
  readonly productId: string;
  readonly relationshipId: string;
  readonly orderId: string;
  readonly orderInput: CreateFinanceOrderRecordInput;
};

async function seedPaidOrderFixture(runtime: PostgresRuntime): Promise<OrderFixture> {
  return seedOrderFixture(runtime, "paid");
}

async function seedPendingOrderFixture(runtime: PostgresRuntime): Promise<OrderFixture> {
  return seedOrderFixture(runtime, "pending_payment");
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
  status: "paid" | "pending_payment"
): Promise<OrderFixture> {
  const prerequisite = await seedClientSubscriptionOrderPrerequisites(runtime, "standard");
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
