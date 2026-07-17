import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { hashSessionToken } from "@elevenhouse/auth";
import {
  availableBookingSlotsResponseSchema,
  bookingResponseSchema,
  manualBookingResponseSchema
} from "@elevenhouse/contracts";
import {
  IdempotencyKeyReuseError,
  SlotNoLongerAvailableError,
  type AuthSessionAuthenticationStore,
  type AuthSessionRevocationUnitOfWork,
  type AvailabilitySchedule,
  type AvailabilityStore,
  type Booking,
  type BookingClientReader,
  type BookingCommandStore,
  type BookingProductReader,
  type PasswordlessAuthUnitOfWork,
  type PasswordlessCustomerAccountRegistrationSessionUnitOfWork
} from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvailabilityModule } from "../availability/availability.module";
import { AVAILABILITY_STORE } from "../availability/availability.tokens";
import { SystemClock } from "../clock/system-clock.service";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import {
  AUTH_SESSION_AUTHENTICATION_STORE,
  AUTH_SESSION_REVOCATION_UNIT_OF_WORK
} from "../identity/auth/identity-auth.tokens";
import { IdentityModule } from "../identity/identity.module";
import { ASTROLOGER_AUTH_CODE_GENERATOR } from "../identity/passwordless/identity-passwordless.handler";
import {
  PASSWORDLESS_AUTH_UNIT_OF_WORK,
  PASSWORDLESS_RATE_LIMITER
} from "../identity/passwordless/identity-passwordless.tokens";
import { ASTROLOGER_REGISTRATION_SESSION_UNIT_OF_WORK } from "../identity/registration/identity-registration.tokens";
import { createIdentityConfigServiceStub } from "../identity/testing/identity-config-service.stub";
import { TestPasswordlessRateLimiter } from "../identity/testing/test-passwordless-rate-limiter";
import { RedisRuntimeService } from "../redis/redis-runtime.service";
import { AstrologerCsrfTokenService } from "../security/csrf/astrologer-csrf-token.service";
import { BookingsModule } from "./bookings.module";
import {
  BOOKING_CLIENT_READER,
  BOOKING_COMMAND_STORE,
  BOOKING_PRODUCT_READER
} from "./bookings.tokens";

const now = new Date("2026-07-17T09:00:00.000Z");
const sessionCookieName = "elevenhouse_astrologer_session";
const csrfCookieName = "elevenhouse_astrologer_csrf";
const csrfHeaderName = "x-csrf-token";
const sessionToken = "booking-session-token";
const secondSessionToken = "second-booking-session-token";
const ownerUserId = "22222222-2222-4222-8222-222222222222";
const secondOwnerUserId = "99999999-9999-4999-8999-999999999999";
const clientUserId = "11111111-1111-4111-8111-111111111111";
const inactiveClientUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const productId = "33333333-3333-4333-8333-333333333333";
const inactiveProductId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const bookingId = "44444444-4444-4444-8444-444444444444";
const scheduleId = "55555555-5555-4555-8555-555555555555";
const limits = {
  requestCodeIdentifier: { limit: 5, windowSeconds: 3600 },
  requestCodeIp: { limit: 30, windowSeconds: 3600 },
  requestCodeIdentifierIp: { limit: 3, windowSeconds: 900 },
  verifyChallenge: { limit: 5, windowSeconds: 900 },
  verifyIp: { limit: 60, windowSeconds: 900 }
};
let primaryCsrf = "";
let secondaryCsrf = "";

describe("booking HTTP routes", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let baseUrl: string;
  let commandStore: BookingCommandStore;

  beforeEach(async () => {
    commandStore = createCommandStore();
    const passwordlessAuth: PasswordlessAuthUnitOfWork = {
      transact: async () => raise("Unexpected passwordless auth call")
    };
    const revocation: AuthSessionRevocationUnitOfWork = {
      transact: async () => raise("Unexpected revocation call")
    };
    const registration: PasswordlessCustomerAccountRegistrationSessionUnitOfWork = {
      transact: async () => raise("Unexpected registration call")
    };
    moduleRef = await Test.createTestingModule({
      imports: [IdentityModule, AvailabilityModule, BookingsModule]
    })
      .overrideProvider(PostgresRuntimeService)
      .useValue({ database: {} })
      .overrideProvider(ConfigService)
      .useValue(
        createIdentityConfigServiceStub({
          sessionCookieName,
          csrfCookieName,
          csrfHeaderName,
          passwordlessRateLimits: limits
        })
      )
      .overrideProvider(PASSWORDLESS_AUTH_UNIT_OF_WORK)
      .useValue(passwordlessAuth)
      .overrideProvider(AUTH_SESSION_AUTHENTICATION_STORE)
      .useValue(createAuthStore())
      .overrideProvider(AUTH_SESSION_REVOCATION_UNIT_OF_WORK)
      .useValue(revocation)
      .overrideProvider(ASTROLOGER_REGISTRATION_SESSION_UNIT_OF_WORK)
      .useValue(registration)
      .overrideProvider(PASSWORDLESS_RATE_LIMITER)
      .useValue(new TestPasswordlessRateLimiter(limits, () => now))
      .overrideProvider(RedisRuntimeService)
      .useValue({ eval: vi.fn(async () => 0), quit: vi.fn(async () => undefined) })
      .overrideProvider(ASTROLOGER_AUTH_CODE_GENERATOR)
      .useValue({ generateCode: vi.fn(() => "123456") })
      .overrideProvider(SystemClock)
      .useValue({ now: vi.fn(() => now) })
      .overrideProvider(AVAILABILITY_STORE)
      .useValue(createAvailabilityStore())
      .overrideProvider(BOOKING_COMMAND_STORE)
      .useValue(commandStore)
      .overrideProvider(BOOKING_CLIENT_READER)
      .useValue({
        hasActiveRelationship: vi.fn(async ({ clientUserId: candidate }) =>
          candidate === clientUserId
        )
      } satisfies BookingClientReader)
      .overrideProvider(BOOKING_PRODUCT_READER)
      .useValue(createProductReader())
      .compile();

    const csrf = moduleRef.get(AstrologerCsrfTokenService);
    primaryCsrf = createCsrf(csrf, sessionToken);
    secondaryCsrf = createCsrf(csrf, secondSessionToken);
    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterEach(async () => {
    await app?.close();
    await moduleRef?.close();
  });

  it("enforces auth, CSRF and a valid idempotency header", async () => {
    const unauthenticated = await send("POST", "/bookings/manual", validBody());
    const missingCsrf = await send("POST", "/bookings/manual", validBody(), {
      ...auth(),
      "idempotency-key": "booking-create:missing-csrf"
    });
    const missingKey = await send("POST", "/bookings/manual", validBody(), csrfAuth());
    const invalidKey = await send("POST", "/bookings/manual", validBody(), {
      ...csrfAuth(),
      "idempotency-key": "short"
    });
    expect(unauthenticated.status).toBe(401);
    expect(missingCsrf.status).toBe(403);
    expect(missingKey.status).toBe(400);
    expect(invalidKey.status).toBe(400);
  });

  it("creates, replays and rejects changed requests or occupied slots", async () => {
    const headers = { ...csrfAuth(), "idempotency-key": "booking-create:request-1" };
    const created = await send("POST", "/bookings/manual", validBody(), headers);
    const replayed = await send("POST", "/bookings/manual", validBody(), headers);
    const changed = await send(
      "POST",
      "/bookings/manual",
      { ...validBody(), deliveryFormat: "audio" },
      headers
    );
    const overlap = await send("POST", "/bookings/manual", validBody(), {
      ...csrfAuth(),
      "idempotency-key": "booking-overlap:request-1"
    });
    expect(created.status).toBe(201);
    manualBookingResponseSchema.parse(created.body);
    expect(created.body).toMatchObject({ replayed: false });
    expect(replayed.body).toMatchObject({ replayed: true });
    expect(changed).toMatchObject({
      status: 409,
      body: { code: "idempotency_key_reused_with_different_request" }
    });
    expect(overlap).toMatchObject({
      status: 409,
      body: { code: "slot_no_longer_available" }
    });
  });

  it("rejects inactive client and product relationships", async () => {
    const headers = { ...csrfAuth(), "idempotency-key": "booking-create:validation-1" };
    const client = await send(
      "POST",
      "/bookings/manual",
      { ...validBody(), clientUserId: inactiveClientUserId },
      headers
    );
    const product = await send(
      "POST",
      "/bookings/manual",
      { ...validBody(), productId: inactiveProductId },
      { ...headers, "idempotency-key": "booking-create:validation-2" }
    );
    expect(client).toMatchObject({
      status: 422,
      body: { code: "client_relationship_not_active" }
    });
    expect(product).toMatchObject({ status: 422, body: { code: "product_not_bookable" } });
  });

  it("returns a safe owner-scoped booking detail", async () => {
    const found = await send("GET", `/bookings/${bookingId}`, undefined, auth());
    const hidden = await send(
      "GET",
      `/bookings/${bookingId}`,
      undefined,
      auth(secondSessionToken)
    );
    const malformed = await send("GET", "/bookings/not-a-uuid", undefined, auth());
    expect(found.status).toBe(200);
    bookingResponseSchema.parse(found.body);
    expect(found.body.booking).not.toHaveProperty("ownerUserId");
    expect(hidden.status).toBe(404);
    expect(malformed.status).toBe(400);
  });

  it("returns authenticated, owner-scoped available slots without CSRF", async () => {
    const query = new URLSearchParams({
      productId,
      start: "2026-07-20T00:00:00.000Z",
      end: "2026-07-21T00:00:00.000Z"
    });
    const found = await send("GET", `/bookings/available-slots?${query}`, undefined, auth());
    const hidden = await send(
      "GET",
      `/bookings/available-slots?${query}`,
      undefined,
      auth(secondSessionToken)
    );
    const malformed = await send(
      "GET",
      `/bookings/available-slots?productId=${productId}&start=nope&end=also-nope`,
      undefined,
      auth()
    );

    expect(found.status).toBe(200);
    availableBookingSlotsResponseSchema.parse(found.body);
    expect(found.body).toMatchObject({ productId, timeZone: "Europe/Moscow" });
    expect(hidden).toMatchObject({ status: 404, body: { code: "schedule_not_found" } });
    expect(malformed).toMatchObject({ status: 400, body: { code: "invalid_request" } });
  });

  async function send(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {}
  ) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }
});

function validBody() {
  return {
    clientUserId,
    productId,
    deliveryFormat: "video",
    projectedStartAt: "2026-07-20T07:00:00.000Z"
  };
}

function auth(token = sessionToken) {
  return { cookie: `${sessionCookieName}=${token}` };
}

function csrfAuth(token = sessionToken) {
  const csrf = token === secondSessionToken ? secondaryCsrf : primaryCsrf;
  return {
    cookie: `${sessionCookieName}=${token}; ${csrfCookieName}=${csrf}`,
    origin: "http://localhost:3000",
    [csrfHeaderName]: csrf
  };
}

function createCsrf(service: AstrologerCsrfTokenService, token: string): string {
  return service.setCsrfCookie({
    response: { cookie: vi.fn() },
    sessionToken: token,
    sessionExpiresAt: "2026-07-19T00:00:00.000Z",
    now
  });
}

function createAvailabilityStore(): AvailabilityStore {
  const schedule: AvailabilitySchedule = {
    id: scheduleId,
    ownerUserId,
    name: "Default",
    timeZone: "Europe/Moscow",
    isDefault: true,
    version: 1,
    startIntervalMinutes: 30,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    minimumNoticeMinutes: 0,
    bookingHorizonDays: 60,
    maximumBookingsPerDay: null,
    weeklyPeriods: [{ weekday: 1, startMinute: 600, endMinute: 720 }],
    dateOverrides: [],
    productIds: [productId, inactiveProductId],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  return {
    findDefaultByOwner: vi.fn(async ({ ownerUserId: candidate }) =>
      candidate === ownerUserId ? schedule : null
    ),
    putDefault: vi.fn(async () => ({ kind: "created" as const, schedule })),
    replace: vi.fn(async () => ({ kind: "updated" as const, schedule })),
    readProjectionContext: vi.fn(async ({ ownerUserId: candidate }) =>
      candidate === ownerUserId
        ? { schedule, activeReservations: [], confirmedBookingCountByLocalDate: {} }
        : null
    )
  };
}

function createProductReader(): BookingProductReader {
  return {
    findByOwnerAndId: vi.fn(async ({ ownerUserId: candidateOwner, productId: candidate }) => {
      if (candidateOwner !== ownerUserId || candidate === inactiveProductId) return null;
      return {
        id: productId,
        title: "Натальный разбор",
        status: "active",
        executionMode: "live",
        participantMode: "solo",
        durationMinutes: 60,
        deliveryFormats: ["video", "audio"],
        priceMinor: 490000,
        currency: "RUB"
      } as const;
    })
  };
}

function createCommandStore(): BookingCommandStore {
  const booking = createBooking();
  let saved: { key: string; hash: string } | null = null;
  return {
    executeManualBooking: vi.fn(async (command, createClaim) => {
      if (command.key === "booking-overlap:request-1") throw new SlotNoLongerAvailableError();
      const current = saved;
      if (current !== null && current.key === command.key) {
        if (current.hash !== command.requestHash) throw new IdempotencyKeyReuseError();
        return { kind: "replayed" as const, booking };
      }
      await createClaim();
      saved = { key: command.key, hash: command.requestHash };
      return { kind: "created" as const, booking };
    }),
    findByOwnerAndId: vi.fn(async ({ ownerUserId: candidateOwner, bookingId: candidate }) =>
      candidateOwner === ownerUserId && candidate === bookingId ? booking : null
    )
  };
}

function createBooking(): Booking {
  return {
    id: bookingId,
    reservationId: "66666666-6666-4666-8666-666666666666",
    ownerUserId,
    clientUserId,
    productId,
    state: "confirmed",
    startAt: "2026-07-20T07:00:00.000Z",
    endAt: "2026-07-20T08:00:00.000Z",
    productTitle: "Натальный разбор",
    durationMinutes: 60,
    deliveryFormat: "video",
    priceMinor: 490000,
    currency: "RUB",
    timeZone: "Europe/Moscow",
    policySnapshot: { bufferBeforeMinutes: 0, bufferAfterMinutes: 0, minimumNoticeMinutes: 0 },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function createAuthStore(): AuthSessionAuthenticationStore {
  return {
    findByTokenHash: vi.fn(async (candidateHash) => {
      const token = [sessionToken, secondSessionToken].find(
        (candidate) => hashSessionToken(candidate) === candidateHash
      );
      if (!token) return null;
      const userId = token === sessionToken ? ownerUserId : secondOwnerUserId;
      return {
        session: {
          id: token === sessionToken ? "77777777-7777-4777-8777-777777777777" : "88888888-8888-4888-8888-888888888888",
          userId,
          tokenHash: candidateHash,
          status: "active" as const,
          createdAt: now.toISOString(),
          expiresAt: "2026-07-19T00:00:00.000Z"
        },
        user: { id: userId, status: "active" as const, createdAt: now.toISOString(), updatedAt: now.toISOString() },
        roleAssignments: [{ id: token === sessionToken ? "99999999-9999-4999-8999-999999999998" : "99999999-9999-4999-8999-999999999997", userId, role: "astrologer" as const, assignedAt: now.toISOString() }]
      };
    })
  };
}

function raise(message: string): never {
  throw new Error(message);
}
