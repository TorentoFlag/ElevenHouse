import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import type {
  AuthSessionAuthenticationStore,
  AvailabilityStore,
  ClientAstrologerRelationshipReader,
  FinancePolicyStore,
  PlatformTariffEntitlementStore,
  Product,
  ProductStore
} from "@elevenhouse/domain";
import { createPlatformTariffDraft } from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SystemClock } from "../../common/system-clock.js";
import { PublicSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import { AUTH_SESSION_AUTHENTICATION_STORE } from "../identity/auth/identity-auth.tokens";
import { IdentityCurrentSessionService } from "../identity/session/identity-current-session.service";
import { ClientCommerceController } from "./client-commerce.controller";
import { ClientCommerceService } from "./client-commerce.service";
import {
  CLIENT_COMMERCE_AVAILABILITY_STORE,
  CLIENT_COMMERCE_FINANCE_POLICY_STORE,
  CLIENT_COMMERCE_PRODUCT_STORE,
  CLIENT_COMMERCE_RELATIONSHIP_READER,
  CLIENT_COMMERCE_TARIFF_AUTHORITY_STORE
} from "./client-commerce.tokens";

const now = new Date("2026-08-05T10:00:00.000Z");
const sessionCookieName = "elevenhouse_public_session";
const sessionToken = "client-commerce-e2e-session";
const clientUserId = "11111111-1111-4111-8111-111111111111";
const astrologerUserId = "22222222-2222-4222-8222-222222222222";
const productId = "33333333-3333-4333-8333-333333333333";

let app: INestApplication;
let moduleRef: TestingModule;
let baseUrl: string;
let relationshipReader: ClientAstrologerRelationshipReader;
let relationshipAllowed: boolean;
let productStore: Pick<ProductStore, "listByOwner">;
let listedProducts: readonly Product[];

describe("client commerce public HTTP flow", () => {
  beforeEach(async () => {
    relationshipAllowed = true;
    listedProducts = [activeProduct];
    relationshipReader = { hasActiveRelationship: vi.fn(async () => relationshipAllowed) };
    productStore = {
      listByOwner: vi.fn(async () => ({
        products: listedProducts,
        total: listedProducts.length,
        counts: { all: listedProducts.length, active: listedProducts.length, draft: 0, archived: 0 }
      }))
    };
    moduleRef = await Test.createTestingModule({
      controllers: [ClientCommerceController],
      providers: [
        ClientCommerceService,
        PublicSessionAuthGuard,
        IdentityCurrentSessionService,
        { provide: SystemClock, useValue: { now: () => now } },
        { provide: ConfigService, useValue: configService() },
        { provide: AUTH_SESSION_AUTHENTICATION_STORE, useValue: authStore() },
        { provide: CLIENT_COMMERCE_RELATIONSHIP_READER, useValue: relationshipReader },
        { provide: CLIENT_COMMERCE_PRODUCT_STORE, useValue: productStore },
        { provide: CLIENT_COMMERCE_TARIFF_AUTHORITY_STORE, useValue: tariffAuthority() },
        { provide: CLIENT_COMMERCE_FINANCE_POLICY_STORE, useValue: financePolicies() },
        { provide: CLIENT_COMMERCE_AVAILABILITY_STORE, useValue: {} as AvailabilityStore }
      ]
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterEach(async () => {
    await app.close();
    await moduleRef.close();
  });

  it("requires a client session before exposing relationship-scoped purchase options", async () => {
    await expect(getPurchaseOptions()).resolves.toMatchObject({ status: 401 });
    expect(productStore.listByOwner).not.toHaveBeenCalled();
  });

  it("does not enumerate products when no active relationship exists", async () => {
    relationshipAllowed = false;

    await expect(getPurchaseOptions(authCookie())).resolves.toMatchObject({ status: 404 });
    expect(productStore.listByOwner).not.toHaveBeenCalled();
  });

  it("returns supported purchase options only to the linked client", async () => {
    await expect(getPurchaseOptions(authCookie())).resolves.toMatchObject({
      status: 200,
      body: { astrologerUserId, products: [expect.objectContaining({ id: productId, priceMinor: 50_000 })] }
    });
  });

  it("omits incomplete products instead of failing the entire purchase-options response", async () => {
    listedProducts = [
      activeProduct,
      { ...activeProduct, id: "99999999-9999-4999-8999-999999999999", deliveryFormats: [] }
    ];

    await expect(getPurchaseOptions(authCookie())).resolves.toMatchObject({
      status: 200,
      body: { astrologerUserId, products: [expect.objectContaining({ id: productId })] }
    });
  });
});

async function getPurchaseOptions(cookie?: string) {
  const response = await fetch(`${baseUrl}/me/astrologers/${astrologerUserId}/purchase-options`, {
    headers: cookie ? { cookie } : {}
  });
  return { status: response.status, body: await response.json() };
}

function authCookie(): string { return `${sessionCookieName}=${sessionToken}`; }

function authStore(): AuthSessionAuthenticationStore {
  return {
    findByTokenHash: vi.fn(async (tokenHash: string) => ({
      session: { id: "44444444-4444-4444-8444-444444444444", userId: clientUserId, tokenHash, status: "active" as const, createdAt: now.toISOString(), expiresAt: "2026-09-01T00:00:00.000Z" },
      user: { id: clientUserId, status: "active" as const, createdAt: now.toISOString(), updatedAt: now.toISOString() },
      roleAssignments: [{ id: "55555555-5555-4555-8555-555555555555", userId: clientUserId, role: "client" as const, assignedAt: now.toISOString() }]
    }))
  };
}

function configService(): Pick<ConfigService, "getOrThrow"> {
  return { getOrThrow: vi.fn((key: string) => {
    if (key === "publicApi.sessionCookieName") return sessionCookieName;
    throw new Error(`Unexpected config key: ${key}`);
  }) };
}

function tariffAuthority(): PlatformTariffEntitlementStore {
  const tariff = { ...createPlatformTariffDraft({ tariffSeriesId: "pro", version: 1, name: "Pro", tagline: "Pro", monthlyPriceMinor: 2_500, yearlyPriceMinor: 25_000, monthlyRecurringFrequencyDays: 31, yearlyRecurringFrequencyDays: 365, clientSaleCommissionBps: 800, seatsLimit: 1, bookingsLimit: null, aiRequestsLimit: null, automationLimit: null, isPopular: false, displayOrder: 0, features: ["products"] }), lifecycle: "published" as const };
  return {
    findCurrentSubscription: vi.fn(async () => ({ subscriptionId: "66666666-6666-4666-8666-666666666666", ownerUserId: astrologerUserId, tariffSeriesId: tariff.tariffSeriesId, tariffVersion: tariff.version, tariffVersionDigest: tariff.canonicalDigest, commissionBpsSnapshot: tariff.clientSaleCommissionBps, version: 1, state: "active" as const, startsAt: "2026-08-01T00:00:00.000Z", endsAt: "2026-09-01T00:00:00.000Z" })),
    findTariffVersion: vi.fn(async () => tariff), findLatestHistoricalCapabilityGrant: vi.fn(async () => null)
  };
}

function financePolicies(): Pick<FinancePolicyStore, "findEffectivePolicyForAstrologer"> {
  return { findEffectivePolicyForAstrologer: vi.fn(async () => ({ policyId: "77777777-7777-4777-8777-777777777777", policyVersion: 1, riskTier: "standard" as const, baseRiskTier: "standard" as const, profile: null, holdDurationHours: 48, reserveBps: 0, reserveReleaseDelayDays: 0, providerSettlementRequired: true })) };
}

const activeProduct: Product = {
  id: productId, ownerUserId: astrologerUserId, type: "single", status: "active", title: "Natal reading", subtitle: null, priceMinor: 50_000, currency: "RUB", coverMediaId: null, introVideoUrl: null, executionMode: "async", paymentModel: "once", durationMinutes: null, durationLabel: null, slaLabel: null, packageSessionCount: null, packageDiscountPercent: null, subscriptionPeriod: null, trialDays: null, participantMode: "solo", groupSize: null, deliveryFormats: ["text"], requiredClientData: [], methods: [], accessGrants: [], includedItems: [], modifiers: [], createdAt: now.toISOString(), updatedAt: now.toISOString()
};
