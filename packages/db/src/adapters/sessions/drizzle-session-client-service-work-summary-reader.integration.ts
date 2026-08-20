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
  sessionParticipants,
  sessions,
  users
} from "../../schema";
import {
  createClientSubscriptionIntegrationDatabase,
  type ClientSubscriptionIntegrationDatabase
} from "../client-subscriptions/client-subscription-integration-fixture";
import { createDrizzleSessionClientServiceWorkSummaryReader } from "./drizzle-session-client-service-work-summary-reader";

describe.sequential("Drizzle session client service-work summary reader", () => {
  let integration: ClientSubscriptionIntegrationDatabase;
  let runtime: PostgresRuntime;

  beforeAll(async () => {
    integration = await createClientSubscriptionIntegrationDatabase();
    runtime = integration.runtime;
  }, 60_000);

  afterAll(async () => {
    await integration?.close();
  }, 30_000);

  it("returns bounded owner-client sessions without messages, provider rooms, or inactive relationships", async () => {
    const fixture = await seedSessionSummaryFixture(runtime);
    const reader = createDrizzleSessionClientServiceWorkSummaryReader(runtime.database);

    await expect(
      reader.listClientServiceWorkSessions({
        ownerUserId: fixture.ownerUserId,
        clientUserId: fixture.clientUserId,
        now: "2026-08-20T10:00:00.000Z",
        limit: 3
      })
    ).resolves.toEqual({
      upcomingTotal: 1,
      upcoming: [
        {
          id: fixture.upcomingSessionId,
          bookingId: fixture.upcomingBookingId,
          state: "scheduled",
          productTitle: "Video consultation",
          scheduledStartAt: "2026-08-21T10:00:00.000Z",
          scheduledEndAt: "2026-08-21T11:00:00.000Z",
          timeZone: "Europe/Moscow",
          href: `/sessions/${fixture.upcomingSessionId}`
        }
      ],
      recentTotal: 1,
      recent: [
        {
          id: fixture.recentSessionId,
          bookingId: fixture.recentBookingId,
          state: "ended",
          productTitle: "Video consultation",
          scheduledStartAt: "2026-08-19T10:00:00.000Z",
          scheduledEndAt: "2026-08-19T11:00:00.000Z",
          timeZone: "Europe/Moscow",
          href: `/sessions/${fixture.recentSessionId}`
        }
      ]
    });

    const json = JSON.stringify(
      await reader.listClientServiceWorkSessions({
        ownerUserId: fixture.ownerUserId,
        clientUserId: fixture.clientUserId,
        now: "2026-08-20T10:00:00.000Z",
        limit: 3
      })
    );
    expect(json).not.toMatch(/provider|room|participant|message/i);

    await expect(
      reader.listClientServiceWorkSessions({
        ownerUserId: fixture.ownerUserId,
        clientUserId: fixture.archivedClientUserId,
        now: "2026-08-20T10:00:00.000Z",
        limit: 3
      })
    ).resolves.toEqual({ upcomingTotal: 0, upcoming: [], recentTotal: 0, recent: [] });
  });
});

async function seedSessionSummaryFixture(runtime: PostgresRuntime) {
  const ownerUserId = randomUUID();
  const clientUserId = randomUUID();
  const archivedClientUserId = randomUUID();
  const productId = randomUUID();
  const scheduleId = randomUUID();
  const now = new Date("2026-08-20T09:00:00.000Z");
  const upcomingBookingId = randomUUID();
  const recentBookingId = randomUUID();
  const archivedBookingId = randomUUID();
  const upcomingSessionId = randomUUID();
  const recentSessionId = randomUUID();

  await runtime.database.transaction(async (transaction) => {
    await transaction.insert(users).values([
      { id: ownerUserId },
      { id: clientUserId },
      { id: archivedClientUserId }
    ]);
    await transaction.insert(clientAstrologerRelationships).values([
      relationship({ astrologerUserId: ownerUserId, clientUserId, status: "active" }),
      relationship({ astrologerUserId: ownerUserId, clientUserId: archivedClientUserId, status: "archived" })
    ]);
    await transaction.insert(products).values({
      id: productId,
      ownerUserId,
      type: "single",
      status: "active",
      revision: 1,
      title: "Video consultation",
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
      name: "CRM session work",
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
      state: "confirmed",
      serviceStartAt: "2026-08-19T10:00:00.000Z",
      serviceEndAt: "2026-08-19T11:00:00.000Z"
    });
    await insertBooking(transaction, {
      id: archivedBookingId,
      ownerUserId,
      clientUserId: archivedClientUserId,
      productId,
      scheduleId,
      state: "confirmed",
      serviceStartAt: "2026-08-22T10:00:00.000Z",
      serviceEndAt: "2026-08-22T11:00:00.000Z"
    });
    await insertSession(transaction, {
      id: upcomingSessionId,
      bookingId: upcomingBookingId,
      ownerUserId,
      clientUserId,
      state: "scheduled",
      scheduledStartAt: "2026-08-21T10:00:00.000Z",
      scheduledEndAt: "2026-08-21T11:00:00.000Z"
    });
    await insertSession(transaction, {
      id: recentSessionId,
      bookingId: recentBookingId,
      ownerUserId,
      clientUserId,
      state: "ended",
      scheduledStartAt: "2026-08-19T10:00:00.000Z",
      scheduledEndAt: "2026-08-19T11:00:00.000Z"
    });
    await insertSession(transaction, {
      id: randomUUID(),
      bookingId: archivedBookingId,
      ownerUserId,
      clientUserId: archivedClientUserId,
      state: "scheduled",
      scheduledStartAt: "2026-08-22T10:00:00.000Z",
      scheduledEndAt: "2026-08-22T11:00:00.000Z"
    });
  });

  return {
    ownerUserId,
    clientUserId,
    archivedClientUserId,
    upcomingBookingId,
    recentBookingId,
    upcomingSessionId,
    recentSessionId
  };
}

function relationship(input: {
  readonly astrologerUserId: string;
  readonly clientUserId: string;
  readonly status: "active" | "archived";
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
    productTitleSnapshot: "Video consultation",
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

async function insertSession(
  transaction: Parameters<Parameters<PostgresRuntime["database"]["transaction"]>[0]>[0],
  input: {
    readonly id: string;
    readonly bookingId: string;
    readonly ownerUserId: string;
    readonly clientUserId: string;
    readonly state: "scheduled" | "ended";
    readonly scheduledStartAt: string;
    readonly scheduledEndAt: string;
  }
) {
  const scheduledStartAt = new Date(input.scheduledStartAt);
  const scheduledEndAt = new Date(input.scheduledEndAt);
  const endedAt = input.state === "ended" ? scheduledEndAt : null;
  await transaction.insert(sessions).values({
    id: input.id,
    bookingId: input.bookingId,
    ownerUserId: input.ownerUserId,
    clientUserId: input.clientUserId,
    state: input.state,
    lifecycleRevision: 1,
    scheduledStartAt,
    scheduledEndAt,
    timeZoneSnapshot: "Europe/Moscow",
    productTitleSnapshot: "Video consultation",
    provider: "livekit",
    providerRoomName: `crm-${input.id}`,
    startedAt: input.state === "ended" ? scheduledStartAt : null,
    endedAt,
    endReason: input.state === "ended" ? "astrologer_ended" : null,
    createdAt: scheduledStartAt,
    updatedAt: scheduledStartAt
  });
  await transaction.insert(sessionParticipants).values([
    {
      sessionId: input.id,
      userId: input.ownerUserId,
      role: "astrologer",
      displayNameSnapshot: "Astrologer",
      createdAt: scheduledStartAt,
      updatedAt: scheduledStartAt,
      presenceUpdatedAt: scheduledStartAt
    },
    {
      sessionId: input.id,
      userId: input.clientUserId,
      role: "client",
      displayNameSnapshot: "Client",
      createdAt: scheduledStartAt,
      updatedAt: scheduledStartAt,
      presenceUpdatedAt: scheduledStartAt
    }
  ]);
}
