import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import type {
  AuthSessionAuthenticationStore,
  FinanceOrder,
  FinanceOrderStore,
  PaymentAttempt,
  PaymentProviderPort,
  PaymentStore
} from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemClock } from "../../common/system-clock.js";
import { PublicSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import { AUTH_SESSION_AUTHENTICATION_STORE } from "../identity/auth/identity-auth.tokens";
import { IdentityCurrentSessionService } from "../identity/session/identity-current-session.service";
import { PublicCsrfTokenService } from "../security/csrf/public-csrf-token.service";
import { CsrfGuard } from "../security/csrf/csrf.guard";
import { IdempotencyGuard } from "../security/idempotency/idempotency.guard";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import {
  PAYMENTS_CHECKOUT_ACTION_SERVICE,
  PAYMENTS_CHECKOUT_PREPARATION_SERVICE,
  PAYMENTS_ORDER_STORE,
  PAYMENTS_PAYMENT_STORE,
  PAYMENTS_PROVIDER
} from "./payments.tokens";

const now = new Date("2026-07-24T12:00:00.000Z");
const sessionCookieName = "elevenhouse_public_session";
const csrfCookieName = "elevenhouse_public_csrf";
const csrfHeaderName = "x-csrf-token";
const sessionToken = "public-session-token";
const clientUserId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const paymentAttemptId = "33333333-3333-4333-8333-333333333333";

let app: INestApplication;
let moduleRef: TestingModule;
let baseUrl: string;
let csrfToken: string;
let provider: PaymentProviderPort;
let orderStore: Pick<FinanceOrderStore, "findById">;
let checkoutOrder: FinanceOrder;

describe("payments checkout public HTTP flow", () => {
  beforeEach(async () => {
    provider = {
      provider: "arc_pay",
      environment: "sandbox",
      openCheckout: vi.fn(async () => ({
        providerCheckoutId: "arc-checkout-1",
        checkoutUrl: "https://checkout.arcpay.space/session/arc-checkout-1"
      }))
    };
    checkoutOrder = order();
    orderStore = { findById: vi.fn(async () => checkoutOrder) };
    moduleRef = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        PaymentsService,
        PublicSessionAuthGuard,
        IdentityCurrentSessionService,
        CsrfGuard,
        IdempotencyGuard,
        PublicCsrfTokenService,
        { provide: SystemClock, useValue: { now: vi.fn(() => now) } },
        { provide: ConfigService, useValue: configService() },
        { provide: AUTH_SESSION_AUTHENTICATION_STORE, useValue: authStore() },
        { provide: PAYMENTS_ORDER_STORE, useValue: orderStore },
        { provide: PAYMENTS_CHECKOUT_ACTION_SERVICE, useValue: null },
        { provide: PAYMENTS_CHECKOUT_PREPARATION_SERVICE, useValue: null },
        { provide: PAYMENTS_PAYMENT_STORE, useValue: paymentStore() },
        { provide: PAYMENTS_PROVIDER, useValue: provider }
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

  it("requires authentication, CSRF and Idempotency-Key", async () => {
    await expect(postCheckout()).resolves.toMatchObject({ status: 401 });
    await expect(
      postCheckout(authCookie(), { "idempotency-key": "checkout:e2e-1" })
    ).resolves.toMatchObject({ status: 403 });
    await expect(
      postCheckout(authenticatedCookies(), { [csrfHeaderName]: csrfToken })
    ).resolves.toMatchObject({ status: 400 });
  });

  it("does not execute the legacy synchronous hosted checkout path", async () => {
    const headers = {
      origin: "http://localhost:3000",
      [csrfHeaderName]: csrfToken,
      "idempotency-key": "checkout:e2e-1"
    };

    const response = await postCheckout(authenticatedCookies(), headers);

    expect(response).toMatchObject({
      status: 503,
      body: { code: "payment_checkout_worker_preparation_required" }
    });
    expect(provider.openCheckout).not.toHaveBeenCalled();
  });

  it("does not expose a hosted checkout action until the worker-owned preparation contour is configured", async () => {
    const response = await fetch(
      `${baseUrl}/payments/checkout-preparations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/action`,
      { headers: { cookie: authenticatedCookies() }, redirect: "manual" }
    );

    await expect(response.json()).resolves.toMatchObject({
      code: "payment_checkout_action_preparation_required"
    });
    expect(response.status).toBe(503);
    expect(response.headers.get("location")).toBeNull();
    expect(provider.openCheckout).not.toHaveBeenCalled();
  });

  it("does not allow a client to open checkout for another client's order", async () => {
    checkoutOrder = { ...order(), clientUserId: "foreign-client" };

    const response = await postCheckout(authenticatedCookies(), {
      origin: "http://localhost:3000",
      [csrfHeaderName]: csrfToken,
      "idempotency-key": "checkout:e2e-foreign"
    });
    expect(response).toMatchObject({
      status: 404,
      body: { code: "payment_checkout_order_not_found" }
    });
    expect(provider.openCheckout).not.toHaveBeenCalled();
  });

  it("rejects HTTPS return URLs outside configured public origins", async () => {
    const response = await postCheckout(
      authenticatedCookies(),
      {
        origin: "http://localhost:3000",
        [csrfHeaderName]: csrfToken,
        "idempotency-key": "checkout:e2e-return-origin"
      },
      { successUrl: "https://untrusted.example/payments/success" }
    );

    expect(response).toMatchObject({ status: 400, body: { code: "invalid_request" } });
    expect(provider.openCheckout).not.toHaveBeenCalled();
  });
});

async function postCheckout(
  cookie?: string,
  headers: Record<string, string> = {},
  body: Record<string, string> = {}
) {
  const response = await fetch(`${baseUrl}/payments/checkout`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
    body: JSON.stringify({
      orderId,
      buyerContact: { kind: "email", value: "client@example.test" },
      successUrl: "https://client.elevenhouse.test/payments/success",
      failureUrl: "https://client.elevenhouse.test/payments/failure",
      cancelUrl: "https://client.elevenhouse.test/payments/cancel",
      ...body
    })
  });
  return { status: response.status, body: await response.json() };
}

function paymentStore() {
  let persisted: PaymentAttempt | null = null;
  return {
    executeCreateCheckout: vi.fn(async (_command, createInput) => {
      if (persisted) return { kind: "replayed" as const, value: persisted };
      const input = await createInput();
      persisted = {
        id: paymentAttemptId,
        orderId: input.orderId,
        provider: input.provider,
        environment: input.environment,
        status: "created",
        amount: input.amount,
        providerPaymentId: null,
        providerCheckoutId: null,
        idempotencyKey: input.idempotencyKey,
        metadata: {},
        createdAt: input.now,
        updatedAt: input.now
      };
      return { kind: "created" as const, value: persisted };
    }),
    markAttemptCheckoutOpened: vi.fn(async (input) => {
      if (!persisted) return null;
      persisted = {
        ...persisted,
        status: "checkout_opened",
        providerCheckoutId: input.providerCheckoutId,
        metadata: { checkoutUrl: input.checkoutUrl },
        updatedAt: input.now
      };
      return persisted;
    })
  } satisfies Pick<PaymentStore, "executeCreateCheckout" | "markAttemptCheckoutOpened">;
}

function order(): FinanceOrder {
  return {
    id: orderId,
    clientUserId,
    astrologerUserId: "44444444-4444-4444-8444-444444444444",
    productId: "55555555-5555-4555-8555-555555555555",
    productTitleSnapshot: "Natal reading",
    directLinkIntentId: null,
    bookingId: null,
    status: "pending_payment",
    grossAmount: { amountMinor: 500_00, currency: "RUB" },
    platformFee: { amountMinor: 50_00, currency: "RUB" },
    astrologerNetAmount: { amountMinor: 450_00, currency: "RUB" },
    financePolicySnapshotId: "66666666-6666-4666-8666-666666666666",
    financePolicyRiskTier: "standard",
    financePolicyHoldDurationHours: 48,
    financePolicyReserveBps: 0,
    financePolicyReserveReleaseDelayDays: 0,
    tariffSeriesId: "pro",
    tariffVersion: 1,
    tariffVersionDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    tariffCommissionBps: 1_000,
    financePolicyProviderSettlementRequired: true,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function authenticatedCookies() {
  return `${authCookie()}; ${csrfCookieName}=${csrfToken}`;
}
function authCookie() {
  return `${sessionCookieName}=${sessionToken}`;
}
function createCsrfToken(service: PublicCsrfTokenService) {
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
function authStore(): AuthSessionAuthenticationStore {
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
function configService(): Pick<ConfigService, "get" | "getOrThrow"> {
  return {
    get: vi.fn(() => undefined),
    getOrThrow: vi.fn((key: string) => {
      if (key === "publicApi.sessionCookieName") return sessionCookieName;
      if (key === "publicApi.csrfSecret") return "test-csrf-secret-with-enough-entropy";
      if (key === "publicApi.csrfCookieName") return csrfCookieName;
      if (key === "publicApi.csrfHeaderName") return csrfHeaderName;
      if (key === "publicApi.csrfTokenTtlSeconds") return 604800;
      if (key === "publicApi.sessionCookieSecure") return false;
      if (key === "publicApi.allowedOrigins") {
        return ["http://localhost:3000", "https://client.elevenhouse.test"];
      }
      throw new Error(`Unexpected config key: ${key}`);
    })
  };
}
