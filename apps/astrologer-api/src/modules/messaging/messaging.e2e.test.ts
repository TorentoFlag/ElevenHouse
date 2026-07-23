import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { hashSessionToken } from "@elevenhouse/auth";
import {
  MessagingMessageResponseSchema,
  MessagingThreadClientLinkResponseSchema,
  MessagingThreadResponseSchema
} from "@elevenhouse/contracts";
import type {
  AuthSessionAuthenticationStore,
  AuthSessionRevocationUnitOfWork,
  MessagingReadStore,
  MessagingStore,
  PasswordlessAuthUnitOfWork,
  PasswordlessCustomerAccountRegistrationSessionUnitOfWork
} from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { MessagingModule } from "./messaging.module";
import {
  MESSAGING_READ_STORE,
  MESSAGING_STORE
} from "./messaging.tokens";

const now = new Date("2026-07-22T10:00:00.000Z");
const ownerUserId = "22222222-2222-4222-8222-222222222222";
const otherOwnerUserId = "33333333-3333-4333-8333-333333333333";
const threadId = "44444444-4444-4444-8444-444444444444";
const connectionId = "55555555-5555-4555-8555-555555555555";
const identityId = "66666666-6666-4666-8666-666666666666";
const messageId = "77777777-7777-4777-8777-777777777777";
const sessionToken = "messaging-session-token";
const otherSessionToken = "other-messaging-session-token";
const sessionCookieName = "elevenhouse_astrologer_session";
const csrfCookieName = "elevenhouse_astrologer_csrf";
const csrfHeaderName = "x-csrf-token";
let primaryCsrfToken = "";
let secondaryCsrfToken = "";
let linkedClientUserId: string | null = null;
let inboundProviderMessageCount = 0;
let businessConnectionUpdateCount = 0;
let realtimeReadInputs: unknown[] = [];
const limits = {
  requestCodeIdentifier: { limit: 5, windowSeconds: 3600 },
  requestCodeIp: { limit: 30, windowSeconds: 3600 },
  requestCodeIdentifierIp: { limit: 3, windowSeconds: 3600 },
  verifyChallenge: { limit: 5, windowSeconds: 900 },
  verifyIp: { limit: 60, windowSeconds: 900 }
};

describe("messaging HTTP routes", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let baseUrl: string;

  beforeEach(async () => {
    linkedClientUserId = null;
    inboundProviderMessageCount = 0;
    businessConnectionUpdateCount = 0;
    realtimeReadInputs = [];
    const passwordlessAuth: PasswordlessAuthUnitOfWork = {
      transact: async () => raise("Unexpected passwordless auth call")
    };
    const revocation: AuthSessionRevocationUnitOfWork = {
      transact: async () => raise("Unexpected auth revocation call")
    };
    const registration: PasswordlessCustomerAccountRegistrationSessionUnitOfWork = {
      transact: async () => raise("Unexpected registration call")
    };
    moduleRef = await Test.createTestingModule({ imports: [IdentityModule, MessagingModule] })
      .overrideProvider(PostgresRuntimeService)
      .useValue({ database: {} })
      .overrideProvider(ConfigService)
      .useValue(
        createIdentityConfigServiceStub({
          sessionCookieName,
          csrfCookieName,
          csrfHeaderName,
          telegramBotWebhookSecret: "telegram-test-secret",
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
      .useValue({ now: () => now })
      .overrideProvider(MESSAGING_STORE)
      .useValue(createStore())
      .overrideProvider(MESSAGING_READ_STORE)
      .useValue(createReadStore())
      .compile();
    const csrf = moduleRef.get(AstrologerCsrfTokenService);
    primaryCsrfToken = createCsrfToken(csrf, sessionToken);
    secondaryCsrfToken = createCsrfToken(csrf, otherSessionToken);
    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterEach(async () => {
    await app?.close();
    await moduleRef?.close();
  });

  it("returns 401 for unauthenticated requests", async () => {
    const response = await requestJson("GET", "/messaging/threads");
    expect(response.status).toBe(401);
  });

  it("rejects durable messaging mutations without CSRF or an Idempotency-Key", async () => {
    const withoutCsrf = await requestJson(
      "POST",
      `/messaging/threads/${threadId}/messages`,
      { text: "Здравствуйте" },
      auth()
    );
    const withoutKey = await requestJson(
      "POST",
      `/messaging/threads/${threadId}/messages`,
      { text: "Здравствуйте" },
      csrfAuth()
    );
    const linkWithoutKey = await requestJson(
      "POST",
      `/messaging/threads/${threadId}/link-client`,
      { clientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      csrfAuth()
    );
    const createWithoutKey = await requestJson(
      "POST",
      `/messaging/threads/${threadId}/create-client`,
      { displayName: "Марина" },
      csrfAuth()
    );
    expect(withoutCsrf.status).toBe(403);
    expect(withoutKey.status).toBe(400);
    expect(linkWithoutKey.status).toBe(400);
    expect(createWithoutKey.status).toBe(400);
  });

  it("returns safe 404 for a cross-owner thread", async () => {
    const response = await requestJson(
      "GET",
      `/messaging/threads/${threadId}`,
      undefined,
      auth(otherSessionToken)
    );
    expect(response).toMatchObject({
      status: 404,
      body: { code: "messaging_thread_not_found" }
    });
  });

  it("returns a contract-safe outbound message without provider secrets", async () => {
    const response = await requestJson(
      "POST",
      `/messaging/threads/${threadId}/messages`,
      { text: "Здравствуйте" },
      { ...csrfAuth(), "idempotency-key": "messaging:request-1" }
    );
    expect(response.status).toBe(201);
    MessagingMessageResponseSchema.parse(response.body);
    expect(JSON.stringify(response.body)).not.toMatch(
      /providerToken|session|business_connection_id|rawPayload/i
    );
  });

  it("returns a contract-safe owner-scoped thread response", async () => {
    const response = await requestJson("GET", `/messaging/threads/${threadId}`, undefined, auth());
    expect(response.status).toBe(200);
    MessagingThreadResponseSchema.parse(response.body);
    expect(JSON.stringify(response.body)).not.toMatch(
      /providerToken|session|business_connection_id|rawPayload/i
    );
  });

  it("streams owner-scoped realtime events after Last-Event-ID without CSRF", async () => {
    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/messaging/events`, {
      method: "GET",
      headers: { ...auth(), "last-event-id": "41" },
      signal: controller.signal
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const chunk = await readFirstSseChunk(response);
    controller.abort();

    expect(realtimeReadInputs).toEqual([
      { astrologerUserId: ownerUserId, afterEventId: "41", limit: 100 }
    ]);
    expect(chunk).toContain("id: 42");
    expect(chunk).toContain("event: message.received");
    expect(chunk).toContain('"eventId":"42"');
    expect(chunk).not.toContain(otherOwnerUserId);
  });

  it("rejects invalid Last-Event-ID on realtime stream", async () => {
    const response = await fetch(`${baseUrl}/messaging/events`, {
      method: "GET",
      headers: { ...auth(), "last-event-id": "abc" }
    });

    expect(response.status).toBe(400);
  });

  it("returns a linked primary identity after link-client", async () => {
    const clientUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const response = await requestJson(
      "POST",
      `/messaging/threads/${threadId}/link-client`,
      { clientUserId },
      { ...csrfAuth(), "idempotency-key": "thread-link:response-1" }
    );

    expect(response.status).toBe(201);
    MessagingThreadClientLinkResponseSchema.parse(response.body);
    expect(response.body).toMatchObject({
      clientUserId,
      thread: {
        clientUserId,
        primaryIdentity: { linkedClientUserId: clientUserId, linkStatus: "linked" }
      }
    });
  });

  it("protects Telegram Business webhook with provider secret token", async () => {
    const withoutSecret = await requestJson(
      "POST",
      "/messaging/webhooks/telegram/bot",
      telegramBusinessMessageUpdate(),
      {}
    );
    const wrongSecret = await requestJson(
      "POST",
      "/messaging/webhooks/telegram/bot",
      telegramBusinessMessageUpdate(),
      { "x-telegram-bot-api-secret-token": "wrong" }
    );

    expect(withoutSecret.status).toBe(401);
    expect(wrongSecret.status).toBe(401);
    expect(inboundProviderMessageCount).toBe(0);
  });

  it("accepts Telegram Business message webhooks without browser auth or CSRF", async () => {
    const response = await requestJson(
      "POST",
      "/messaging/webhooks/telegram/bot",
      telegramBusinessMessageUpdate(),
      { "x-telegram-bot-api-secret-token": "telegram-test-secret" }
    );

    expect(response).toEqual({ status: 201, body: { ok: true } });
    expect(inboundProviderMessageCount).toBe(1);
  });

  it("accepts Telegram Business connection webhooks without browser auth or CSRF", async () => {
    const response = await requestJson(
      "POST",
      "/messaging/webhooks/telegram/bot",
      telegramBusinessConnectionUpdate(),
      { "x-telegram-bot-api-secret-token": "telegram-test-secret" }
    );

    expect(response).toEqual({ status: 201, body: { ok: true } });
    expect(businessConnectionUpdateCount).toBe(1);
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

function createAuthStore(): AuthSessionAuthenticationStore {
  return {
    findByTokenHash: vi.fn(async (tokenHash: string) => {
      const userId = tokenHash === hashSessionToken(sessionToken)
        ? ownerUserId
        : tokenHash === hashSessionToken(otherSessionToken)
          ? otherOwnerUserId
          : null;
      if (!userId) return null;
      return {
        session: {
          id: "88888888-8888-4888-8888-888888888888",
          userId,
          tokenHash,
          status: "active" as const,
          createdAt: now.toISOString(),
          expiresAt: "2026-07-25T00:00:00.000Z"
        },
        user: { id: userId, status: "active" as const, createdAt: now.toISOString(), updatedAt: now.toISOString() },
        roleAssignments: [{ id: "99999999-9999-4999-8999-999999999999", userId, role: "astrologer" as const, assignedAt: now.toISOString() }]
      };
    })
  };
}

function createStore(): MessagingStore {
  const thread = domainThread();
  return {
    findThreadForAstrologer: vi.fn(async ({ astrologerUserId }) =>
      astrologerUserId === ownerUserId ? thread : null
    ),
    findExternalIdentityForThread: vi.fn(async () => ({ id: identityId, channelConnectionId: connectionId })),
    findOutboundMessageByIdempotencyKey: vi.fn(async () => null),
    createOutboundMessage: vi.fn(async (input) => ({
      id: messageId,
      threadId: input.threadId,
      channelConnectionId: input.channelConnectionId,
      externalIdentityId: null,
      direction: "outbound" as const,
      text: input.text,
      status: "queued" as const,
      providerMessageId: null,
      idempotencyKey: input.idempotencyKey,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    })),
    recordInboundProviderMessage: vi.fn(async () => {
      inboundProviderMessageCount += 1;
      return { kind: "created" as const, message: readDomainInboundMessage() };
    }),
    recordTelegramBusinessConnection: vi.fn(async () => {
      businessConnectionUpdateCount += 1;
      return { kind: "recorded" as const };
    }),
    recordTelegramBusinessMessage: vi.fn(async () => {
      inboundProviderMessageCount += 1;
      return { kind: "created" as const, message: readDomainInboundMessage() };
    }),
    linkThreadToClient: vi.fn(async (input) => {
      linkedClientUserId = input.clientUserId;
      return { ...thread, clientUserId: input.clientUserId };
    }),
    createClientFromThread: vi.fn(async () => {
      linkedClientUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      return { ...thread, clientUserId: linkedClientUserId };
    }),
    markThreadRead: vi.fn(async () => raise("Unexpected mark read")),
    appendRealtimeEvent: vi.fn(async () => raise("Unexpected realtime event"))
  };
}

function createReadStore(): MessagingReadStore {
  return {
    listChannelConnections: vi.fn(async () => ({ channelConnections: [] })),
    listThreads: vi.fn(async ({ astrologerUserId }) =>
      astrologerUserId === ownerUserId ? { threads: [readThread()], nextCursor: null } : { threads: [], nextCursor: null }
    ),
    getThread: vi.fn(async ({ astrologerUserId }) =>
      astrologerUserId === ownerUserId
        ? { thread: readThread(linkedClientUserId), messages: [readMessage()], nextCursor: null }
        : null
    ),
    listRealtimeEvents: vi.fn(async (input) => {
      realtimeReadInputs.push(input);
      return {
        events: input.astrologerUserId === ownerUserId
          ? [
              {
                eventId: "42",
                astrologerUserId: ownerUserId,
                type: "message.received" as const,
                occurredAt: now.toISOString(),
                threadId,
                messageId,
                channelConnectionId: connectionId,
                externalIdentityId: identityId
              }
            ]
          : []
      };
    })
  };
}

function domainThread() {
  return {
    id: threadId,
    astrologerUserId: ownerUserId,
    clientUserId: null,
    channelConnectionId: connectionId,
    externalIdentityId: identityId,
    status: "open" as const,
    lastMessageAt: now.toISOString(),
    unreadAstrologerCount: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function readThread(clientUserId: string | null = null) {
  return {
    id: threadId,
    clientUserId,
    status: "open" as const,
    primaryIdentity: {
      id: identityId,
      channelConnectionId: connectionId,
      provider: "telegram" as const,
      providerUserId: "123",
      providerChatId: "456",
      username: "marina",
      displayName: "Марина",
      avatarMediaId: null,
      linkedClientUserId: clientUserId,
      linkStatus: clientUserId ? "linked" as const : "unlinked" as const,
      firstSeenAt: now.toISOString(),
      lastSeenAt: now.toISOString()
    },
    lastMessage: readMessage(),
    lastMessageAt: now.toISOString(),
    unreadCount: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function readMessage() {
  return {
    id: messageId,
    threadId,
    channelConnectionId: connectionId,
    externalIdentityId: null,
    direction: "outbound" as const,
    senderKind: "astrologer" as const,
    contentType: "text" as const,
    text: "Здравствуйте",
    mediaAssetId: null,
    status: "queued" as const,
    failureCode: null,
    providerSentAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function readDomainInboundMessage() {
  return {
    id: messageId,
    threadId,
    channelConnectionId: connectionId,
    externalIdentityId: identityId,
    direction: "inbound" as const,
    text: "Здравствуйте",
    status: "received" as const,
    providerMessageId: "100500",
    idempotencyKey: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function telegramBusinessMessageUpdate() {
  return {
    update_id: 100500,
    business_message: {
      message_id: 100500,
      business_connection_id: "bc_test",
      from: {
        id: 555,
        is_bot: false,
        first_name: "Marina",
        username: "marina"
      },
      chat: {
        id: 777,
        type: "private",
        first_name: "Marina",
        username: "marina"
      },
      date: 1784700060,
      text: "Здравствуйте"
    }
  };
}

function telegramBusinessConnectionUpdate() {
  return {
    update_id: 100501,
    business_connection: {
      id: "bc_test",
      user: {
        id: 555,
        is_bot: false,
        first_name: "Alisa",
        username: "alisa"
      },
      user_chat_id: 123456,
      date: 1784700000,
      rights: {
        can_reply: true,
        can_read_messages: true
      },
      is_enabled: true
    }
  };
}

function auth(token = sessionToken): Record<string, string> {
  return { cookie: `${sessionCookieName}=${token}` };
}

function csrfAuth(token = sessionToken): Record<string, string> {
  const csrf = token === otherSessionToken ? secondaryCsrfToken : primaryCsrfToken;
  return {
    cookie: `${sessionCookieName}=${token}; ${csrfCookieName}=${csrf}`,
    origin: "http://localhost:3000",
    [csrfHeaderName]: csrf
  };
}

function createCsrfToken(service: AstrologerCsrfTokenService, token: string): string {
  return service.setCsrfCookie({
    response: { cookie: vi.fn() },
    sessionToken: token,
    sessionExpiresAt: "2026-07-25T00:00:00.000Z",
    now
  });
}

async function readFirstSseChunk(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Expected SSE response body");
  const result = await reader.read();
  if (!result.value) throw new Error("Expected SSE chunk");
  return new TextDecoder().decode(result.value);
}

function raise(message: string): never {
  throw new Error(message);
}
