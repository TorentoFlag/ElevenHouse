import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PostgresRuntime } from "../../runtime";
import {
  clientAstrologerRelationships,
  financePolicies,
  orders,
  paymentAttempts,
  platformTariffSeries,
  platformTariffVersions,
  products,
  users
} from "../../schema";
import {
  createClientSubscriptionIntegrationDatabase,
  type ClientSubscriptionIntegrationDatabase
} from "../client-subscriptions/client-subscription-integration-fixture";
import { createDrizzleFinanceClientServiceWorkSummaryReader } from "./drizzle-finance-client-service-work-summary-reader";

describe.sequential("Drizzle finance client service-work summary reader", () => {
  let integration: ClientSubscriptionIntegrationDatabase;
  let runtime: PostgresRuntime;

  beforeAll(async () => {
    integration = await createClientSubscriptionIntegrationDatabase();
    runtime = integration.runtime;
  }, 60_000);

  afterAll(async () => {
    await integration?.close();
  }, 30_000);

  it("returns bounded owner-client orders and payments without provider, policy, or inactive relationship data", async () => {
    const fixture = await seedFinanceSummaryFixture(runtime);
    const reader = createDrizzleFinanceClientServiceWorkSummaryReader(runtime.database);

    await expect(
      reader.listClientServiceWorkFinance({
        ownerUserId: fixture.ownerUserId,
        clientUserId: fixture.clientUserId,
        now: "2026-08-20T10:00:00.000Z",
        limit: 5
      })
    ).resolves.toEqual({
      orders: {
        recentTotal: 4,
        recent: [
          {
            id: fixture.orderIds.sameTimeHigh,
            status: "paid",
            productTitle: "Finance CRM consultation",
            amountMinor: 12000,
            currency: "RUB",
            bookingId: null,
            createdAt: "2026-08-19T11:00:00.000Z",
            updatedAt: "2026-08-19T11:00:00.000Z"
          },
          {
            id: fixture.orderIds.sameTimeLow,
            status: "paid",
            productTitle: "Finance CRM consultation",
            amountMinor: 12000,
            currency: "RUB",
            bookingId: null,
            createdAt: "2026-08-19T11:00:00.000Z",
            updatedAt: "2026-08-19T11:00:00.000Z"
          },
          {
            id: fixture.orderIds.older,
            status: "fulfilled",
            productTitle: "Finance CRM consultation",
            amountMinor: 12000,
            currency: "RUB",
            bookingId: null,
            createdAt: "2026-08-18T10:00:00.000Z",
            updatedAt: "2026-08-18T10:00:00.000Z"
          }
        ]
      },
      payments: {
        recentTotal: 4,
        recent: [
          {
            id: fixture.paymentIds.sameTimeHigh,
            orderId: fixture.orderIds.sameTimeHigh,
            status: "captured",
            amountMinor: 12000,
            currency: "RUB",
            createdAt: "2026-08-19T12:00:00.000Z",
            updatedAt: "2026-08-19T12:00:00.000Z"
          },
          {
            id: fixture.paymentIds.sameTimeLow,
            orderId: fixture.orderIds.sameTimeLow,
            status: "captured",
            amountMinor: 12000,
            currency: "RUB",
            createdAt: "2026-08-19T12:00:00.000Z",
            updatedAt: "2026-08-19T12:00:00.000Z"
          },
          {
            id: fixture.paymentIds.older,
            orderId: fixture.orderIds.older,
            status: "settled",
            amountMinor: 12000,
            currency: "RUB",
            createdAt: "2026-08-18T12:00:00.000Z",
            updatedAt: "2026-08-18T12:00:00.000Z"
          }
        ]
      }
    });

    const json = JSON.stringify(
      await reader.listClientServiceWorkFinance({
        ownerUserId: fixture.ownerUserId,
        clientUserId: fixture.clientUserId,
        now: "2026-08-20T10:00:00.000Z",
        limit: 3
      })
    );
    expect(json).not.toMatch(
      /providerPaymentId|providerCheckoutId|provider|metadata|financePolicy|ledger|payout/i
    );
    expect(json).not.toContain("/finance?orderId=");

    await expect(
      reader.listClientServiceWorkFinance({
        ownerUserId: fixture.ownerUserId,
        clientUserId: fixture.blockedClientUserId,
        now: "2026-08-20T10:00:00.000Z",
        limit: 3
      })
    ).resolves.toEqual({
      orders: { recentTotal: 0, recent: [] },
      payments: { recentTotal: 0, recent: [] }
    });

    await expect(
      reader.listClientServiceWorkFinance({
        ownerUserId: fixture.ownerUserId,
        clientUserId: fixture.archivedClientUserId,
        now: "2026-08-20T10:00:00.000Z",
        limit: 3
      })
    ).resolves.toEqual({
      orders: { recentTotal: 0, recent: [] },
      payments: { recentTotal: 0, recent: [] }
    });

    await expect(
      reader.listClientServiceWorkFinance({
        ownerUserId: fixture.foreignOwnerUserId,
        clientUserId: fixture.clientUserId,
        now: "2026-08-20T10:00:00.000Z",
        limit: 3
      })
    ).resolves.toEqual({
      orders: { recentTotal: 0, recent: [] },
      payments: { recentTotal: 0, recent: [] }
    });

    await expect(
      reader.listClientServiceWorkFinance({
        ownerUserId: fixture.ownerUserId,
        clientUserId: fixture.foreignClientUserId,
        now: "2026-08-20T10:00:00.000Z",
        limit: 3
      })
    ).resolves.toEqual({
      orders: { recentTotal: 0, recent: [] },
      payments: { recentTotal: 0, recent: [] }
    });
  });
});

async function seedFinanceSummaryFixture(runtime: PostgresRuntime) {
  const ownerUserId = randomUUID();
  const foreignOwnerUserId = randomUUID();
  const clientUserId = randomUUID();
  const foreignClientUserId = randomUUID();
  const blockedClientUserId = randomUUID();
  const archivedClientUserId = randomUUID();
  const productId = randomUUID();
  const foreignOwnerProductId = randomUUID();
  const policyId = randomUUID();
  const tariffSeriesId = `finance-crm-${randomUUID()}`;
  const tariffDigest = sha256Value(tariffSeriesId);
  const now = new Date("2026-08-20T09:00:00.000Z");
  const orderIds = {
    sameTimeHigh: "00000000-0000-4000-8000-00000000000f",
    sameTimeLow: "00000000-0000-4000-8000-00000000000e",
    older: "00000000-0000-4000-8000-00000000000d",
    oldest: "00000000-0000-4000-8000-00000000000c",
    blocked: "00000000-0000-4000-8000-00000000000b",
    archived: "00000000-0000-4000-8000-00000000000a",
    foreignOwner: "00000000-0000-4000-8000-000000000009",
    foreignClient: "00000000-0000-4000-8000-000000000008"
  } as const;
  const paymentIds = {
    sameTimeHigh: "10000000-0000-4000-8000-00000000000f",
    sameTimeLow: "10000000-0000-4000-8000-00000000000e",
    older: "10000000-0000-4000-8000-00000000000d",
    oldest: "10000000-0000-4000-8000-00000000000c",
    blocked: "10000000-0000-4000-8000-00000000000b",
    archived: "10000000-0000-4000-8000-00000000000a",
    foreignOwner: "10000000-0000-4000-8000-000000000009",
    foreignClient: "10000000-0000-4000-8000-000000000008"
  } as const;

  await runtime.database.transaction(async (transaction) => {
    await transaction
      .insert(users)
      .values([
        { id: ownerUserId },
        { id: foreignOwnerUserId },
        { id: clientUserId },
        { id: foreignClientUserId },
        { id: blockedClientUserId },
        { id: archivedClientUserId }
      ]);
    await transaction
      .insert(clientAstrologerRelationships)
      .values([
        relationship({ astrologerUserId: ownerUserId, clientUserId, status: "active" }),
        relationship({
          astrologerUserId: ownerUserId,
          clientUserId: blockedClientUserId,
          status: "blocked"
        }),
        relationship({
          astrologerUserId: ownerUserId,
          clientUserId: archivedClientUserId,
          status: "archived"
        })
      ]);
    await transaction
      .insert(products)
      .values([
        product({ id: productId, ownerUserId, now }),
        product({ id: foreignOwnerProductId, ownerUserId: foreignOwnerUserId, now })
      ]);
    await transaction.insert(financePolicies).values({
      id: policyId,
      policyVersion: 71_001,
      riskTier: "standard",
      holdDurationHours: 48,
      reserveBps: 0,
      reserveReleaseDelayDays: 0,
      providerSettlementRequired: true,
      isActive: false,
      createdByUserId: ownerUserId,
      snapshottedAt: now,
      createdAt: now
    });
    await transaction.insert(platformTariffSeries).values({
      id: tariffSeriesId,
      code: tariffSeriesId,
      createdAt: now,
      retiredAt: null
    });
    await transaction.insert(platformTariffVersions).values({
      tariffSeriesId,
      version: 1,
      draftRevision: 1,
      lifecycle: "published",
      name: "Finance CRM integration",
      tagline: "Finance CRM integration",
      monthlyPriceMinor: 1_000,
      yearlyPriceMinor: 10_000,
      monthlyRecurringFrequencyDays: 30,
      yearlyRecurringFrequencyDays: 365,
      currency: "RUB",
      clientSaleCommissionBps: 400,
      seatsLimit: null,
      bookingsLimit: null,
      aiRequestsLimit: null,
      automationLimit: null,
      isPopular: false,
      displayOrder: 1,
      canonicalPreimage: "finance-crm-integration",
      canonicalDigest: tariffDigest,
      createdAt: now,
      publishedAt: now,
      retiredAt: null
    });
    await transaction.insert(orders).values([
      order({
        id: orderIds.sameTimeHigh,
        clientUserId,
        astrologerUserId: ownerUserId,
        productId,
        policyId,
        tariffSeriesId,
        tariffDigest,
        status: "paid",
        createdAt: "2026-08-19T11:00:00.000Z"
      }),
      order({
        id: orderIds.sameTimeLow,
        clientUserId,
        astrologerUserId: ownerUserId,
        productId,
        policyId,
        tariffSeriesId,
        tariffDigest,
        status: "paid",
        createdAt: "2026-08-19T11:00:00.000Z"
      }),
      order({
        id: orderIds.older,
        clientUserId,
        astrologerUserId: ownerUserId,
        productId,
        policyId,
        tariffSeriesId,
        tariffDigest,
        status: "fulfilled",
        createdAt: "2026-08-18T10:00:00.000Z"
      }),
      order({
        id: orderIds.oldest,
        clientUserId,
        astrologerUserId: ownerUserId,
        productId,
        policyId,
        tariffSeriesId,
        tariffDigest,
        status: "paid",
        createdAt: "2026-08-17T10:00:00.000Z"
      }),
      order({
        id: orderIds.blocked,
        clientUserId: blockedClientUserId,
        astrologerUserId: ownerUserId,
        productId,
        policyId,
        tariffSeriesId,
        tariffDigest,
        status: "paid",
        createdAt: "2026-08-19T10:00:00.000Z"
      }),
      order({
        id: orderIds.archived,
        clientUserId: archivedClientUserId,
        astrologerUserId: ownerUserId,
        productId,
        policyId,
        tariffSeriesId,
        tariffDigest,
        status: "paid",
        createdAt: "2026-08-19T10:00:00.000Z"
      }),
      order({
        id: orderIds.foreignOwner,
        clientUserId,
        astrologerUserId: foreignOwnerUserId,
        productId: foreignOwnerProductId,
        policyId,
        tariffSeriesId,
        tariffDigest,
        status: "paid",
        createdAt: "2026-08-19T10:00:00.000Z"
      }),
      order({
        id: orderIds.foreignClient,
        clientUserId: foreignClientUserId,
        astrologerUserId: ownerUserId,
        productId,
        policyId,
        tariffSeriesId,
        tariffDigest,
        status: "paid",
        createdAt: "2026-08-19T10:00:00.000Z"
      })
    ]);
    await transaction.insert(paymentAttempts).values([
      payment({
        id: paymentIds.sameTimeHigh,
        orderId: orderIds.sameTimeHigh,
        status: "captured",
        createdAt: "2026-08-19T12:00:00.000Z"
      }),
      payment({
        id: paymentIds.sameTimeLow,
        orderId: orderIds.sameTimeLow,
        status: "captured",
        createdAt: "2026-08-19T12:00:00.000Z"
      }),
      payment({
        id: paymentIds.older,
        orderId: orderIds.older,
        status: "settled",
        createdAt: "2026-08-18T12:00:00.000Z"
      }),
      payment({
        id: paymentIds.oldest,
        orderId: orderIds.oldest,
        status: "captured",
        createdAt: "2026-08-17T12:00:00.000Z"
      }),
      payment({
        id: paymentIds.blocked,
        orderId: orderIds.blocked,
        status: "captured",
        createdAt: "2026-08-19T10:00:00.000Z"
      }),
      payment({
        id: paymentIds.archived,
        orderId: orderIds.archived,
        status: "captured",
        createdAt: "2026-08-19T10:00:00.000Z"
      }),
      payment({
        id: paymentIds.foreignOwner,
        orderId: orderIds.foreignOwner,
        status: "captured",
        createdAt: "2026-08-19T10:00:00.000Z"
      }),
      payment({
        id: paymentIds.foreignClient,
        orderId: orderIds.foreignClient,
        status: "captured",
        createdAt: "2026-08-19T10:00:00.000Z"
      })
    ]);
  });

  return {
    ownerUserId,
    foreignOwnerUserId,
    clientUserId,
    foreignClientUserId,
    blockedClientUserId,
    archivedClientUserId,
    orderIds,
    paymentIds
  };
}

function relationship(input: {
  readonly astrologerUserId: string;
  readonly clientUserId: string;
  readonly status: "active" | "blocked" | "archived";
}) {
  const now = new Date("2026-08-20T09:00:00.000Z");
  return {
    id: randomUUID(),
    astrologerUserId: input.astrologerUserId,
    clientUserId: input.clientUserId,
    source: "order",
    status: input.status,
    firstLinkedAt: now,
    lastLinkedAt: now,
    archivedAt: input.status === "archived" ? now : null,
    blockedAt: input.status === "blocked" ? now : null,
    createdAt: now,
    updatedAt: now
  };
}

function product(input: { readonly id: string; readonly ownerUserId: string; readonly now: Date }) {
  return {
    id: input.id,
    ownerUserId: input.ownerUserId,
    type: "single",
    status: "active",
    revision: 1,
    title: "Finance CRM consultation",
    subtitle: null,
    priceMinor: 12000,
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
    astroDiaryReflectionCyclesPerPeriod: null,
    astroDiaryResponseSlaWorkingDays: null,
    astroDiaryClientResponseWindowCalendarDays: null,
    astroDiaryWorkingWeekdaysMask: null,
    astroDiaryServiceTimezone: null,
    createdAt: input.now,
    updatedAt: input.now
  };
}

function order(input: {
  readonly id: string;
  readonly clientUserId: string;
  readonly astrologerUserId: string;
  readonly productId: string;
  readonly policyId: string;
  readonly tariffSeriesId: string;
  readonly tariffDigest: string;
  readonly status: "paid" | "fulfilled";
  readonly createdAt: string;
}) {
  const occurredAt = new Date(input.createdAt);
  return {
    id: input.id,
    clientUserId: input.clientUserId,
    astrologerUserId: input.astrologerUserId,
    productId: input.productId,
    productTitleSnapshot: "Finance CRM consultation",
    directLinkIntentId: null,
    bookingId: null,
    status: input.status,
    grossAmountMinor: 12000,
    grossCurrency: "RUB",
    platformFeeAmountMinor: 480,
    platformFeeCurrency: "RUB",
    astrologerNetAmountMinor: 11520,
    astrologerNetCurrency: "RUB",
    financePolicySnapshotId: input.policyId,
    financePolicyRiskTier: "standard",
    financePolicyHoldDurationHours: 48,
    financePolicyReserveBps: 0,
    financePolicyReserveReleaseDelayDays: 0,
    tariffSeriesId: input.tariffSeriesId,
    tariffVersion: 1,
    tariffVersionDigest: input.tariffDigest,
    tariffCommissionBps: 400,
    financePolicyProviderSettlementRequired: true,
    createdAt: occurredAt,
    updatedAt: occurredAt
  };
}

function payment(input: {
  readonly id: string;
  readonly orderId: string;
  readonly status: "captured" | "settled";
  readonly createdAt: string;
}) {
  const occurredAt = new Date(input.createdAt);
  return {
    id: input.id,
    orderId: input.orderId,
    provider: "arc_pay",
    status: input.status,
    amountMinor: 12000,
    currency: "RUB",
    providerPaymentId: `provider-payment-${input.id}`,
    providerCheckoutId: `provider-checkout-${input.id}`,
    idempotencyKey: `payment-${input.id}`,
    metadata: { privateProviderPayload: true },
    createdAt: occurredAt,
    updatedAt: occurredAt
  };
}

function sha256Value(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
