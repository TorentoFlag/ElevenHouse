import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PostgresRuntime } from "../../runtime";
import {
  availabilitySchedules,
  bookingLifecycleEvents,
  bookings,
  clientAstrologerRelationships,
  products,
  scheduleReservations,
  users
} from "../../schema";
import {
  createClientSubscriptionIntegrationDatabase,
  type ClientSubscriptionIntegrationDatabase
} from "../client-subscriptions/client-subscription-integration-fixture";
import { createDrizzleBookingClientServiceWorkSummaryReader } from "./drizzle-booking-client-service-work-summary-reader";

describe.sequential("Drizzle booking client service-work summary reader", () => {
  let integration: ClientSubscriptionIntegrationDatabase;
  let runtime: PostgresRuntime;

  beforeAll(async () => {
    integration = await createClientSubscriptionIntegrationDatabase();
    runtime = integration.runtime;
  }, 60_000);

  afterAll(async () => {
    await integration?.close();
  }, 30_000);

  it("returns bounded owner-client bookings without leaking foreign or inactive relationships", async () => {
    const fixture = await seedBookingSummaryFixture(runtime);
    const reader = createDrizzleBookingClientServiceWorkSummaryReader(runtime.database);

    await expect(
      reader.listClientServiceWorkBookings({
        ownerUserId: fixture.ownerUserId,
        clientUserId: fixture.clientUserId,
        now: "2026-08-20T10:00:00.000Z",
        limit: 3
      })
    ).resolves.toEqual({
      upcomingTotal: 1,
      upcoming: [
        {
          id: fixture.upcomingBookingId,
          state: "confirmed",
          productTitle: "Natal consultation",
          startAt: "2026-08-21T10:00:00.000Z",
          endAt: "2026-08-21T11:00:00.000Z",
          timeZone: "Europe/Moscow",
          href: `/calendar?bookingId=${fixture.upcomingBookingId}&startAt=2026-08-21T10%3A00%3A00.000Z`
        }
      ],
      recentTotal: 1,
      recent: [
        {
          id: fixture.recentBookingId,
          state: "completed",
          productTitle: "Natal consultation",
          startAt: "2026-08-19T10:00:00.000Z",
          endAt: "2026-08-19T11:00:00.000Z",
          timeZone: "Europe/Moscow",
          href: `/calendar?bookingId=${fixture.recentBookingId}&startAt=2026-08-19T10%3A00%3A00.000Z`
        }
      ]
    });

    await expect(
      reader.listClientServiceWorkBookings({
        ownerUserId: fixture.ownerUserId,
        clientUserId: fixture.blockedClientUserId,
        now: "2026-08-20T10:00:00.000Z",
        limit: 3
      })
    ).resolves.toEqual({ upcomingTotal: 0, upcoming: [], recentTotal: 0, recent: [] });

    await expect(
      reader.listClientServiceWorkBookings({
        ownerUserId: fixture.foreignOwnerUserId,
        clientUserId: fixture.clientUserId,
        now: "2026-08-20T10:00:00.000Z",
        limit: 3
      })
    ).resolves.toEqual({ upcomingTotal: 0, upcoming: [], recentTotal: 0, recent: [] });
  });
});

async function seedBookingSummaryFixture(runtime: PostgresRuntime) {
  const ownerUserId = randomUUID();
  const foreignOwnerUserId = randomUUID();
  const clientUserId = randomUUID();
  const blockedClientUserId = randomUUID();
  const productId = randomUUID();
  const scheduleId = randomUUID();
  const now = new Date("2026-08-20T09:00:00.000Z");
  const upcomingBookingId = randomUUID();
  const recentBookingId = randomUUID();

  await runtime.database.transaction(async (transaction) => {
    await transaction.insert(users).values([
      { id: ownerUserId },
      { id: foreignOwnerUserId },
      { id: clientUserId },
      { id: blockedClientUserId }
    ]);
    await transaction.insert(clientAstrologerRelationships).values([
      relationship({ astrologerUserId: ownerUserId, clientUserId, status: "active" }),
      relationship({ astrologerUserId: ownerUserId, clientUserId: blockedClientUserId, status: "blocked" })
    ]);
    await transaction.insert(products).values({
      id: productId,
      ownerUserId,
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
      ownerUserId,
      name: "CRM service work",
      timeZone: "Europe/Moscow",
      isDefault: true,
      version: 1,
      startIntervalMinutes: 60,
      bookingHorizonDays: 365,
      createdAt: now,
      updatedAt: now
    });
    await insertBooking(transaction, {
      id: upcomingBookingId,
      ownerUserId,
      clientUserId,
      productId,
      scheduleId,
      state: "confirmed",
      serviceStartAt: "2026-08-21T10:00:00.000Z",
      serviceEndAt: "2026-08-21T11:00:00.000Z"
    });
    await insertBooking(transaction, {
      id: recentBookingId,
      ownerUserId,
      clientUserId,
      productId,
      scheduleId,
      state: "completed",
      serviceStartAt: "2026-08-19T10:00:00.000Z",
      serviceEndAt: "2026-08-19T11:00:00.000Z"
    });
    await insertBooking(transaction, {
      id: randomUUID(),
      ownerUserId,
      clientUserId: blockedClientUserId,
      productId,
      scheduleId,
      state: "confirmed",
      serviceStartAt: "2026-08-22T10:00:00.000Z",
      serviceEndAt: "2026-08-22T11:00:00.000Z"
    });
  });

  return { ownerUserId, foreignOwnerUserId, clientUserId, blockedClientUserId, upcomingBookingId, recentBookingId };
}

function relationship(input: {
  readonly astrologerUserId: string;
  readonly clientUserId: string;
  readonly status: "active" | "blocked";
}) {
  const now = new Date("2026-08-20T09:00:00.000Z");
  return {
    id: randomUUID(),
    astrologerUserId: input.astrologerUserId,
    clientUserId: input.clientUserId,
    source: "booking",
    status: input.status,
    firstLinkedAt: now,
    lastLinkedAt: now,
    createdAt: now,
    updatedAt: now
  };
}

async function insertBooking(
  transaction: Parameters<Parameters<PostgresRuntime["database"]["transaction"]>[0]>[0],
  input: {
    readonly id: string;
    readonly ownerUserId: string;
    readonly clientUserId: string;
    readonly productId: string;
    readonly scheduleId: string;
    readonly state: "confirmed" | "completed";
    readonly serviceStartAt: string;
    readonly serviceEndAt: string;
  }
) {
  const reservationId = randomUUID();
  const serviceStartAt = new Date(input.serviceStartAt);
  const serviceEndAt = new Date(input.serviceEndAt);
  await transaction.insert(scheduleReservations).values({
    id: reservationId,
    ownerUserId: input.ownerUserId,
    scheduleId: input.scheduleId,
    kind: "booking",
    lifecycle: "active",
    serviceStartAt,
    serviceEndAt,
    occupiedStartAt: serviceStartAt,
    occupiedEndAt: serviceEndAt,
    sourceAggregateId: input.id,
    createdAt: serviceStartAt,
    updatedAt: serviceStartAt
  });
  await transaction.insert(bookings).values({
    id: input.id,
    ownerUserId: input.ownerUserId,
    clientUserId: input.clientUserId,
    productId: input.productId,
    reservationId,
    source: "manual",
    state: input.state,
    lifecycleRevision: input.state === "confirmed" ? 1 : 2,
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
    updatedAt: serviceStartAt
  });
  await transaction.insert(bookingLifecycleEvents).values({
    id: randomUUID(),
    bookingId: input.id,
    ownerUserId: input.ownerUserId,
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
  });
  if (input.state === "completed") {
    await transaction.insert(bookingLifecycleEvents).values({
      id: randomUUID(),
      bookingId: input.id,
      ownerUserId: input.ownerUserId,
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
    });
  }
}
