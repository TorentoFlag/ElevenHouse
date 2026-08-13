import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import type {
  AuthSessionAuthenticationStore,
  ClientAstrologerRelationshipReader,
  EffectiveFinancePolicy,
  FinanceOrder,
  FinanceOrderStore,
  FinancePolicyStore,
  PlatformTariffEntitlementStore,
  Product,
  ProductStore
} from "@elevenhouse/domain";
import { createPlatformTariffDraft } from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemClock } from "../../common/system-clock.js";
import { PublicSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import {
  AUTH_SESSION_AUTHENTICATION_STORE,
  MOBILE_SESSION_AUTHENTICATION_STORE
} from "../identity/auth/identity-auth.tokens";
import { IdentityCurrentSessionService } from "../identity/session/identity-current-session.service";
import { PublicCsrfTokenService } from "../security/csrf/public-csrf-token.service";
import { CsrfGuard } from "../security/csrf/csrf.guard";
import { IdempotencyGuard } from "../security/idempotency/idempotency.guard";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import {
  ORDERS_FINANCE_POLICY_STORE,
  ORDERS_ORDER_STORE,
  ORDERS_PRODUCT_STORE,
  ORDERS_RELATIONSHIP_READER,
  ORDERS_TARIFF_AUTHORITY_STORE
} from "./orders.tokens";

const now = new Date("2026-07-24T10:00:00.000Z");
const sessionCookieName = "elevenhouse_public_session";
const csrfCookieName = "elevenhouse_public_csrf";
const csrfHeaderName = "x-csrf-token";
const sessionToken = "public-session-token";
const clientUserId = "11111111-1111-4111-8111-111111111111";
const astrologerUserId = "22222222-2222-4222-8222-222222222222";
const productId = "33333333-3333-4333-8333-333333333333";
const orderId = "66666666-6666-4666-8666-666666666666";
const bookingId = "77777777-7777-4777-8777-777777777777";
const policyId = "55555555-5555-4555-8555-555555555555";
const tariff = {
  ...createPlatformTariffDraft({
    tariffSeriesId: "pro",
    version: 1,
    name: "Pro",
    tagline: "For active practice",
    monthlyPriceMinor: 2_500,
    yearlyPriceMinor: 25_000,
    clientSaleCommissionBps: 800,
    monthlyRecurringFrequencyDays: 30,
    yearlyRecurringFrequencyDays: 365,
    seatsLimit: 1,
    bookingsLimit: null,
    aiRequestsLimit: null,
    automationLimit: null,
    isPopular: false,
    displayOrder: 0,
    features: ["products"]
  }),
  lifecycle: "published" as const
};

let app: INestApplication;
let moduleRef: TestingModule;
let baseUrl: string;
let csrfToken: string;
let orderStore: FinanceOrderStore;

describe("orders public HTTP flow", () => {
  beforeEach(async () => {
    orderStore = createOrderStore();
    moduleRef = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        OrdersService,
        PublicSessionAuthGuard,
        IdentityCurrentSessionService,
        CsrfGuard,
        IdempotencyGuard,
        PublicCsrfTokenService,
        {
          provide: SystemClock,
          useValue: { now: vi.fn(() => now) }
        },
        {
          provide: ConfigService,
          useValue: createConfigServiceStub()
        },
        {
          provide: AUTH_SESSION_AUTHENTICATION_STORE,
          useValue: createAuthStore()
        },
        {
          provide: MOBILE_SESSION_AUTHENTICATION_STORE,
          useValue: { findByAccessTokenHash: vi.fn(async () => null) }
        },
        {
          provide: ORDERS_ORDER_STORE,
          useValue: orderStore
        },
        {
          provide: ORDERS_RELATIONSHIP_READER,
          useValue: {
            hasActiveRelationship: vi.fn(async () => true)
          } satisfies ClientAstrologerRelationshipReader
        },
        {
          provide: ORDERS_PRODUCT_STORE,
          useValue: {
            findByOwnerAndId: vi.fn(async () => activeProduct)
          } satisfies Pick<ProductStore, "findByOwnerAndId">
        },
        {
          provide: ORDERS_FINANCE_POLICY_STORE,
          useValue: {
            findEffectivePolicyForAstrologer: vi.fn(
              async (): Promise<EffectiveFinancePolicy> => ({
                policyId,
                policyVersion: 1,
                riskTier: "standard",
                baseRiskTier: "standard",
                profile: null,
                holdDurationHours: 48,
                reserveBps: 0,
                reserveReleaseDelayDays: 0,
                providerSettlementRequired: true
              })
            )
          } satisfies Pick<FinancePolicyStore, "findEffectivePolicyForAstrologer">
        },
        {
          provide: ORDERS_TARIFF_AUTHORITY_STORE,
          useValue: {
            findCurrentSubscription: vi.fn(async () => ({
              subscriptionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              ownerUserId: astrologerUserId,
              tariffSeriesId: tariff.tariffSeriesId,
              tariffVersion: tariff.version,
              tariffVersionDigest: tariff.canonicalDigest,
              commissionBpsSnapshot: tariff.clientSaleCommissionBps,
              version: 1,
              state: "active" as const,
              startsAt: "2026-07-01T00:00:00.000Z",
              endsAt: "2026-08-01T00:00:00.000Z"
            })),
            findTariffVersion: vi.fn(async () => tariff),
            findLatestHistoricalCapabilityGrant: vi.fn(async () => null)
          } satisfies PlatformTariffEntitlementStore
        }
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

  it("requires authentication, CSRF and Idempotency-Key before creating an order", async () => {
    const body = { astrologerUserId, productId, expectedProductRevision: 1, bookingId };

    await expect(postJson("/orders", body)).resolves.toMatchObject({ status: 401 });
    await expect(
      postJson("/orders", body, authCookie(), { "idempotency-key": "order-create:e2e-1" })
    ).resolves.toMatchObject({ status: 403 });
    await expect(
      postJson("/orders", body, authenticatedCookies(), { [csrfHeaderName]: csrfToken })
    ).resolves.toMatchObject({ status: 400 });

    const response = await postJson("/orders", body, authenticatedCookies(), {
      origin: "http://localhost:3000",
      [csrfHeaderName]: csrfToken,
      "idempotency-key": "order-create:e2e-1"
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: orderId,
      clientUserId,
      astrologerUserId,
      productId,
      productTitleSnapshot: "Natal reading",
      directLinkIntentId: null,
      status: "pending_payment",
      grossAmount: { amountMinor: 500_00, currency: "RUB" },
      platformFee: { amountMinor: 40_00, currency: "RUB" },
      astrologerNetAmount: { amountMinor: 460_00, currency: "RUB" }
    });
    expect(orderStore.executeCreateOrder).toHaveBeenCalledTimes(1);
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

function createOrderStore(): FinanceOrderStore {
  return {
    executeCreateOrder: vi.fn(async (_command, createInput) => {
      const input = await createInput();
      return {
        kind: "created" as const,
        value: {
          id: orderId,
          clientUserId: input.clientUserId,
          astrologerUserId: input.astrologerUserId,
          productId: input.productId,
          productTitleSnapshot: input.productTitleSnapshot,
          directLinkIntentId: input.directLinkIntentId,
          bookingId: input.bookingId ?? null,
          status: input.status ?? "pending_payment",
          grossAmount: input.grossAmount,
          platformFee: input.platformFee,
          astrologerNetAmount: input.astrologerNetAmount,
          financePolicySnapshotId: input.financePolicySnapshotId,
          financePolicyRiskTier: input.financePolicyRiskTier,
          financePolicyHoldDurationHours: input.financePolicyHoldDurationHours,
          financePolicyReserveBps: input.financePolicyReserveBps,
          financePolicyReserveReleaseDelayDays: input.financePolicyReserveReleaseDelayDays,
          tariffSeriesId: input.tariffSeriesId,
          tariffVersion: input.tariffVersion,
          tariffVersionDigest: input.tariffVersionDigest,
          tariffCommissionBps: input.tariffCommissionBps,
          financePolicyProviderSettlementRequired: input.financePolicyProviderSettlementRequired,
          createdAt: input.now,
          updatedAt: input.now
        } satisfies FinanceOrder
      };
    }),
    create: vi.fn(),
    updateStatus: vi.fn(),
    applyFinancePolicy: vi.fn(),
    findById: vi.fn()
  };
}

const activeProduct = {
  id: productId,
  revision: 1,
  ownerUserId: astrologerUserId,
  type: "single",
  status: "active",
  title: "Natal reading",
  subtitle: null,
  priceMinor: 500_00,
  currency: "RUB",
  coverMediaId: null,
  introVideoUrl: null,
  executionMode: "live",
  paymentModel: "once",
  durationMinutes: 60,
  durationLabel: null,
  slaLabel: null,
  packageSessionCount: null,
  packageDiscountPercent: null,
  subscriptionPeriod: null,
  trialDays: null,
  participantMode: "solo",
  groupSize: null,
  deliveryFormats: [],
  requiredClientData: [],
  methods: [],
  accessGrants: [],
  astroDiaryConfig: null,
  includedItems: [],
  modifiers: [],
  createdAt: now.toISOString(),
  updatedAt: now.toISOString()
} satisfies Product;

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
