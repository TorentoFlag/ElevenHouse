import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { hashSessionToken } from "@elevenhouse/auth";
import {
  listProductTemplatesResponseSchema,
  listProductsResponseSchema,
  productResponseSchema,
  productSummaryResponseSchema
} from "@elevenhouse/contracts";
import type {
  AuthSessionAuthenticationStore,
  AuthSessionRevocationUnitOfWork,
  MediaAsset,
  MediaAssetStore,
  PasswordlessAuthUnitOfWork,
  PasswordlessCustomerAccountRegistrationSessionUnitOfWork,
  Product,
  ProductStore,
  ProductStoreCreateInput,
  ProductTemplate,
  ProductTemplateStore,
  PlatformTariffEntitlementStore,
  PlatformTariffSubscriptionSnapshot,
  PlatformTariffVersion
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
import { MEDIA_ASSET_STORE } from "../media/media.tokens";
import { PLATFORM_TARIFF_ENTITLEMENT_STORE } from "../platform-entitlements/platform-entitlements.tokens";
import { TestPasswordlessRateLimiter } from "../identity/testing/test-passwordless-rate-limiter";
import { RedisRuntimeService } from "../redis/redis-runtime.service";
import { AstrologerCsrfTokenService } from "../security/csrf/astrologer-csrf-token.service";
import { ProductsModule } from "./products.module";
import { PRODUCT_STORE, PRODUCT_TEMPLATE_STORE } from "./products.tokens";

const now = new Date("2026-07-02T00:00:00.000Z");
const sessionCookieName = "elevenhouse_astrologer_session";
const csrfCookieName = "elevenhouse_astrologer_csrf";
const csrfHeaderName = "x-csrf-token";
const sessionToken = "raw-session-token";
const ownerUserId = "8e14390f-3db1-4d1c-9344-55679c778427";
const coverMediaId = "33333333-3333-4333-8333-333333333333";
let currentCsrfToken = "";
const defaultPasswordlessRateLimits = {
  requestCodeIdentifier: { limit: 5, windowSeconds: 3600 },
  requestCodeIp: { limit: 30, windowSeconds: 3600 },
  requestCodeIdentifierIp: { limit: 3, windowSeconds: 3600 },
  verifyChallenge: { limit: 5, windowSeconds: 900 },
  verifyIp: { limit: 60, windowSeconds: 900 }
};

describe("products HTTP routes", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let baseUrl: string;
  let productStore: ProductStore;
  let productTemplateStore: ProductTemplateStore;
  let entitlementStore: ReturnType<typeof createEntitlementStore>;

  beforeEach(async () => {
    productStore = createProductStore();
    productTemplateStore = createProductTemplateStore();
    entitlementStore = createEntitlementStore();
    const authStore = createAuthStore();
    const passwordlessAuth: PasswordlessAuthUnitOfWork = {
      transact: async () => raise("Unexpected passwordless auth unit of work call")
    };
    const authSessionRevocation: AuthSessionRevocationUnitOfWork = {
      transact: async () => raise("Unexpected auth session revocation unit of work call")
    };
    const astrologerRegistration: PasswordlessCustomerAccountRegistrationSessionUnitOfWork = {
      transact: async () => raise("Unexpected astrologer registration unit of work call")
    };

    moduleRef = await Test.createTestingModule({
      imports: [IdentityModule, ProductsModule]
    })
      .overrideProvider(PostgresRuntimeService)
      .useValue({ database: {} })
      .overrideProvider(ConfigService)
      .useValue(
        createIdentityConfigServiceStub({
          sessionCookieName,
          csrfCookieName,
          csrfHeaderName,
          passwordlessRateLimits: defaultPasswordlessRateLimits
        })
      )
      .overrideProvider(PASSWORDLESS_AUTH_UNIT_OF_WORK)
      .useValue(passwordlessAuth)
      .overrideProvider(AUTH_SESSION_AUTHENTICATION_STORE)
      .useValue(authStore)
      .overrideProvider(AUTH_SESSION_REVOCATION_UNIT_OF_WORK)
      .useValue(authSessionRevocation)
      .overrideProvider(ASTROLOGER_REGISTRATION_SESSION_UNIT_OF_WORK)
      .useValue(astrologerRegistration)
      .overrideProvider(PASSWORDLESS_RATE_LIMITER)
      .useValue(new TestPasswordlessRateLimiter(defaultPasswordlessRateLimits, () => now))
      .overrideProvider(RedisRuntimeService)
      .useValue({
        eval: vi.fn(async () => 0),
        quit: vi.fn(async () => undefined)
      })
      .overrideProvider(ASTROLOGER_AUTH_CODE_GENERATOR)
      .useValue({
        generateCode: vi.fn(() => "123456")
      })
      .overrideProvider(SystemClock)
      .useValue({
        now: vi.fn(() => now)
      })
      .overrideProvider(PRODUCT_STORE)
      .useValue(productStore)
      .overrideProvider(PRODUCT_TEMPLATE_STORE)
      .useValue(productTemplateStore)
      .overrideProvider(PLATFORM_TARIFF_ENTITLEMENT_STORE)
      .useValue(entitlementStore)
      .overrideProvider(MEDIA_ASSET_STORE)
      .useValue(createMediaAssetStore())
      .compile();

    currentCsrfToken = moduleRef.get(AstrologerCsrfTokenService).setCsrfCookie({
      response: { cookie: vi.fn() },
      sessionToken,
      sessionExpiresAt: "2026-07-09T00:00:00.000Z",
      now
    });
    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterEach(async () => {
    await app?.close();
    await moduleRef?.close();
  });

  it("requires authentication and returns an empty product list for authenticated astrologers", async () => {
    const unauthenticatedResponse = await fetch(`${baseUrl}/products`);
    const authenticatedResponse = await getJson("/products");

    expect(unauthenticatedResponse.status).toBe(401);
    expect(authenticatedResponse.status).toBe(200);
    listProductsResponseSchema.parse(authenticatedResponse.body);
    expect(authenticatedResponse.body).toEqual({
      products: [],
      total: 0,
      counts: {
        all: 0,
        active: 0,
        draft: 0,
        archived: 0
      }
    });
  });

  it("does not expose a tariff-gated product surface when the astrologer was never entitled", async () => {
    entitlementStore.findCurrentSubscription.mockResolvedValueOnce(null);

    const response = await getJson("/products");

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: "entitlement_required",
      capability: "products",
      operation: "read",
      access: "deny"
    });
  });

  it("keeps product reads available but blocks mutations from a historical grant", async () => {
    const tariff = productEntitlementTariff();
    entitlementStore.findCurrentSubscription.mockResolvedValue(null);
    entitlementStore.findLatestHistoricalCapabilityGrant.mockResolvedValue({
      subscription: {
        ...productActiveSubscription(tariff),
        state: "expired",
        startsAt: "2026-05-01T00:00:00.000Z",
        endsAt: "2026-06-01T00:00:00.000Z"
      },
      tariff: { ...tariff, lifecycle: "retired" }
    });

    const list = await getJson("/products");
    const create = await postJson("/products", validCreateBody(), csrfHeaders());

    expect(list.status).toBe(200);
    expect(create.status).toBe(403);
    expect(create.body).toMatchObject({
      code: "entitlement_required",
      capability: "products",
      operation: "mutation",
      access: "read_only"
    });
    expect(productStore.create).not.toHaveBeenCalled();
  });

  it("creates, transitions, duplicates and summarizes products with CSRF protection", async () => {
    const missingCsrfResponse = await postJson("/products", validCreateBody(), {
      cookie: sessionCookieHeader()
    });
    const createResponse = await postJson("/products", validCreateBody(), csrfHeaders());
    const createdProductId = String(createResponse.body.id);
    const updateResponse = await putJson(
      `/products/${createdProductId}`,
      { subtitle: null, durationMinutes: null },
      csrfHeaders()
    );
    const invalidUpdateResponse = await putJson(
      `/products/${createdProductId}`,
      { paymentModel: "pack" },
      csrfHeaders()
    );
    const publishResponse = await postJson(
      `/products/${createdProductId}/publish`,
      {},
      csrfHeaders()
    );
    const archiveResponse = await postJson(
      `/products/${createdProductId}/archive`,
      {},
      csrfHeaders()
    );
    const duplicateResponse = await postJson(
      `/products/${createdProductId}/duplicate`,
      { title: "Natal reading (copy)" },
      csrfHeaders()
    );
    const summaryResponse = await getJson("/products/summary");

    expect(missingCsrfResponse.status).toBe(403);
    expect(createResponse.status).toBe(201);
    productResponseSchema.parse(createResponse.body);
    expect(createResponse.body).toMatchObject({
      ownerUserId,
      status: "draft",
      title: "Натальный разбор",
      analytics: {
        salesCount: 0,
        grossRevenueMinor: 0,
        averageRating: null,
        reviewsCount: 0
      }
    });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body).toMatchObject({
      id: createdProductId,
      subtitle: null,
      durationMinutes: null
    });
    expect(invalidUpdateResponse.status).toBe(400);
    expect(publishResponse.status).toBe(201);
    expect(publishResponse.body).toMatchObject({ id: createdProductId, status: "active" });
    expect(archiveResponse.status).toBe(201);
    expect(archiveResponse.body).toMatchObject({ id: createdProductId, status: "archived" });
    expect(duplicateResponse.status).toBe(201);
    expect(duplicateResponse.body).toMatchObject({
      status: "draft",
      title: "Natal reading (copy)"
    });
    productSummaryResponseSchema.parse(summaryResponse.body);
    expect(summaryResponse.body).toEqual({
      analyticsStatus: "unavailable",
      total: 2,
      active: 0,
      draft: 1,
      archived: 1,
      totalSalesCount: 0,
      grossRevenueMinor: 0,
      currency: "RUB",
      bestseller: null
    });
  });

  it("lists localized templates and creates an owner draft with CSRF protection", async () => {
    const unauthenticatedList = await fetch(`${baseUrl}/products/templates?locale=en`);
    const templateList = await getJson("/products/templates?locale=en");
    const missingCsrf = await postJson(
      "/products/templates/individual_consultation/drafts",
      { locale: "en" },
      { cookie: sessionCookieHeader() }
    );
    const invalidBody = await postJson(
      "/products/templates/individual_consultation/drafts",
      {},
      csrfHeaders()
    );
    const createdDraft = await postJson(
      "/products/templates/individual_consultation/drafts",
      { locale: "en" },
      csrfHeaders()
    );

    expect(unauthenticatedList.status).toBe(401);
    expect(templateList.status).toBe(200);
    listProductTemplatesResponseSchema.parse(templateList.body);
    expect(templateList.body).toMatchObject({
      templates: [
        {
          code: "individual_consultation",
          locale: "en",
          title: "Individual consultation"
        }
      ]
    });
    expect(missingCsrf.status).toBe(403);
    expect(invalidBody.status).toBe(400);
    expect(createdDraft.status).toBe(201);
    expect(createdDraft.body).toMatchObject({
      ownerUserId,
      status: "draft",
      title: "Individual consultation"
    });
  });

  async function getJson(path: string): Promise<HttpJsonResponse> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        cookie: sessionCookieHeader()
      }
    });

    return readJsonResponse(response);
  }

  async function postJson(
    path: string,
    body: unknown,
    headers: Record<string, string> = {}
  ): Promise<HttpJsonResponse> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...headers
      },
      body: JSON.stringify(body)
    });

    return readJsonResponse(response);
  }

  async function putJson(
    path: string,
    body: unknown,
    headers: Record<string, string>
  ): Promise<HttpJsonResponse> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        ...headers
      },
      body: JSON.stringify(body)
    });

    return readJsonResponse(response);
  }
});

type HttpJsonResponse = {
  readonly status: number;
  readonly body: Record<string, unknown>;
};

async function readJsonResponse(response: Response): Promise<HttpJsonResponse> {
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>
  };
}

function sessionCookieHeader(): string {
  return `${sessionCookieName}=${sessionToken}`;
}

function authenticatedCookieHeader(): string {
  return `${sessionCookieHeader()}; ${csrfCookieName}=${currentCsrfToken}`;
}

function csrfHeaders(): Record<string, string> {
  return {
    cookie: authenticatedCookieHeader(),
    origin: "http://localhost:3000",
    [csrfHeaderName]: currentCsrfToken
  };
}

function createAuthStore(): AuthSessionAuthenticationStore {
  const tokenHash = hashSessionToken(sessionToken);

  return {
    findByTokenHash: vi.fn(async (candidateTokenHash: string) => {
      if (candidateTokenHash !== tokenHash) {
        return null;
      }

      return {
        session: {
          id: "8624104d-6f9b-4983-958e-9dbec6f0473c",
          userId: ownerUserId,
          tokenHash,
          status: "active" as const,
          createdAt: "2026-07-02T00:00:00.000Z",
          expiresAt: "2026-07-09T00:00:00.000Z"
        },
        user: {
          id: ownerUserId,
          status: "active" as const,
          createdAt: "2026-07-02T00:00:00.000Z",
          updatedAt: "2026-07-02T00:00:00.000Z"
        },
        roleAssignments: [
          {
            id: "f7e4d8ea-7d14-4e54-a19a-9412307b3e8d",
            userId: ownerUserId,
            role: "astrologer" as const,
            assignedAt: "2026-07-02T00:00:00.000Z"
          }
        ]
      };
    })
  };
}

function createEntitlementStore() {
  const tariff = productEntitlementTariff();
  const subscription = productActiveSubscription(tariff);
  return {
    findCurrentSubscription: vi.fn(
      async (): Promise<PlatformTariffSubscriptionSnapshot | null> => subscription
    ),
    findTariffVersion: vi.fn(async () => tariff),
    findLatestHistoricalCapabilityGrant: vi.fn(
      async (): Promise<Awaited<
        ReturnType<PlatformTariffEntitlementStore["findLatestHistoricalCapabilityGrant"]>
      >> => null
    )
  } satisfies PlatformTariffEntitlementStore;
}

function productActiveSubscription(
  tariff: PlatformTariffVersion
): PlatformTariffSubscriptionSnapshot {
  return {
    subscriptionId: "4d550054-7248-4b73-895d-8a945d40bb5d",
    ownerUserId,
    tariffSeriesId: tariff.tariffSeriesId,
    tariffVersion: tariff.version,
    tariffVersionDigest: tariff.canonicalDigest,
    commissionBpsSnapshot: tariff.clientSaleCommissionBps,
    version: 1,
    state: "active",
    startsAt: "2026-07-01T00:00:00.000Z",
    endsAt: "2026-08-01T00:00:00.000Z"
  };
}

function productEntitlementTariff(): PlatformTariffVersion {
  return {
    tariffSeriesId: "pro",
    version: 1,
    draftRevision: 1,
    lifecycle: "published",
    name: "Pro",
    tagline: "",
    monthlyPriceMinor: 10_000,
    yearlyPriceMinor: 100_000,
    monthlyRecurringFrequencyDays: 31,
    yearlyRecurringFrequencyDays: 365,
    clientSaleCommissionBps: 1000,
    seatsLimit: null,
    bookingsLimit: null,
    aiRequestsLimit: null,
    automationLimit: null,
    isPopular: false,
    displayOrder: 1,
    features: ["products"],
    canonicalDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  };
}

function createProductStore(): ProductStore {
  const products: Product[] = [];

  return {
    listByOwner: vi.fn(async (query) => {
      const owned = products.filter((product) => product.ownerUserId === query.ownerUserId);
      const filtered =
        query.status === "all" ? owned : owned.filter((product) => product.status === query.status);

      return {
        products: filtered.slice(query.offset, query.offset + query.limit),
        total: filtered.length,
        counts: {
          all: owned.length,
          active: owned.filter((product) => product.status === "active").length,
          draft: owned.filter((product) => product.status === "draft").length,
          archived: owned.filter((product) => product.status === "archived").length
        }
      };
    }),
    findByOwnerAndId: vi.fn(
      async (input) =>
        products.find(
          (product) => product.ownerUserId === input.ownerUserId && product.id === input.productId
        ) ?? null
    ),
    create: vi.fn(async (input) => {
      const product = toProduct(nextProductId(products.length), input);
      products.unshift(product);
      return product;
    }),
    update: vi.fn(async (input) => {
      const index = products.findIndex(
        (product) => product.ownerUserId === input.ownerUserId && product.id === input.productId
      );
      if (index === -1) return null;

      const current = products[index] ?? raise("Expected product index to resolve");
      const next: Product = {
        ...current,
        ...input.patch,
        updatedAt: input.now
      };
      products[index] = next;
      return next;
    }),
    duplicate: vi.fn(async (input) => {
      const product = toProduct(nextProductId(products.length), input);
      products.unshift(product);
      return product;
    })
  };
}

function createProductTemplateStore(): ProductTemplateStore {
  const templates = [
    createProductTemplate("ru", "Индивидуальная консультация"),
    createProductTemplate("en", "Individual consultation")
  ];

  return {
    listActiveByLocale: vi.fn(async ({ locale }) =>
      templates.filter((template) => template.locale === locale)
    ),
    findActiveByCodeAndLocale: vi.fn(
      async ({ code, locale }) =>
        templates.find((template) => template.code === code && template.locale === locale) ?? null
    )
  };
}

function createProductTemplate(locale: "ru" | "en", title: string): ProductTemplate {
  return {
    id:
      locale === "ru"
        ? "55555555-5555-4555-8555-555555555555"
        : "66666666-6666-4666-8666-666666666666",
    code: "individual_consultation",
    locale,
    type: "single",
    status: "active",
    title,
    subtitle: null,
    description: null,
    sortOrder: 10,
    payload: {
      type: "single",
      title,
      priceMinor: 490000,
      currency: "RUB",
      executionMode: "live",
      paymentModel: "once",
      durationMinutes: 60,
      durationLabel: locale === "ru" ? "60 мин" : "60 min",
      participantMode: "solo",
      deliveryFormats: ["video"],
      requiredClientData: ["question"],
      methods: [],
      accessGrants: [],
      includedItems: [],
      modifiers: []
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function createMediaAssetStore(): MediaAssetStore {
  return {
    createUploadingAsset: vi.fn(async () => raise("Product routes should not create media assets")),
    findByOwnerAndId: vi.fn(async (input) =>
      input.ownerUserId === ownerUserId && input.mediaId === coverMediaId
        ? readyProductCoverMedia()
        : null
    ),
    markReady: vi.fn(async () => raise("Product routes should not complete media uploads")),
    markFailed: vi.fn(async () => raise("Product routes should not fail media uploads"))
  };
}

function readyProductCoverMedia(): MediaAsset {
  return {
    id: coverMediaId,
    ownerUserId,
    purpose: "product_cover",
    status: "ready",
    visibility: "public",
    storageBucket: "elevenhouse-local-media",
    storageKey: `${ownerUserId}/product_cover/${coverMediaId}/cover.webp`,
    originalFileName: "cover.webp",
    mimeType: "image/webp",
    sizeBytes: 1_250_000,
    checksumSha256: null,
    width: 1600,
    height: 900,
    altText: null,
    failureReason: null,
    variants: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function toProduct(id: string, input: ProductStoreCreateInput): Product {
  return {
    id,
    ownerUserId: input.ownerUserId,
    type: input.type,
    status: input.status,
    title: input.title,
    subtitle: input.subtitle,
    priceMinor: input.priceMinor,
    currency: input.currency,
    coverMediaId: input.coverMediaId,
    introVideoUrl: input.introVideoUrl,
    executionMode: input.executionMode,
    paymentModel: input.paymentModel,
    durationMinutes: input.durationMinutes,
    durationLabel: input.durationLabel,
    slaLabel: input.slaLabel,
    packageSessionCount: input.packageSessionCount,
    packageDiscountPercent: input.packageDiscountPercent,
    subscriptionPeriod: input.subscriptionPeriod,
    trialDays: input.trialDays,
    participantMode: input.participantMode,
    groupSize: input.groupSize,
    deliveryFormats: input.deliveryFormats,
    requiredClientData: input.requiredClientData,
    methods: input.methods,
    accessGrants: input.accessGrants,
    includedItems: input.includedItems.map((item, index) => ({
      id: `11111111-1111-4111-8111-11111111111${index}`,
      ...item
    })),
    modifiers: input.modifiers.map((modifier, index) => ({
      id: `22222222-2222-4222-8222-22222222222${index}`,
      ...modifier
    })),
    createdAt: input.now,
    updatedAt: input.now
  };
}

function nextProductId(index: number): string {
  return index === 0
    ? "463f34bb-38ec-4cb4-b105-2ed6de91e3cb"
    : "a47d6537-720b-47e4-a1ef-ed7ba82bb2f0";
}

function validCreateBody(): Record<string, unknown> {
  return {
    type: "single",
    title: "Натальный разбор",
    subtitle: "Полный разбор",
    priceMinor: 490000,
    currency: "RUB",
    coverMediaId,
    executionMode: "live",
    paymentModel: "once",
    durationMinutes: 60,
    durationLabel: "60 мин",
    participantMode: "solo",
    deliveryFormats: ["video"],
    requiredClientData: ["chart1"],
    methods: ["natal"],
    accessGrants: [],
    includedItems: [{ text: "Полный разбор карты", icon: "check", order: 10 }],
    modifiers: []
  };
}

function raise(message: string): never {
  throw new Error(message);
}
