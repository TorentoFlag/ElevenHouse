import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createPendingClientSubscription,
  endSubscriptionAtPaidBoundary,
  executeClientSubscriptionCommand,
  executeClientSubscriptionCreation,
  requestRenewalCharge,
  sealClientSubscriptionContract,
  type ClientSubscription,
  type CreateFinanceOrderRecordInput
} from "@elevenhouse/domain";
import {
  createFinanceClientOrderCaptureDispatchReceipt,
  createFinanceClientSubscriptionCaptureAppliedEvent,
  sealFinanceClientOrderSubscriptionCaptureAuthority
} from "@elevenhouse/domain/finance-core";

import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime, type PostgresRuntime } from "../../runtime";
import {
  astroDiaryEventDeliveries,
  astroDiaryEvents,
  astroDiaryJournals,
  astroDiarySubscriptionActivationReceipts
} from "../../schema/astro-diary";
import { clientEntitlementGrants, clientSubscriptions } from "../../schema/client-subscriptions";
import { clientAstrologerRelationships } from "../../schema/clients/client-astrologer-relationships.schema";
import { financePolicies } from "../../schema/finance/policies.schema";
import { users } from "../../schema/identity/accounts.schema";
import { outboxEvents } from "../../schema/outbox/outbox-events.schema";
import {
  platformTariffSeries,
  platformTariffVersions
} from "../../schema/platform-billing/tariff-authority.schema";
import { productAccessGrants } from "../../schema/products/product-access-grants.schema";
import { productDeliveryFormats } from "../../schema/products/product-delivery-formats.schema";
import { products } from "../../schema/products/products.schema";
import { createDrizzleClientSubscriptionCreationUnitOfWork } from "../client-subscriptions/drizzle-client-subscription-creation-uow";
import { createDrizzleClientSubscriptionCommandUnitOfWork } from "../client-subscriptions/drizzle-client-subscription-uow";
import { createDrizzleOrderStore } from "../finance/drizzle-order-store";
import { createDrizzleAstroDiaryJournalReader } from "./drizzle-astro-diary-journal-reader";
import { applyDrizzleAstroDiarySubscriptionCaptureInTransaction } from "./drizzle-astro-diary-subscription-activation";

type PurchaseAuthority = Readonly<{
  clientUserId: string;
  astrologerUserId: string;
  productId: string;
  relationshipId: string;
  orderId: string;
}>;

type PendingFixture = Readonly<{
  authority: PurchaseAuthority;
  orderInput: CreateFinanceOrderRecordInput;
  subscription: ClientSubscription;
}>;

let nextPolicyVersion = 20_000;

describe.sequential("Drizzle AstroDiary atomic paid activation", () => {
  let runtime: PostgresRuntime;
  let closeDatabase: () => Promise<void>;

  beforeAll(async () => {
    const integration = await createIntegrationDatabase();
    runtime = integration.runtime;
    closeDatabase = integration.close;
  }, 60_000);

  afterAll(async () => {
    await closeDatabase?.();
  }, 30_000);

  it("commits exactly one relationship-bound journal, immutable evidence, and IDs-only delivery beside the first confirmed capture", async () => {
    const pending = await createPendingFixture(runtime);
    const capture = createCapture(pending.subscription, "initial", {
      capturedAt: "2026-01-31T07:30:00.000Z"
    });
    const apply = () =>
      runtime.database.transaction((transaction) =>
        applyDrizzleAstroDiarySubscriptionCaptureInTransaction(transaction, capture)
      );

    const [left, right] = await Promise.all([apply(), apply()]);
    expect([left.outcome, right.outcome].sort()).toEqual(["applied", "replayed"]);
    const applied = left.outcome === "applied" ? left : right;
    if (applied.outcome !== "applied") throw new Error("one capture must apply");
    await expect(apply()).resolves.toEqual({ outcome: "replayed", result: applied });

    const [journals, receipts, events, deliveries, dispatches, entitlements] = await Promise.all([
      runtime.database.select().from(astroDiaryJournals),
      runtime.database.select().from(astroDiarySubscriptionActivationReceipts),
      runtime.database.select().from(astroDiaryEvents),
      runtime.database.select().from(astroDiaryEventDeliveries),
      runtime.database
        .select()
        .from(outboxEvents)
        .where(eq(outboxEvents.eventType, "astro_diary.event_delivery.dispatch_requested.v1")),
      runtime.database.select().from(clientEntitlementGrants)
    ]);
    expect(journals).toEqual([
      expect.objectContaining({
        relationshipId: pending.authority.relationshipId,
        journalEpochId: pending.subscription.journalEpochId,
        clientUserId: pending.authority.clientUserId,
        astrologerUserId: pending.authority.astrologerUserId,
        state: "active",
        version: 1
      })
    ]);
    expect(receipts).toEqual([
      expect.objectContaining({
        journalId: journals[0]!.id,
        relationshipId: pending.authority.relationshipId,
        journalEpochId: pending.subscription.journalEpochId,
        subscriptionId: pending.subscription.id,
        sourceEventId: capture.sourceEvent.eventId,
        evidenceId: capture.sourceEvent.data.financeEvidenceId,
        activationEventId: events[0]!.eventId
      })
    ]);
    expect(events).toEqual([
      expect.objectContaining({
        eventType: "astro_diary.journal_activated.v1",
        journalId: journals[0]!.id,
        journalEpochId: pending.subscription.journalEpochId,
        cycleId: null,
        itemId: null,
        contextId: null,
        obligationId: null,
        responseItemId: null,
        commandId: null,
        periodId: null
      })
    ]);
    expect(deliveries).toEqual([
      expect.objectContaining({ eventId: events[0]!.eventId, consumer: "realtime_projection" })
    ]);
    expect(dispatches).toEqual([
      expect.objectContaining({
        aggregateId: deliveries[0]!.id,
        payload: {
          schemaVersion: "astro-diary-event-delivery-dispatch-request.v1",
          deliveryId: deliveries[0]!.id
        }
      })
    ]);
    expect(entitlements).toHaveLength(1);
    await expect(
      runtime.database
        .update(astroDiarySubscriptionActivationReceipts)
        .set({ activatedAt: new Date("2026-02-01T00:00:00.000Z") })
        .where(eq(astroDiarySubscriptionActivationReceipts.id, receipts[0]!.id))
    ).rejects.toThrow();
    await expect(
      runtime.database
        .delete(astroDiarySubscriptionActivationReceipts)
        .where(eq(astroDiarySubscriptionActivationReceipts.id, receipts[0]!.id))
    ).rejects.toThrow();
    await expect(
      runtime.database
        .select()
        .from(astroDiarySubscriptionActivationReceipts)
        .where(eq(astroDiarySubscriptionActivationReceipts.id, receipts[0]!.id))
    ).resolves.toEqual([receipts[0]]);
  });

  it("rolls subscription, entitlement, journal, receipt, event, and outbox writes back together", async () => {
    const pending = await createPendingFixture(runtime);
    const capture = createCapture(pending.subscription, "initial", {
      capturedAt: "2026-02-01T07:30:00.000Z"
    });

    await expect(
      runtime.database.transaction(async (transaction) => {
        const result = await applyDrizzleAstroDiarySubscriptionCaptureInTransaction(
          transaction,
          capture
        );
        expect(result.outcome).toBe("applied");
        throw new Error("force_atomic_rollback");
      })
    ).rejects.toThrow("force_atomic_rollback");

    const [subscription] = await runtime.database
      .select()
      .from(clientSubscriptions)
      .where(eq(clientSubscriptions.id, pending.subscription.id));
    expect(subscription).toMatchObject({ state: "pending_initial_payment", version: 1 });
    await expect(
      runtime.database
        .select()
        .from(astroDiaryJournals)
        .where(eq(astroDiaryJournals.journalEpochId, pending.subscription.journalEpochId))
    ).resolves.toHaveLength(0);
    await expect(
      runtime.database
        .select()
        .from(astroDiarySubscriptionActivationReceipts)
        .where(eq(astroDiarySubscriptionActivationReceipts.subscriptionId, pending.subscription.id))
    ).resolves.toHaveLength(0);
  });

  it("keeps one journal through renewal, exposes terminal access as read-only, and creates a distinct replacement epoch", async () => {
    const first = await createPendingFixture(runtime);
    const firstCapture = createCapture(first.subscription, "initial", {
      capturedAt: "2026-01-31T07:30:00.000Z"
    });
    const activated = await runtime.database.transaction((transaction) =>
      applyDrizzleAstroDiarySubscriptionCaptureInTransaction(transaction, firstCapture)
    );
    if (activated.outcome !== "applied") throw new Error("initial capture must apply");

    const renewalRequestId = randomUUID();
    const intendedPeriodId = randomUUID();
    const renewalRequested = await executeClientSubscriptionCommand(
      createDrizzleClientSubscriptionCommandUnitOfWork(runtime.database),
      {
        subscriptionId: activated.subscription.id,
        expectedVersion: activated.subscription.version,
        idempotencyKey: `renewal-${randomUUID()}`,
        request: { operation: "request_renewal", renewalRequestId, intendedPeriodId }
      },
      (current) =>
        requestRenewalCharge(current, {
          renewalRequestId,
          sourcePeriodId: activated.subscription.paidPeriods[0]!.id,
          intendedPeriodId,
          requestedAt: "2026-02-25T07:30:00.000Z",
          eventId: randomUUID()
        })
    );
    if (renewalRequested.outcome !== "applied") throw new Error("renewal request must apply");
    const renewalCapture = createCapture(renewalRequested.subscription, "renewal", {
      capturedAt: "2026-02-28T07:30:00.000Z",
      renewalRequestId,
      intendedPeriodId
    });
    const renewed = await runtime.database.transaction((transaction) =>
      applyDrizzleAstroDiarySubscriptionCaptureInTransaction(transaction, renewalCapture)
    );
    expect(renewed).toMatchObject({ outcome: "applied", subscription: { version: 4 } });
    await expect(
      runtime.database
        .select()
        .from(astroDiaryJournals)
        .where(eq(astroDiaryJournals.relationshipId, first.authority.relationshipId))
    ).resolves.toHaveLength(1);
    await expect(
      runtime.database
        .select()
        .from(astroDiarySubscriptionActivationReceipts)
        .where(eq(astroDiarySubscriptionActivationReceipts.subscriptionId, first.subscription.id))
    ).resolves.toHaveLength(1);

    if (renewed.outcome !== "applied") throw new Error("renewal capture must apply");
    const firstPeriodEnded = await executeClientSubscriptionCommand(
      createDrizzleClientSubscriptionCommandUnitOfWork(runtime.database),
      {
        subscriptionId: renewed.subscription.id,
        expectedVersion: renewed.subscription.version,
        idempotencyKey: `end-${randomUUID()}`,
        request: { operation: "end_paid_access" }
      },
      (current) =>
        endSubscriptionAtPaidBoundary(current, {
          now: renewed.subscription.paidPeriods.at(-1)!.endsAt,
          eventIds: [randomUUID(), randomUUID()]
        })
    );
    if (firstPeriodEnded.outcome !== "applied") {
      throw new Error("first paid period must end");
    }
    const ended = await executeClientSubscriptionCommand(
      createDrizzleClientSubscriptionCommandUnitOfWork(runtime.database),
      {
        subscriptionId: firstPeriodEnded.subscription.id,
        expectedVersion: firstPeriodEnded.subscription.version,
        idempotencyKey: `end-final-${randomUUID()}`,
        request: { operation: "end_paid_access" }
      },
      (current) =>
        endSubscriptionAtPaidBoundary(current, {
          now: renewed.subscription.paidPeriods.at(-1)!.endsAt,
          eventIds: [randomUUID(), randomUUID()]
        })
    );
    if (ended.outcome !== "applied" || ended.subscription.state !== "ended") {
      throw new Error("final paid boundary must end subscription");
    }
    const listed = await createDrizzleAstroDiaryJournalReader(
      runtime.database
    ).listAstrologerJournals({
      astrologerUserId: first.authority.astrologerUserId,
      now: ended.receipt.occurredAt,
      limit: 10
    });
    expect(listed.journals[0]?.access).toMatchObject({
      mode: "read_only",
      subscriptionId: first.subscription.id,
      subscriptionState: "ended"
    });

    const replacementOrderId = randomUUID();
    const replacementOrder = { ...first.orderInput, id: replacementOrderId };
    await createDrizzleOrderStore(runtime.database).create(replacementOrder);
    const replacement = await createSubscription(runtime, {
      authority: { ...first.authority, orderId: replacementOrderId },
      orderInput: replacementOrder,
      expectedSlotVersion: 2
    });
    const replacementCapture = createCapture(replacement.subscription, "initial", {
      capturedAt: "2026-04-01T07:30:00.000Z"
    });
    await expect(
      runtime.database.transaction((transaction) =>
        applyDrizzleAstroDiarySubscriptionCaptureInTransaction(transaction, replacementCapture)
      )
    ).resolves.toMatchObject({ outcome: "applied" });
    const journals = await runtime.database
      .select()
      .from(astroDiaryJournals)
      .where(eq(astroDiaryJournals.relationshipId, first.authority.relationshipId));
    expect(journals).toHaveLength(2);
    expect(new Set(journals.map((journal) => journal.journalEpochId))).toEqual(
      new Set([first.subscription.journalEpochId, replacement.subscription.journalEpochId])
    );
  });
});

function createCapture(
  subscription: ClientSubscription,
  kind: "initial" | "renewal",
  input: Readonly<{
    capturedAt: string;
    renewalRequestId?: string;
    intendedPeriodId?: string;
  }>
) {
  const evidenceId = randomUUID();
  const periodId = kind === "renewal" ? input.intendedPeriodId! : randomUUID();
  const authority = sealFinanceClientOrderSubscriptionCaptureAuthority({
    captureKind: kind,
    captureApplicationReceiptId: evidenceId,
    captureApplicationDigest: sha256("capture-application"),
    orderId: subscription.contract.orderId,
    contractId: subscription.contract.id,
    contractCanonicalDigest: subscription.contract.canonicalDigest,
    subscriptionId: subscription.id,
    subscriptionExpectedVersion: subscription.version,
    capturedAt: input.capturedAt,
    ...(kind === "renewal"
      ? {
          renewalRequestId: input.renewalRequestId!,
          intendedPeriodId: input.intendedPeriodId!
        }
      : {})
  });
  const target =
    kind === "renewal"
      ? {
          kind,
          renewalRequestId: input.renewalRequestId!,
          intendedPeriodId: input.intendedPeriodId!,
          periodId,
          periodRenewedEventId: randomUUID(),
          entitlementChangedEventId: randomUUID()
        }
      : {
          kind,
          periodId,
          activatedEventId: randomUUID(),
          entitlementChangedEventId: randomUUID()
        };
  const dispatchReceipt = createFinanceClientOrderCaptureDispatchReceipt({
    authority,
    dispatchReceiptId: randomUUID(),
    sourceEventId: randomUUID(),
    target,
    dispatchedAt: new Date(Date.parse(input.capturedAt) + 1_000).toISOString()
  });
  return {
    dispatchReceipt,
    sourceEvent: createFinanceClientSubscriptionCaptureAppliedEvent(dispatchReceipt)
  };
}

async function createPendingFixture(runtime: PostgresRuntime): Promise<PendingFixture> {
  const prerequisite = await seedPurchaseAuthority(runtime);
  await createDrizzleOrderStore(runtime.database).create(prerequisite.orderInput);
  return createSubscription(runtime, { ...prerequisite, expectedSlotVersion: 0 });
}

async function createSubscription(
  runtime: PostgresRuntime,
  input: Readonly<{
    authority: PurchaseAuthority;
    orderInput: CreateFinanceOrderRecordInput;
    expectedSlotVersion: number;
  }>
): Promise<PendingFixture> {
  const subscriptionId = randomUUID();
  const contractId = randomUUID();
  const journalEpochId = randomUUID();
  const result = await executeClientSubscriptionCreation(
    createDrizzleClientSubscriptionCreationUnitOfWork(runtime.database),
    {
      subscriptionId,
      orderId: input.authority.orderId,
      productId: input.authority.productId,
      relationshipId: input.authority.relationshipId,
      expectedSlotVersion: input.expectedSlotVersion,
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
    throw new Error(`Expected pending subscription, received ${result.outcome}`);
  }
  return {
    authority: input.authority,
    orderInput: input.orderInput,
    subscription: result.subscription
  };
}

async function seedPurchaseAuthority(runtime: PostgresRuntime): Promise<{
  authority: PurchaseAuthority;
  orderInput: CreateFinanceOrderRecordInput;
}> {
  const clientUserId = randomUUID();
  const astrologerUserId = randomUUID();
  const productId = randomUUID();
  const relationshipId = randomUUID();
  const policyId = randomUUID();
  const orderId = randomUUID();
  const tariffSeriesId = `task-2-${randomUUID()}`;
  const tariffDigest = sha256(tariffSeriesId);
  const now = new Date("2026-01-01T00:00:00.000Z");

  await runtime.database.transaction(async (transaction) => {
    await transaction.insert(users).values([{ id: clientUserId }, { id: astrologerUserId }]);
    await transaction.insert(products).values({
      id: productId,
      ownerUserId: astrologerUserId,
      type: "sub",
      status: "active",
      revision: 1,
      title: "AstroDiary Task 2",
      subtitle: null,
      priceMinor: 4_900,
      currency: "RUB",
      coverMediaId: null,
      introVideoUrl: null,
      executionMode: "async",
      paymentModel: "sub",
      durationMinutes: null,
      durationLabel: null,
      slaLabel: null,
      packageSessionCount: null,
      packageDiscountPercent: null,
      subscriptionPeriod: "month",
      trialDays: null,
      participantMode: "solo",
      groupSize: null,
      astroDiaryReflectionCyclesPerPeriod: 4,
      astroDiaryResponseSlaWorkingDays: 2,
      astroDiaryClientResponseWindowCalendarDays: 5,
      astroDiaryWorkingWeekdaysMask: 31,
      astroDiaryServiceTimezone: "Europe/Moscow",
      createdAt: now,
      updatedAt: now
    });
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
      policyVersion: nextPolicyVersion++,
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
      name: "Task 2",
      tagline: "Task 2",
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
      canonicalPreimage: "task-2",
      canonicalDigest: tariffDigest,
      createdAt: now,
      publishedAt: now,
      retiredAt: null
    });
  });

  const acceptedProduct = {
    productId,
    revision: 1,
    ownerUserId: astrologerUserId,
    status: "active" as const,
    type: "sub" as const,
    paymentModel: "sub" as const,
    executionMode: "async" as const,
    participantMode: "solo" as const,
    priceMinor: 4_900,
    currency: "RUB" as const,
    cadence: "month" as const,
    trialDays: null,
    groupSize: null,
    packageSessionCount: null,
    accessGrants: ["journal"] as const,
    deliveryFormats: ["chat", "audio", "file"] as const,
    requiredClientData: [] as const,
    methods: [] as const,
    modifiers: [] as const,
    astroDiaryConfig: {
      reflectionCyclesPerPeriod: 4,
      responseSlaWorkingDays: 2,
      clientResponseWindowCalendarDays: 5,
      workingWeekdays: [1, 2, 3, 4, 5] as const,
      serviceTimezone: "Europe/Moscow"
    }
  };
  const orderInput: CreateFinanceOrderRecordInput = {
    id: orderId,
    clientUserId,
    astrologerUserId,
    productId,
    productTitleSnapshot: "AstroDiary Task 2",
    purchasePurpose: {
      kind: "astro_diary_subscription",
      expectedProductRevision: 1,
      acceptedProduct,
      acceptedRelationship: { clientUserId, astrologerUserId, status: "active" }
    },
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

async function createIntegrationDatabase(): Promise<{
  runtime: PostgresRuntime;
  close: () => Promise<void>;
}> {
  const rawUrl = process.env.INTEGRATION_DATABASE_URL;
  if (!rawUrl) throw new Error("INTEGRATION_DATABASE_URL is required");
  const baseDatabaseUrl = assertDevelopmentDatabaseUrl(
    rawUrl,
    process.env.NODE_ENV,
    "run Task 2 PostgreSQL integration tests against"
  );
  const databaseName = `elevenhouse_astro_diary_task2_${randomUUID().replaceAll("-", "")}`;
  const isolated = new URL(baseDatabaseUrl);
  isolated.pathname = `/${databaseName}`;
  const adminClient = new Client({ connectionString: baseDatabaseUrl });
  await adminClient.connect();
  await adminClient.query(`CREATE DATABASE "${databaseName}"`);
  const runtime = createPostgresRuntime({ DATABASE_URL: isolated.toString() });
  await runtime.pool.query(readMigrationSql());
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

function readMigrationSql(): string {
  const directory = join(process.cwd(), "packages/db/drizzle");
  return readdirSync(directory)
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort()
    .map((file) => readFileSync(join(directory, file), "utf8"))
    .join("\n");
}

function sha256(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}
