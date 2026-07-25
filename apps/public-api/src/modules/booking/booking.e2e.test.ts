import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import type {
  AuthSessionAuthenticationStore,
  AvailabilityStore,
  Booking,
  BookingClientReader,
  BookingCommandStore,
  BookingProductReader
} from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemClock } from "../../common/system-clock.js";
import { PublicSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import { AUTH_SESSION_AUTHENTICATION_STORE } from "../identity/auth/identity-auth.tokens";
import { IdentityCurrentSessionService } from "../identity/session/identity-current-session.service";
import { PublicCsrfTokenService } from "../security/csrf/public-csrf-token.service";
import { CsrfGuard } from "../security/csrf/csrf.guard";
import { IdempotencyGuard } from "../security/idempotency/idempotency.guard";
import { BookingController } from "./booking.controller";
import { BookingService } from "./booking.service";
import {
  PUBLIC_BOOKING_AVAILABILITY_STORE,
  PUBLIC_BOOKING_CLIENT_READER,
  PUBLIC_BOOKING_COMMAND_STORE,
  PUBLIC_BOOKING_PRODUCT_READER
} from "./booking.tokens";

const now = new Date("2026-07-24T10:00:00.000Z");
const sessionCookieName = "elevenhouse_public_session";
const csrfCookieName = "elevenhouse_public_csrf";
const csrfHeaderName = "x-csrf-token";
const sessionToken = "public-session-token";
const clientUserId = "11111111-1111-4111-8111-111111111111";
const astrologerUserId = "22222222-2222-4222-8222-222222222222";
const productId = "33333333-3333-4333-8333-333333333333";
const bookingId = "44444444-4444-4444-8444-444444444444";

let app: INestApplication;
let moduleRef: TestingModule;
let baseUrl: string;
let csrfToken: string;
let commandStore: BookingCommandStore;

describe("public paid booking hold HTTP flow", () => {
  beforeEach(async () => {
    commandStore = createBookingStore();
    moduleRef = await Test.createTestingModule({
      controllers: [BookingController],
      providers: [
        BookingService,
        PublicSessionAuthGuard,
        IdentityCurrentSessionService,
        CsrfGuard,
        IdempotencyGuard,
        PublicCsrfTokenService,
        { provide: SystemClock, useValue: { now: vi.fn(() => now) } },
        { provide: ConfigService, useValue: createConfigServiceStub() },
        { provide: AUTH_SESSION_AUTHENTICATION_STORE, useValue: createAuthStore() },
        { provide: PUBLIC_BOOKING_COMMAND_STORE, useValue: commandStore },
        { provide: PUBLIC_BOOKING_AVAILABILITY_STORE, useValue: createAvailabilityStore() },
        { provide: PUBLIC_BOOKING_CLIENT_READER, useValue: createClientReader() },
        { provide: PUBLIC_BOOKING_PRODUCT_READER, useValue: createProductReader() }
      ]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
    csrfToken = createCsrfToken(moduleRef.get(PublicCsrfTokenService));
  });

  afterEach(async () => {
    await app.close();
    await moduleRef.close();
  });

  it("requires authentication, CSRF and Idempotency-Key before holding a paid booking slot", async () => {
    const body = {
      astrologerUserId,
      productId,
      directLinkIntentId: null,
      deliveryFormat: "video",
      projectedStartAt: "2026-07-31T07:00:00.000Z"
    };

    await expect(postJson("/booking/intent", body)).resolves.toMatchObject({ status: 401 });
    await expect(
      postJson("/booking/intent", body, authCookie(), {
        "idempotency-key": "booking-hold:e2e-1"
      })
    ).resolves.toMatchObject({ status: 403 });
    await expect(
      postJson("/booking/intent", body, authenticatedCookies(), { [csrfHeaderName]: csrfToken })
    ).resolves.toMatchObject({ status: 400 });

    const response = await postJson("/booking/intent", body, authenticatedCookies(), {
      origin: "http://localhost:3000",
      [csrfHeaderName]: csrfToken,
      "idempotency-key": "booking-hold:e2e-1"
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      booking: {
        id: bookingId,
        clientUserId,
        productId,
        source: "client_paid",
        state: "hold",
        holdExpiresAt: "2026-07-24T10:15:00Z"
      },
      replayed: false
    });
    expect(commandStore.executePaidHold).toHaveBeenCalledTimes(1);
  });
});

async function postJson(
  path: string,
  body: unknown,
  cookie?: string,
  headers: Record<string, string> = {}
): Promise<{ readonly status: number; readonly body: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...headers
    },
    body: JSON.stringify(body)
  });

  return { status: response.status, body: await response.json() };
}

function authenticatedCookies(): string {
  return `${authCookie()}; ${csrfCookieName}=${csrfToken}`;
}

function authCookie(): string {
  return `${sessionCookieName}=${sessionToken}`;
}

function createCsrfToken(service: PublicCsrfTokenService): string {
  let token = "";
  service.setCsrfCookie({
    response: {
      cookie: (_name, value) => {
        token = value;
      }
    },
    sessionToken,
    sessionExpiresAt: "2026-07-25T10:00:00.000Z",
    now
  });
  return token;
}

function createAuthStore(): AuthSessionAuthenticationStore {
  return {
    findByTokenHash: vi.fn(async (tokenHash: string) => ({
      session: {
        id: "77777777-7777-4777-8777-777777777777",
        userId: clientUserId,
        tokenHash,
        status: "active" as const,
        createdAt: now.toISOString(),
        expiresAt: "2026-07-25T10:00:00.000Z"
      },
      user: {
        id: clientUserId,
        status: "active" as const,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      },
      roleAssignments: [
        {
          id: "88888888-8888-4888-8888-888888888888",
          userId: clientUserId,
          role: "client" as const,
          assignedAt: now.toISOString()
        }
      ]
    }))
  };
}

function createBookingStore(): BookingCommandStore {
  return {
    executeManualBooking: vi.fn(),
    executePaidHold: vi.fn(async (_command, createClaim) => {
      const claim = await createClaim();
      return {
        kind: "created" as const,
        booking: {
          id: bookingId,
          reservationId: "99999999-9999-4999-8999-999999999999",
          ownerUserId: claim.ownerUserId,
          clientUserId: claim.clientUserId,
          productId: claim.productId,
          source: "client_paid",
          state: "hold",
          holdExpiresAt: claim.holdExpiresAt,
          startAt: claim.serviceStartAt,
          endAt: claim.serviceEndAt,
          productTitle: claim.productSnapshot.title,
          durationMinutes: claim.productSnapshot.durationMinutes,
          deliveryFormat: claim.productSnapshot.deliveryFormat,
          priceMinor: claim.productSnapshot.priceMinor,
          currency: claim.productSnapshot.currency,
          timeZone: claim.scheduleSnapshot.timeZone,
          policySnapshot: claim.scheduleSnapshot.policy,
          createdAt: _command.now,
          updatedAt: _command.now
        } satisfies Booking
      };
    }),
    confirmPaidBooking: vi.fn(async () => null),
    releasePaidBookingPaymentHold: vi.fn(async () => null),
    findByOwnerAndId: vi.fn(async () => null)
  };
}

function createAvailabilityStore(): AvailabilityStore {
  return {
    findDefaultByOwner: vi.fn(async () => ({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      ownerUserId: astrologerUserId,
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
      weeklyPeriods: [{ weekday: 5 as const, startMinute: 600, endMinute: 720 }],
      dateOverrides: [],
      productIds: [productId],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    })),
    putDefault: vi.fn(),
    replace: vi.fn(),
    readProjectionContext: vi.fn(async ({ ownerUserId }) => ({
      schedule: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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
        weeklyPeriods: [{ weekday: 5 as const, startMinute: 600, endMinute: 720 }],
        dateOverrides: [],
        productIds: [productId],
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      },
      activeReservations: [],
      confirmedBookingCountByLocalDate: {}
    }))
  };
}

function createClientReader(): BookingClientReader {
  return { hasActiveRelationship: vi.fn(async () => true) };
}

function createProductReader(): BookingProductReader {
  return {
    findByOwnerAndId: vi.fn(async () => ({
      id: productId,
      title: "Natal reading",
      status: "active" as const,
      executionMode: "live" as const,
      participantMode: "solo" as const,
      durationMinutes: 60,
      deliveryFormats: ["video" as const],
      priceMinor: 500_00,
      currency: "RUB" as const
    }))
  };
}

function createConfigServiceStub(): Pick<ConfigService, "get" | "getOrThrow"> {
  return {
    get: vi.fn(() => undefined),
    getOrThrow: vi.fn((key: string) => {
      if (key === "publicApi.sessionCookieName") return sessionCookieName;
      if (key === "publicApi.csrfSecret") return "test-csrf-secret-with-enough-entropy";
      if (key === "publicApi.csrfCookieName") return csrfCookieName;
      if (key === "publicApi.csrfHeaderName") return csrfHeaderName;
      if (key === "publicApi.csrfTokenTtlSeconds") return 604800;
      if (key === "publicApi.sessionCookieSecure") return false;
      if (key === "publicApi.allowedOrigins") return ["http://localhost:3000"];
      throw new Error(`Unexpected config key: ${key}`);
    })
  };
}
