import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { hashSessionToken } from "@elevenhouse/auth";
import {
  availabilityScheduleResponseSchema,
  calendarRangeResponseSchema,
  manualBlockResponseSchema
} from "@elevenhouse/contracts";
import {
  IdempotencyKeyReuseError,
  ManualCalendarBlockConflictError,
  type AuthSessionAuthenticationStore,
  type AuthSessionRevocationUnitOfWork,
  type AvailabilitySchedule,
  type AvailabilityStore,
  type CalendarReadStore,
  type ManualCalendarBlock,
  type ManualCalendarBlockCommandStore,
  type PasswordlessAuthUnitOfWork,
  type PasswordlessCustomerAccountRegistrationSessionUnitOfWork
} from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AVAILABILITY_PRODUCT_READER, AVAILABILITY_STORE } from "../availability/availability.tokens";
import { AvailabilityModule } from "../availability/availability.module";
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
import { CalendarModule } from "./calendar.module";
import { CALENDAR_READ_STORE, MANUAL_BLOCK_COMMAND_STORE } from "./calendar.tokens";

const now = new Date("2026-07-17T09:00:00.000Z");
const sessionCookieName = "elevenhouse_astrologer_session";
const csrfCookieName = "elevenhouse_astrologer_csrf";
const csrfHeaderName = "x-csrf-token";
const sessionToken = "calendar-session-token";
const secondSessionToken = "second-calendar-session-token";
const ownerUserId = "22222222-2222-4222-8222-222222222222";
const secondOwnerUserId = "99999999-9999-4999-8999-999999999999";
const productId = "11111111-1111-4111-8111-111111111111";
const scheduleId = "33333333-3333-4333-8333-333333333333";
const blockId = "44444444-4444-4444-8444-444444444444";
const reservationId = "55555555-5555-4555-8555-555555555555";
const limits = {
  requestCodeIdentifier: { limit: 5, windowSeconds: 3600 },
  requestCodeIp: { limit: 30, windowSeconds: 3600 },
  requestCodeIdentifierIp: { limit: 3, windowSeconds: 3600 },
  verifyChallenge: { limit: 5, windowSeconds: 900 },
  verifyIp: { limit: 60, windowSeconds: 900 }
};

describe("availability and calendar HTTP routes", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let baseUrl: string;
  let secondCsrfToken: string;
  let schedule: AvailabilitySchedule | null;
  let block: ManualCalendarBlock;
  let availabilityStore: AvailabilityStore;
  let commandStore: ManualCalendarBlockCommandStore;

  beforeEach(async () => {
    schedule = createSchedule();
    block = createBlock();
    availabilityStore = createAvailabilityStore(() => schedule, (next) => (schedule = next));
    commandStore = createCommandStore(() => block, (next) => (block = next));
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
      imports: [IdentityModule, AvailabilityModule, CalendarModule]
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
      .useValue(availabilityStore)
      .overrideProvider(AVAILABILITY_PRODUCT_READER)
      .useValue({ findBookableProductIds: vi.fn(async () => [productId]) })
      .overrideProvider(CALENDAR_READ_STORE)
      .useValue(createReadStore())
      .overrideProvider(MANUAL_BLOCK_COMMAND_STORE)
      .useValue(commandStore)
      .compile();

    const csrf = moduleRef.get(AstrologerCsrfTokenService);
    createCsrfToken(csrf, sessionToken);
    secondCsrfToken = createCsrfToken(csrf, secondSessionToken);
    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterEach(async () => {
    await app?.close();
    await moduleRef?.close();
  });

  it("enforces auth and exposes a side-effect-free owner-scoped default schedule", async () => {
    const unauthenticated = await requestJson("GET", "/availability/schedules/default");
    const found = await requestJson("GET", "/availability/schedules/default", undefined, auth());
    const hidden = await requestJson(
      "GET",
      "/availability/schedules/default",
      undefined,
      auth(secondSessionToken)
    );

    expect(unauthenticated.status).toBe(401);
    expect(found.status).toBe(200);
    availabilityScheduleResponseSchema.parse(found.body);
    expect(hidden).toMatchObject({ status: 404, body: { code: "schedule_not_found" } });
    expect(availabilityStore.putDefault).not.toHaveBeenCalled();
  });

  it("requires CSRF and supports create plus optimistic update conflicts", async () => {
    schedule = null;
    const missingCsrf = await requestJson("PUT", "/availability/schedules/default", scheduleBody(null), auth());
    const created = await requestJson(
      "PUT",
      "/availability/schedules/default",
      scheduleBody(null),
      csrfAuth()
    );
    const conflict = await requestJson(
      "PUT",
      "/availability/schedules/default",
      scheduleBody(7),
      csrfAuth()
    );

    expect(missingCsrf.status).toBe(403);
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ schedule: { version: 1 } });
    expect(conflict).toMatchObject({
      status: 409,
      body: { code: "availability_version_conflict", currentVersion: 1 }
    });
  });

  it("validates bounded IANA ranges and omits finance from owner-scoped summaries", async () => {
    const missingRange = await requestJson("GET", "/calendar/range", undefined, auth());
    const invalidZone = await requestJson(
      "GET",
      "/calendar/range?start=2026-07-20T00%3A00%3A00Z&end=2026-07-21T00%3A00%3A00Z&timeZone=UTC%2B3",
      undefined,
      auth()
    );
    const tooWide = await requestJson(
      "GET",
      "/calendar/range?start=2026-01-01T00%3A00%3A00Z&end=2026-05-01T00%3A00%3A00Z&timeZone=Europe%2FMoscow",
      undefined,
      auth()
    );
    const range = await requestJson(
      "GET",
      "/calendar/range?start=2026-07-20T00%3A00%3A00Z&end=2026-07-21T00%3A00%3A00Z&timeZone=Europe%2FMoscow",
      undefined,
      auth()
    );
    const hidden = await requestJson(
      "GET",
      "/calendar/range?start=2026-07-20T00%3A00%3A00Z&end=2026-07-21T00%3A00%3A00Z&timeZone=Europe%2FMoscow",
      undefined,
      auth(secondSessionToken)
    );

    expect(missingRange.status).toBe(400);
    expect(invalidZone.status).toBe(400);
    expect(tooWide.status).toBe(400);
    expect(range.status).toBe(200);
    calendarRangeResponseSchema.parse(range.body);
    expect(range.body.summary).not.toHaveProperty("revenue");
    expect(hidden.status).toBe(404);
  });

  it("requires CSRF and idempotency for block creation, then releases only owned blocks", async () => {
    const body = { title: "Отпуск", startAt: block.startAt, endAt: block.endAt };
    const missingCsrf = await requestJson("POST", "/calendar/blocks", body, auth());
    const missingKey = await requestJson("POST", "/calendar/blocks", body, csrfAuth());
    const created = await requestJson(
      "POST",
      "/calendar/blocks",
      body,
      { ...csrfAuth(), "idempotency-key": "calendar-block:request-1" }
    );
    const replayed = await requestJson(
      "POST",
      "/calendar/blocks",
      body,
      { ...csrfAuth(), "idempotency-key": "calendar-block:request-1" }
    );
    const changedRequest = await requestJson(
      "POST",
      "/calendar/blocks",
      { ...body, title: "Другое событие" },
      { ...csrfAuth(), "idempotency-key": "calendar-block:request-1" }
    );
    const overlap = await requestJson(
      "POST",
      "/calendar/blocks",
      { ...body, title: "CONFLICT" },
      { ...csrfAuth(), "idempotency-key": "calendar-block:request-2" }
    );
    const hiddenRelease = await requestJson(
      "DELETE",
      `/calendar/blocks/${blockId}`,
      undefined,
      csrfAuth(secondSessionToken, secondCsrfToken)
    );
    const malformedRelease = await requestJson(
      "DELETE",
      "/calendar/blocks/not-a-uuid",
      undefined,
      csrfAuth()
    );
    const released = await requestJson(
      "DELETE",
      `/calendar/blocks/${blockId}`,
      undefined,
      csrfAuth()
    );
    const releasedAgain = await requestJson(
      "DELETE",
      `/calendar/blocks/${blockId}`,
      undefined,
      csrfAuth()
    );

    expect(missingCsrf.status).toBe(403);
    expect(missingKey.status).toBe(400);
    expect(created.status).toBe(201);
    manualBlockResponseSchema.parse(created.body);
    expect(created.body).toMatchObject({ replayed: false });
    expect(replayed.body).toMatchObject({ replayed: true });
    expect(changedRequest).toMatchObject({
      status: 409,
      body: { code: "idempotency_key_reused_with_different_request" }
    });
    expect(overlap).toMatchObject({
      status: 409,
      body: { code: "slot_no_longer_available" }
    });
    expect(hiddenRelease.status).toBe(404);
    expect(malformedRelease.status).toBe(400);
    expect(released).toMatchObject({ status: 200, body: { block: { state: "released" } } });
    expect(releasedAgain).toMatchObject({ status: 200, body: { block: { state: "released" } } });
  });

  async function requestJson(
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

function auth(token = sessionToken): Record<string, string> {
  return { cookie: `${sessionCookieName}=${token}` };
}

function csrfAuth(token = sessionToken, csrf = csrfTokenFor(token)): Record<string, string> {
  return {
    cookie: `${sessionCookieName}=${token}; ${csrfCookieName}=${csrf}`,
    origin: "http://localhost:3000",
    [csrfHeaderName]: csrf
  };
}

let primaryCsrfToken = "";
let secondaryCsrfToken = "";
function csrfTokenFor(token: string): string {
  return token === secondSessionToken ? secondaryCsrfToken : primaryCsrfToken;
}

function createCsrfToken(service: AstrologerCsrfTokenService, token: string): string {
  const value = service.setCsrfCookie({
    response: { cookie: vi.fn() },
    sessionToken: token,
    sessionExpiresAt: "2026-07-19T00:00:00.000Z",
    now
  });
  if (token === secondSessionToken) secondaryCsrfToken = value;
  else primaryCsrfToken = value;
  return value;
}

function createSchedule(): AvailabilitySchedule {
  return {
    id: scheduleId,
    ownerUserId,
    name: "Default",
    timeZone: "Europe/Moscow",
    isDefault: true,
    version: 1,
    startIntervalMinutes: 30,
    bufferBeforeMinutes: 10,
    bufferAfterMinutes: 10,
    minimumNoticeMinutes: 360,
    bookingHorizonDays: 60,
    maximumBookingsPerDay: 5,
    weeklyPeriods: [{ weekday: 1, startMinute: 600, endMinute: 720 }],
    dateOverrides: [],
    productIds: [productId],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function scheduleBody(expectedVersion: number | null) {
  const value = createSchedule();
  return {
    expectedVersion,
    timeZone: value.timeZone,
    startIntervalMinutes: value.startIntervalMinutes,
    bufferBeforeMinutes: value.bufferBeforeMinutes,
    bufferAfterMinutes: value.bufferAfterMinutes,
    minimumNoticeMinutes: value.minimumNoticeMinutes,
    bookingHorizonDays: value.bookingHorizonDays,
    maximumBookingsPerDay: value.maximumBookingsPerDay,
    weeklyPeriods: value.weeklyPeriods,
    dateOverrides: value.dateOverrides,
    productIds: value.productIds
  };
}

function createAvailabilityStore(
  getSchedule: () => AvailabilitySchedule | null,
  setSchedule: (schedule: AvailabilitySchedule) => void
): AvailabilityStore {
  return {
    findDefaultByOwner: vi.fn(async ({ ownerUserId: candidate }) =>
      candidate === ownerUserId ? getSchedule() : null
    ),
    putDefault: vi.fn(async (input) => {
      const current = getSchedule();
      if (input.expectedVersion === null && current) {
        return { kind: "version_conflict" as const, currentVersion: current.version };
      }
      if (input.expectedVersion !== null && input.expectedVersion !== current?.version) {
        return current
          ? { kind: "version_conflict" as const, currentVersion: current.version }
          : { kind: "not_found" as const };
      }
      const next: AvailabilitySchedule = {
        ...createSchedule(),
        ...input,
        version: current ? current.version + 1 : 1,
        createdAt: current?.createdAt ?? input.now,
        updatedAt: input.now
      };
      setSchedule(next);
      return { kind: current ? ("updated" as const) : ("created" as const), schedule: next };
    }),
    replace: vi.fn(async () => raise("Unexpected replace call")),
    readProjectionContext: vi.fn(async () => null)
  };
}

function createBlock(): ManualCalendarBlock {
  return {
    id: blockId,
    reservationId,
    ownerUserId,
    scheduleId,
    title: "Отпуск",
    state: "active",
    startAt: "2026-07-20T07:00:00.000Z",
    endAt: "2026-07-20T08:00:00.000Z",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function createCommandStore(
  getBlock: () => ManualCalendarBlock,
  setBlock: (block: ManualCalendarBlock) => void
): ManualCalendarBlockCommandStore {
  let savedCommand: { key: string; hash: string } | null = null;
  return {
    executeCreate: vi.fn(async (command, createClaim) => {
      const persistedCommand = savedCommand;
      if (persistedCommand !== null && persistedCommand.key === command.key) {
        if (persistedCommand.hash !== command.requestHash) {
          throw new IdempotencyKeyReuseError();
        }
        return { kind: "replayed" as const, block: getBlock() };
      }
      const claim = await createClaim();
      if (claim.title === "CONFLICT") throw new ManualCalendarBlockConflictError();
      savedCommand = { key: command.key, hash: command.requestHash };
      return { kind: "created" as const, block: getBlock() };
    }),
    release: vi.fn(async (input) => {
      const current = getBlock();
      if (input.ownerUserId !== current.ownerUserId || input.blockId !== current.id) return null;
      const released = { ...current, state: "released" as const, updatedAt: input.now };
      setBlock(released);
      return released;
    })
  };
}

function createReadStore(): CalendarReadStore {
  return {
    readRange: vi.fn(async ({ ownerUserId: candidate }) => ({
      entries: candidate === ownerUserId ? [] : [],
      summary: { bookingCount: 0, bookedMinutes: 0, byDisplayStatus: {} }
    }))
  };
}

function createAuthStore(): AuthSessionAuthenticationStore {
  return {
    findByTokenHash: vi.fn(async (candidateHash: string) => {
      const token = [sessionToken, secondSessionToken].find(
        (candidate) => hashSessionToken(candidate) === candidateHash
      );
      if (!token) return null;
      const userId = token === sessionToken ? ownerUserId : secondOwnerUserId;
      return {
        session: {
          id: token === sessionToken ? "66666666-6666-4666-8666-666666666666" : "77777777-7777-4777-8777-777777777777",
          userId,
          tokenHash: candidateHash,
          status: "active" as const,
          createdAt: now.toISOString(),
          expiresAt: "2026-07-19T00:00:00.000Z"
        },
        user: { id: userId, status: "active" as const, createdAt: now.toISOString(), updatedAt: now.toISOString() },
        roleAssignments: [{ id: token === sessionToken ? "88888888-8888-4888-8888-888888888888" : "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", userId, role: "astrologer" as const, assignedAt: now.toISOString() }]
      };
    })
  };
}

function raise(message: string): never {
  throw new Error(message);
}
