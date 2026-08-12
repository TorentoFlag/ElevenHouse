import { createHash, randomUUID } from "node:crypto";
import { Client } from "pg";

import {
  createPendingClientSubscription,
  applyClientSubscriptionSourceEvent,
  applyInitialCapture,
  executeClientSubscriptionCreation,
  sealClientSubscriptionContract,
  type ClientSubscription,
  type CreateFinanceOrderRecordInput
} from "@elevenhouse/domain";

import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime, type PostgresRuntime } from "../../runtime";
import { clientAstrologerRelationships } from "../../schema/clients/client-astrologer-relationships.schema";
import { financePolicies } from "../../schema/finance/policies.schema";
import { users } from "../../schema/identity/accounts.schema";
import {
  platformTariffSeries,
  platformTariffVersions
} from "../../schema/platform-billing/tariff-authority.schema";
import { productAccessGrants } from "../../schema/products/product-access-grants.schema";
import { productDeliveryFormats } from "../../schema/products/product-delivery-formats.schema";
import { products } from "../../schema/products/products.schema";
import { readCurrentMigrationSql } from "../../testing/current-migration-sql";
import { createDrizzleOrderStore } from "../finance/drizzle-order-store";
import { createDrizzleClientSubscriptionCreationUnitOfWork } from "./drizzle-client-subscription-creation-uow";
import { createDrizzleClientSubscriptionSourceEventApplicationUnitOfWork } from "./drizzle-client-subscription-uow";

let nextFinancePolicyVersion = 10_000;

export type ClientSubscriptionIntegrationAuthority = Readonly<{
  clientUserId: string;
  astrologerUserId: string;
  productId: string;
  relationshipId: string;
  orderId: string;
}>;

export type ClientSubscriptionOrderPrerequisites = Readonly<{
  authority: ClientSubscriptionIntegrationAuthority;
  orderInput: CreateFinanceOrderRecordInput;
}>;

export type ClientSubscriptionIntegrationDatabase = Readonly<{
  runtime: PostgresRuntime;
  close: () => Promise<void>;
}>;

export type PendingClientSubscriptionFixture = Readonly<{
  authority: ClientSubscriptionIntegrationAuthority;
  subscription: ClientSubscription;
}>;

export type ActiveClientSubscriptionFixture = PendingClientSubscriptionFixture &
  Readonly<{ subscription: ClientSubscription; periodId: string }>;

export async function createClientSubscriptionIntegrationDatabase(): Promise<ClientSubscriptionIntegrationDatabase> {
  const baseDatabaseUrl = integrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
  const databaseName = `elevenhouse_client_subscription_${randomUUID().replaceAll("-", "")}`;
  const isolatedDatabaseUrl = withDatabaseName(baseDatabaseUrl, databaseName);
  const adminClient = new Client({ connectionString: baseDatabaseUrl });
  await adminClient.connect();
  await adminClient.query(`CREATE DATABASE "${databaseName}"`);
  const runtime = createPostgresRuntime({ DATABASE_URL: isolatedDatabaseUrl });
  await runtime.pool.query(readCurrentMigrationSql());
  return {
    runtime,
    close: async () => {
      try {
        await runtime.close();
        await adminClient.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      } finally {
        await adminClient.end();
      }
    }
  };
}

export async function seedClientSubscriptionPurchaseAuthority(
  runtime: PostgresRuntime
): Promise<ClientSubscriptionIntegrationAuthority> {
  const prerequisite = await seedClientSubscriptionOrderPrerequisites(runtime, "astro_diary");
  await createDrizzleOrderStore(runtime.database).create(prerequisite.orderInput);
  return prerequisite.authority;
}

export async function seedClientSubscriptionOrderPrerequisites(
  runtime: PostgresRuntime,
  purpose: "astro_diary" | "standard"
): Promise<ClientSubscriptionOrderPrerequisites> {
  const clientUserId = randomUUID();
  const astrologerUserId = randomUUID();
  const productId = randomUUID();
  const relationshipId = randomUUID();
  const policyId = randomUUID();
  const orderId = randomUUID();
  const tariffSeriesId = `client-subscription-${randomUUID()}`;
  const tariffDigest = sha256Value(tariffSeriesId);
  const policyVersion = nextFinancePolicyVersion++;
  const now = new Date("2026-01-01T00:00:00.000Z");

  await runtime.database.transaction(async (transaction) => {
    await transaction.insert(users).values([{ id: clientUserId }, { id: astrologerUserId }]);
    await transaction.insert(products).values({
      id: productId,
      ownerUserId: astrologerUserId,
      type: purpose === "astro_diary" ? "sub" : "async",
      status: "active",
      revision: 1,
      title: "AstroDiary integration",
      subtitle: null,
      priceMinor: 4_900,
      currency: "RUB",
      coverMediaId: null,
      introVideoUrl: null,
      executionMode: "async",
      paymentModel: purpose === "astro_diary" ? "sub" : "once",
      durationMinutes: null,
      durationLabel: null,
      slaLabel: null,
      packageSessionCount: null,
      packageDiscountPercent: null,
      subscriptionPeriod: purpose === "astro_diary" ? "month" : null,
      trialDays: null,
      participantMode: "solo",
      groupSize: null,
      astroDiaryReflectionCyclesPerPeriod: purpose === "astro_diary" ? 4 : null,
      astroDiaryResponseSlaWorkingDays: purpose === "astro_diary" ? 2 : null,
      astroDiaryClientResponseWindowCalendarDays: purpose === "astro_diary" ? 5 : null,
      astroDiaryWorkingWeekdaysMask: purpose === "astro_diary" ? 31 : null,
      astroDiaryServiceTimezone: purpose === "astro_diary" ? "Europe/Moscow" : null,
      createdAt: now,
      updatedAt: now
    });
    if (purpose === "astro_diary") {
      await transaction.insert(productAccessGrants).values({
        productId,
        value: "journal",
        order: 0
      });
      await transaction.insert(productDeliveryFormats).values([
        { productId, value: "chat", order: 0 },
        { productId, value: "audio", order: 1 },
        { productId, value: "file", order: 2 }
      ]);
    } else {
      await transaction.insert(productDeliveryFormats).values({
        productId,
        value: "text",
        order: 0
      });
    }
    await transaction.insert(clientAstrologerRelationships).values({
      id: relationshipId,
      clientUserId,
      astrologerUserId,
      source: "order",
      status: "active",
      firstLinkedAt: now,
      lastLinkedAt: now,
      archivedAt: null,
      blockedAt: null,
      createdAt: now,
      updatedAt: now
    });
    await transaction.insert(financePolicies).values({
      id: policyId,
      policyVersion,
      riskTier: "standard",
      holdDurationHours: 48,
      reserveBps: 0,
      reserveReleaseDelayDays: 0,
      providerSettlementRequired: true,
      isActive: false,
      createdByUserId: astrologerUserId,
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
      name: "Client subscription integration",
      tagline: "Client subscription integration",
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
      canonicalPreimage: "client-subscription-integration",
      canonicalDigest: tariffDigest,
      createdAt: now,
      publishedAt: now,
      retiredAt: null
    });
  });

  const orderInput: CreateFinanceOrderRecordInput = {
    id: orderId,
    clientUserId,
    astrologerUserId,
    productId,
    productTitleSnapshot: "AstroDiary integration",
    purchasePurpose:
      purpose === "astro_diary"
        ? {
            kind: "astro_diary_subscription",
            expectedProductRevision: 1,
            acceptedProduct: {
              productId,
              revision: 1,
              ownerUserId: astrologerUserId,
              status: "active",
              type: "sub",
              paymentModel: "sub",
              executionMode: "async",
              participantMode: "solo",
              priceMinor: 4_900,
              currency: "RUB",
              cadence: "month",
              trialDays: null,
              groupSize: null,
              packageSessionCount: null,
              accessGrants: ["journal"],
              deliveryFormats: ["chat", "audio", "file"],
              requiredClientData: [],
              methods: [],
              modifiers: [],
              astroDiaryConfig: {
                reflectionCyclesPerPeriod: 4,
                responseSlaWorkingDays: 2,
                clientResponseWindowCalendarDays: 5,
                workingWeekdays: [1, 2, 3, 4, 5],
                serviceTimezone: "Europe/Moscow"
              }
            },
            acceptedRelationship: {
              clientUserId,
              astrologerUserId,
              status: "active"
            }
          }
        : { kind: "standard", expectedProductRevision: 1 },
    directLinkIntentId: null,
    bookingId: null,
    status: "pending_payment",
    grossAmount: { amountMinor: 4_900, currency: "RUB" },
    platformFee: { amountMinor: 196, currency: "RUB" },
    astrologerNetAmount: { amountMinor: 4_704, currency: "RUB" },
    financePolicySnapshotId: policyId,
    financePolicyRiskTier: "standard",
    financePolicyHoldDurationHours: 48,
    financePolicyReserveBps: 0,
    financePolicyReserveReleaseDelayDays: 0,
    tariffSeriesId,
    tariffVersion: 1,
    tariffVersionDigest: tariffDigest,
    tariffCommissionBps: 400,
    financePolicyProviderSettlementRequired: true,
    now: now.toISOString()
  };
  return {
    authority: { clientUserId, astrologerUserId, productId, relationshipId, orderId },
    orderInput
  };
}

export async function createPendingClientSubscriptionFixture(
  runtime: PostgresRuntime
): Promise<PendingClientSubscriptionFixture> {
  const authority = await seedClientSubscriptionPurchaseAuthority(runtime);
  const subscriptionId = randomUUID();
  const contractId = randomUUID();
  const journalEpochId = randomUUID();
  const result = await executeClientSubscriptionCreation(
    createDrizzleClientSubscriptionCreationUnitOfWork(runtime.database),
    {
      subscriptionId,
      orderId: authority.orderId,
      productId: authority.productId,
      relationshipId: authority.relationshipId,
      expectedSlotVersion: 0,
      idempotencyKey: `create-${randomUUID()}`,
      request: { contractId, journalEpochId }
    },
    (locked) => {
      const sealed = sealClientSubscriptionContract({
        contractId,
        order: locked.order,
        product: locked.product,
        relationship: locked.relationship,
        createdAt: "2026-01-01T00:00:00.000Z"
      });
      if (sealed.outcome === "rejected") return sealed;
      return {
        outcome: "created",
        contract: sealed.contract,
        subscription: createPendingClientSubscription({
          subscriptionId,
          journalEpochId,
          contract: sealed.contract
        })
      };
    }
  );
  if (result.outcome !== "created") {
    throw new Error(`Expected pending client subscription fixture, received ${result.outcome}`);
  }
  return { authority, subscription: result.subscription };
}

export async function createActiveClientSubscriptionFixture(
  runtime: PostgresRuntime,
  capturedAt = "2026-01-31T07:30:00.000Z"
): Promise<ActiveClientSubscriptionFixture> {
  const pending = await createPendingClientSubscriptionFixture(runtime);
  const sourceEventId = randomUUID();
  const evidenceId = randomUUID();
  const periodId = randomUUID();
  const result = await applyClientSubscriptionSourceEvent(
    createDrizzleClientSubscriptionSourceEventApplicationUnitOfWork(runtime.database),
    {
      subscriptionId: pending.subscription.id,
      expectedVersion: pending.subscription.version,
      sourceEventId,
      sourceEventDigest: sha256Value(sourceEventId),
      evidenceId
    },
    (current) =>
      applyInitialCapture(current, {
        sourceEventId,
        evidenceId,
        capturedAt,
        periodId,
        eventIds: [randomUUID(), randomUUID()]
      })
  );
  if (result.outcome !== "applied") {
    throw new Error(`Expected active client subscription fixture, received ${result.outcome}`);
  }
  return { authority: pending.authority, subscription: result.subscription, periodId };
}

export function sha256Fixture(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
}

function sha256Value(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function integrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}

function withDatabaseName(databaseUrl: string, targetDatabaseName: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${targetDatabaseName}`;
  return url.toString();
}
