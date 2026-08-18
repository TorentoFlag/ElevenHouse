import "reflect-metadata";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  EffectiveFinancePolicy,
  PlatformTariffSubscriptionSnapshot,
  PlatformTariffVersion,
  Product
} from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SystemClock } from "../../common/system-clock.js";
import { PublicSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import { ClientCommerceController } from "./client-commerce.controller";
import { ClientCommerceService } from "./client-commerce.service";
import {
  CLIENT_COMMERCE_AVAILABILITY_STORE,
  CLIENT_COMMERCE_FINANCE_POLICY_STORE,
  CLIENT_COMMERCE_PRODUCT_STORE,
  CLIENT_COMMERCE_RELATIONSHIP_READER,
  CLIENT_COMMERCE_TARIFF_AUTHORITY_STORE
} from "./client-commerce.tokens";

const clientUserId = "10000000-0000-4000-8000-000000000001";
const astrologerUserId = "10000000-0000-4000-8000-000000000002";
const diaryProductId = "10000000-0000-4000-8000-000000000003";

describe("client commerce HTTP API", () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeEach(async () => {
    const builder = Test.createTestingModule({
      controllers: [ClientCommerceController],
      providers: [
        ClientCommerceService,
        { provide: SystemClock, useValue: { now: () => new Date("2026-08-18T10:00:00Z") } },
        {
          provide: CLIENT_COMMERCE_RELATIONSHIP_READER,
          useValue: { hasActiveRelationship: async () => true }
        },
        {
          provide: CLIENT_COMMERCE_PRODUCT_STORE,
          useValue: {
            listByOwner: async () => ({
              products: [astroDiaryProduct(), genericSubscription()],
              total: 2
            }),
            findByOwnerAndId: async () => null
          }
        },
        {
          provide: CLIENT_COMMERCE_TARIFF_AUTHORITY_STORE,
          useValue: {
            findCurrentSubscription: async () => tariffSubscription,
            findTariffVersion: async () => productsTariff,
            findLatestHistoricalCapabilityGrant: async () => null
          }
        },
        {
          provide: CLIENT_COMMERCE_FINANCE_POLICY_STORE,
          useValue: { findEffectivePolicyForAstrologer: async () => financePolicy }
        },
        { provide: CLIENT_COMMERCE_AVAILABILITY_STORE, useValue: {} }
      ]
    });
    builder.overrideGuard(PublicSessionAuthGuard).useValue({
      canActivate(context: { switchToHttp(): { getRequest(): Record<string, unknown> } }) {
        context.switchToHttp().getRequest().currentCustomerAccount = {
          account: { id: clientUserId, status: "active", roles: ["client"] }
        };
        return true;
      }
    });
    const moduleRef = await builder.compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("lists the canonical AstroDiary one-time paid-period product without exposing a generic subscription", async () => {
    const response = await fetch(`${baseUrl}/me/astrologers/${astrologerUserId}/purchase-options`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      astrologerUserId,
      products: [{ id: diaryProductId, paymentModel: "once", type: "async" }]
    });
  });
});

const tariffSubscription = Object.freeze({
  subscriptionId: "10000000-0000-4000-8000-000000000004",
  ownerUserId: astrologerUserId,
  tariffSeriesId: "task8-products",
  tariffVersion: 1,
  tariffVersionDigest: `sha256:${"a".repeat(64)}`,
  commissionBpsSnapshot: 400,
  version: 1,
  state: "active",
  startsAt: "2026-01-01T00:00:00.000Z",
  endsAt: "2027-01-01T00:00:00.000Z"
} satisfies PlatformTariffSubscriptionSnapshot);

const productsTariff = Object.freeze({
  tariffSeriesId: tariffSubscription.tariffSeriesId,
  version: tariffSubscription.tariffVersion,
  draftRevision: 1,
  lifecycle: "published",
  name: "Task 8 Products",
  tagline: "Task 8 Products",
  monthlyPriceMinor: 0,
  yearlyPriceMinor: 0,
  monthlyRecurringFrequencyDays: null,
  yearlyRecurringFrequencyDays: null,
  clientSaleCommissionBps: tariffSubscription.commissionBpsSnapshot,
  seatsLimit: 1,
  bookingsLimit: null,
  aiRequestsLimit: null,
  automationLimit: null,
  isPopular: false,
  displayOrder: 1,
  features: ["products"],
  canonicalDigest: tariffSubscription.tariffVersionDigest
} satisfies PlatformTariffVersion);

const financePolicy = Object.freeze({
  policyId: "task8-policy",
  policyVersion: 1,
  riskTier: "standard",
  baseRiskTier: "standard",
  holdDurationHours: 48,
  reserveBps: 0,
  reserveReleaseDelayDays: 0,
  providerSettlementRequired: true,
  profile: null
} satisfies EffectiveFinancePolicy);

function astroDiaryProduct(): Product {
  return {
    ...productBase(),
    id: diaryProductId,
    type: "async",
    paymentModel: "once",
    executionMode: "async",
    participantMode: "solo",
    subscriptionPeriod: "month",
    deliveryFormats: ["chat", "audio", "file"],
    accessGrants: ["journal"],
    astroDiaryConfig: {
      reflectionCyclesPerPeriod: 4,
      responseSlaWorkingDays: 2,
      clientResponseWindowCalendarDays: 7,
      workingWeekdays: [1, 2, 3, 4, 5],
      serviceTimezone: "Europe/Moscow"
    }
  };
}

function genericSubscription(): Product {
  return {
    ...productBase(),
    id: "10000000-0000-4000-8000-000000000005",
    type: "sub",
    paymentModel: "sub",
    executionMode: "async",
    participantMode: "solo",
    subscriptionPeriod: "month",
    deliveryFormats: ["chat"],
    accessGrants: ["content"],
    astroDiaryConfig: null
  };
}

function productBase(): Product {
  return {
    id: diaryProductId,
    ownerUserId: astrologerUserId,
    type: "single",
    status: "active",
    revision: 2,
    title: "Task 8 AstroDiary",
    subtitle: null,
    priceMinor: 150_000,
    currency: "RUB",
    coverMediaId: null,
    introVideoUrl: null,
    executionMode: "live",
    paymentModel: "once",
    durationMinutes: null,
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
    createdAt: "2026-08-18T10:00:00.000Z",
    updatedAt: "2026-08-18T10:00:00.000Z"
  };
}
