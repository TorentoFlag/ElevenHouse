import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { eq, sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  applyClientSubscriptionCaptureDispatch,
  createPendingClientSubscription,
  executeClientSubscriptionCreation,
  sealClientSubscriptionContract,
  type ClientSubscription,
  type CreateFinanceOrderRecordInput
} from "@elevenhouse/domain";
import {
  createCapturedProviderPaymentSemanticSourceId,
  createFinanceClientOrderCaptureDispatchReceipt,
  createFinanceClientSubscriptionCaptureAppliedEvent,
  createRiskPolicySnapshot,
  hashFinanceCommandPayload,
  sealFinanceClientOrderSubscriptionCaptureAuthority
} from "@elevenhouse/domain/finance-core";

import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime, type PostgresRuntime } from "../../runtime";
import {
  astroDiaryEvents,
  astroDiaryJournals,
  astroDiarySubscriptionActivationReceipts
} from "../../schema/astro-diary";
import { clientSubscriptions } from "../../schema/client-subscriptions";
import { clientAstrologerRelationships } from "../../schema/clients/client-astrologer-relationships.schema";
import { financeArtifactRetentionPolicies } from "../../schema/finance/finance-artifacts.schema";
import { financeClientSubscriptionCaptureDispatchReceipts } from "../../schema/finance/client-subscription-capture-dispatch.schema";
import { financePolicies } from "../../schema/finance/policies.schema";
import {
  financeProviderAccountSeries,
  financeProviderAccounts
} from "../../schema/finance/provider-accounts.schema";
import { users } from "../../schema/identity/accounts.schema";
import {
  platformTariffSeries,
  platformTariffVersions
} from "../../schema/platform-billing/tariff-authority.schema";
import { productAccessGrants } from "../../schema/products/product-access-grants.schema";
import { productDeliveryFormats } from "../../schema/products/product-delivery-formats.schema";
import { products } from "../../schema/products/products.schema";
import { createDrizzleClientSubscriptionCreationUnitOfWork } from "../client-subscriptions/drizzle-client-subscription-creation-uow";
import { createDrizzleClientSubscriptionCaptureDispatchUnitOfWork } from "../client-subscriptions/drizzle-client-subscription-capture-dispatch-uow";
import { applyDrizzleClientSubscriptionSourceEventInTransaction } from "../client-subscriptions/drizzle-client-subscription-uow";
import { createDrizzleCapturedClientOrderWebhookClaimPort } from "../finance/drizzle-captured-client-order-webhook-claim-port";
import { createDrizzleEconomicPaymentIntentCreationUnitOfWork } from "../finance/drizzle-economic-payment-intent-creation-uow";
import { createDrizzleEconomicPaymentSessionOpenUnitOfWork } from "../finance/drizzle-economic-payment-session-open-uow";
import { createDrizzleOnlineSaleCaptureCanonicalWebhookUnitOfWork } from "../finance/drizzle-online-sale-capture-canonical-webhook-uow";
import { createDrizzleOnlineSaleCapturePersistenceResolver } from "../finance/drizzle-online-sale-capture-persistence-resolver";
import { createDrizzleOrderStore } from "../finance/drizzle-order-store";
import { createDrizzleWebhookIngressStorageUnitOfWork } from "../finance/drizzle-webhook-ingress-storage-uow";
import {
  createFinanceArtifactRegistry,
  type FinanceArtifactRegistry
} from "../finance/finance-artifact-registry";
import {
  applyDrizzleAstroDiarySubscriptionCaptureInTransaction,
  persistDrizzleAstroDiarySubscriptionActivation
} from "./drizzle-astro-diary-subscription-activation";

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

let nextPolicyVersion = 30_000;
const providerAccount = Object.freeze({
  seriesId: "astro-diary-task-2-fix",
  providerAccountId: "astro-diary-task-2-fix-account",
  identityVersion: 1
});

describe.sequential("AstroDiary activation database ownership regressions", () => {
  let runtime: PostgresRuntime;
  let closeDatabase: () => Promise<void>;
  let artifacts: FinanceArtifactRegistry;

  beforeAll(async () => {
    const integration = await createIntegrationDatabase();
    runtime = integration.runtime;
    closeDatabase = integration.close;
    artifacts = createFinanceArtifactRegistry(runtime.database);
    await runtime.database.transaction(async (transaction) => {
      await transaction.insert(financeProviderAccountSeries).values({
        seriesId: providerAccount.seriesId,
        provider: "arc_pay",
        activeIdentityVersion: providerAccount.identityVersion,
        headVersion: "1"
      });
      await transaction.insert(financeProviderAccounts).values({
        ...providerAccount,
        provider: "arc_pay",
        merchantTenantId: "astro-diary-task-2-fix",
        terminalScope: "hosted-and-saved-card",
        settlementScope: "company-settlement",
        predecessorProviderAccountId: null,
        predecessorIdentityVersion: null
      });
      await transaction.insert(financeArtifactRetentionPolicies).values([
        {
          policyId: "astro-diary-task-2-webhook",
          policyVersion: "1",
          artifactClass: "provider_webhook",
          retainForSeconds: "3600",
          authorityRef: "integration-test",
          effectiveAt: new Date("2020-01-01T00:00:00.000Z")
        },
        {
          policyId: "astro-diary-task-2-canonical",
          policyVersion: "1",
          artifactClass: "provider_canonical_read",
          retainForSeconds: "3600",
          authorityRef: "integration-test",
          effectiveAt: new Date("2020-01-01T00:00:00.000Z")
        }
      ]);
    });
  }, 60_000);

  afterAll(async () => {
    await closeDatabase?.();
  }, 30_000);

  it("rejects receipt truncation and raw orphan or duplicate activation events", async () => {
    const pending = await createPendingFixture(runtime);
    const capture = createCapture(pending.subscription, "2026-02-01T07:30:00.000Z");
    const applied = await runtime.database.transaction((transaction) =>
      applyDrizzleAstroDiarySubscriptionCaptureInTransaction(transaction, capture)
    );
    expect(applied.outcome).toBe("applied");

    const [receipt] = await runtime.database
      .select()
      .from(astroDiarySubscriptionActivationReceipts)
      .where(eq(astroDiarySubscriptionActivationReceipts.subscriptionId, pending.subscription.id));
    expect(receipt).toBeDefined();
    await expect(
      runtime.pool.query("truncate astro_diary_subscription_activation_receipts")
    ).rejects.toThrow(/immutable/i);
    await expect(
      runtime.database
        .select()
        .from(astroDiarySubscriptionActivationReceipts)
        .where(eq(astroDiarySubscriptionActivationReceipts.id, receipt!.id))
    ).resolves.toHaveLength(1);

    await expect(
      runtime.database.transaction(async (transaction) => {
        await transaction.insert(astroDiaryEvents).values({
          eventId: randomUUID(),
          eventType: "astro_diary.journal_activated.v1",
          schemaVersion: 1,
          eventDigest: sha256("raw-orphan-duplicate"),
          journalId: receipt!.journalId,
          journalEpochId: receipt!.journalEpochId,
          cycleId: null,
          itemId: null,
          contextId: null,
          obligationId: null,
          responseItemId: null,
          commandId: null,
          periodId: null,
          occurredAt: new Date("2026-02-01T07:30:01.000Z")
        });
      })
    ).rejects.toThrow();
    await expect(
      runtime.database
        .select()
        .from(astroDiaryEvents)
        .where(eq(astroDiaryEvents.journalId, receipt!.journalId))
    ).resolves.toHaveLength(1);

    const orphan = await createPendingFixture(runtime);
    await runtime.database.insert(astroDiaryJournals).values({
      id: randomUUID(),
      relationshipId: orphan.authority.relationshipId,
      journalEpochId: orphan.subscription.journalEpochId,
      clientUserId: orphan.authority.clientUserId,
      astrologerUserId: orphan.authority.astrologerUserId,
      state: "active",
      version: 1,
      createdAt: new Date("2026-02-02T07:30:00.000Z")
    });
    const [orphanJournal] = await runtime.database
      .select()
      .from(astroDiaryJournals)
      .where(eq(astroDiaryJournals.journalEpochId, orphan.subscription.journalEpochId));
    await expect(
      runtime.database.transaction(async (transaction) => {
        await transaction.insert(astroDiaryEvents).values({
          eventId: randomUUID(),
          eventType: "astro_diary.journal_activated.v1",
          schemaVersion: 1,
          eventDigest: sha256("raw-orphan"),
          journalId: orphanJournal!.id,
          journalEpochId: orphan.subscription.journalEpochId,
          cycleId: null,
          itemId: null,
          contextId: null,
          obligationId: null,
          responseItemId: null,
          commandId: null,
          periodId: null,
          occurredAt: new Date("2026-02-02T07:30:00.000Z")
        });
      })
    ).rejects.toThrow();
  });

  it.each(["subscription", "relationship", "epoch"] as const)(
    "rolls every capture artifact back on an explicit %s mismatch",
    async (mismatch) => {
      const pending = await createPendingFixture(runtime);
      const capture = createCapture(pending.subscription, "2026-02-03T07:30:00.000Z");
      const before = await activationArtifactSnapshot(runtime, pending.subscription);

      await expect(
        runtime.database.transaction((transaction) =>
          applyClientSubscriptionCaptureDispatch(
            {
              apply: (sourceInput) =>
                applyDrizzleClientSubscriptionSourceEventInTransaction(
                  transaction,
                  sourceInput,
                  async ({ decision, applicationReceipt }) => {
                    const lockedSubscription =
                      mismatch === "subscription"
                        ? { ...decision.subscription, id: randomUUID() }
                        : mismatch === "epoch"
                          ? { ...decision.subscription, journalEpochId: randomUUID() }
                          : {
                              ...decision.subscription,
                              contract: {
                                ...decision.subscription.contract,
                                relationshipId: randomUUID()
                              }
                            };
                    await persistDrizzleAstroDiarySubscriptionActivation(transaction, {
                      appliedCapture: capture,
                      lockedSubscription,
                      immutableContract: decision.subscription.contract,
                      transitionReceipt: decision.receipt,
                      appliedSourceEventReceipt: applicationReceipt
                    });
                  }
                )
            },
            capture
          )
        )
      ).rejects.toThrow();

      await expect(activationArtifactSnapshot(runtime, pending.subscription)).resolves.toEqual(
        before
      );
    }
  );

  it("rolls subscription head, entitlement, lifecycle/source evidence and the full activation delivery graph back", async () => {
    const pending = await createPendingFixture(runtime);
    const capture = createCapture(pending.subscription, "2026-02-04T07:30:00.000Z");
    const before = await activationArtifactSnapshot(runtime, pending.subscription);

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

    await expect(activationArtifactSnapshot(runtime, pending.subscription)).resolves.toEqual(
      before
    );
    const [subscription] = await runtime.database
      .select()
      .from(clientSubscriptions)
      .where(eq(clientSubscriptions.id, pending.subscription.id));
    expect(subscription).toMatchObject({ state: "pending_initial_payment", version: 1 });
  });

  it("activates through the production capture-dispatch composition from canonical finance evidence and seals its dispatch receipt", async () => {
    const fixture = await seedCanonicalSubscriptionCapture(runtime, artifacts);
    const dispatched = await createDrizzleClientSubscriptionCaptureDispatchUnitOfWork(
      runtime.database
    ).rehydrateAndDispatchClientOrderCapture({
      captureApplicationReceiptId: fixture.captureApplicationReceiptId
    });
    expect(dispatched.outcome).toBe("dispatched");

    const [dispatchReceipt] = await runtime.database
      .select()
      .from(financeClientSubscriptionCaptureDispatchReceipts)
      .where(
        eq(
          financeClientSubscriptionCaptureDispatchReceipts.captureApplicationReceiptId,
          fixture.captureApplicationReceiptId
        )
      );
    expect(dispatchReceipt).toMatchObject({
      orderId: fixture.authority.orderId,
      captureApplicationReceiptId: fixture.captureApplicationReceiptId,
      captureKind: "initial"
    });
    await expect(
      runtime.database
        .update(financeClientSubscriptionCaptureDispatchReceipts)
        .set({ canonicalPreimage: "tampered" })
        .where(
          eq(
            financeClientSubscriptionCaptureDispatchReceipts.dispatchReceiptId,
            dispatchReceipt!.dispatchReceiptId
          )
        )
    ).rejects.toThrow();
    await expect(
      runtime.database
        .delete(financeClientSubscriptionCaptureDispatchReceipts)
        .where(
          eq(
            financeClientSubscriptionCaptureDispatchReceipts.dispatchReceiptId,
            dispatchReceipt!.dispatchReceiptId
          )
        )
    ).rejects.toThrow();
    await expect(
      runtime.pool.query("truncate finance_client_subscription_capture_dispatch_receipts")
    ).rejects.toThrow();

    await expect(
      createDrizzleClientSubscriptionCaptureDispatchUnitOfWork(
        runtime.database
      ).rehydrateAndDispatchClientOrderCapture({
        captureApplicationReceiptId: fixture.captureApplicationReceiptId
      })
    ).resolves.toMatchObject({ outcome: "replayed" });
    await expect(
      runtime.database
        .select()
        .from(astroDiarySubscriptionActivationReceipts)
        .where(
          eq(astroDiarySubscriptionActivationReceipts.sourceEventId, dispatchReceipt!.sourceEventId)
        )
    ).resolves.toHaveLength(1);
  });
});

async function activationArtifactSnapshot(
  runtime: PostgresRuntime,
  subscription: ClientSubscription
) {
  const result = await runtime.pool.query(
    `select
       (select jsonb_build_object('state', state, 'version', version)
          from client_subscriptions where id = $1) as subscription_head,
       (select count(*)::int from client_entitlement_grants where subscription_id = $1) as entitlement_count,
       (select count(*)::int from client_subscription_lifecycle_events where subscription_id = $1) as lifecycle_count,
       (select count(*)::int from client_subscription_transition_receipts where subscription_id = $1) as transition_count,
       (select count(*)::int from client_subscription_event_application_receipts where subscription_id = $1) as source_receipt_count,
       (select count(*)::int from astro_diary_journals where journal_epoch_id = $2) as journal_count,
       (select count(*)::int from astro_diary_subscription_activation_receipts where subscription_id = $1) as activation_receipt_count,
       (select count(*)::int from astro_diary_events where journal_epoch_id = $2) as activation_event_count,
       (select count(*)::int
          from astro_diary_event_deliveries delivery
          join astro_diary_events event on event.event_id = delivery.event_id
         where event.journal_epoch_id = $2) as delivery_count,
       (select count(*)::int
          from outbox_events outbox
          join astro_diary_event_deliveries delivery on delivery.id = outbox.aggregate_id
          join astro_diary_events event on event.event_id = delivery.event_id
         where event.journal_epoch_id = $2) as outbox_count`,
    [subscription.id, subscription.journalEpochId]
  );
  return result.rows[0];
}

function createCapture(subscription: ClientSubscription, capturedAt: string) {
  const evidenceId = randomUUID();
  const authority = sealFinanceClientOrderSubscriptionCaptureAuthority({
    captureKind: "initial",
    captureApplicationReceiptId: evidenceId,
    captureApplicationDigest: sha256("capture-application"),
    orderId: subscription.contract.orderId,
    contractId: subscription.contract.id,
    contractCanonicalDigest: subscription.contract.canonicalDigest,
    subscriptionId: subscription.id,
    subscriptionExpectedVersion: subscription.version,
    capturedAt
  });
  const dispatchReceipt = createFinanceClientOrderCaptureDispatchReceipt({
    authority,
    dispatchReceiptId: randomUUID(),
    sourceEventId: randomUUID(),
    target: {
      kind: "initial",
      periodId: randomUUID(),
      activatedEventId: randomUUID(),
      entitlementChangedEventId: randomUUID()
    },
    dispatchedAt: new Date(Date.parse(capturedAt) + 1_000).toISOString()
  });
  return {
    dispatchReceipt,
    sourceEvent: createFinanceClientSubscriptionCaptureAppliedEvent(dispatchReceipt)
  };
}

async function createPendingFixture(runtime: PostgresRuntime): Promise<PendingFixture> {
  const prerequisite = await seedPurchaseAuthority(runtime);
  await createDrizzleOrderStore(runtime.database).create(prerequisite.orderInput);
  const subscriptionId = randomUUID();
  const contractId = randomUUID();
  const journalEpochId = randomUUID();
  const result = await executeClientSubscriptionCreation(
    createDrizzleClientSubscriptionCreationUnitOfWork(runtime.database),
    {
      subscriptionId,
      orderId: prerequisite.authority.orderId,
      productId: prerequisite.authority.productId,
      relationshipId: prerequisite.authority.relationshipId,
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
        outcome: "created" as const,
        contract: sealed.contract,
        subscription: createPendingClientSubscription({
          subscriptionId,
          journalEpochId,
          contract: sealed.contract
        })
      };
    }
  );
  if (result.outcome !== "created") throw new Error(`Expected created, got ${result.outcome}`);
  return { ...prerequisite, subscription: result.subscription };
}

async function seedPurchaseAuthority(runtime: PostgresRuntime) {
  const clientUserId = randomUUID();
  const astrologerUserId = randomUUID();
  const productId = randomUUID();
  const relationshipId = randomUUID();
  const policyId = randomUUID();
  const orderId = randomUUID();
  const tariffSeriesId = `task-2-fix-${randomUUID()}`;
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
      title: "AstroDiary Task 2 Fix",
      priceMinor: 4_900,
      currency: "RUB",
      executionMode: "async",
      paymentModel: "sub",
      subscriptionPeriod: "month",
      participantMode: "solo",
      astroDiaryReflectionCyclesPerPeriod: 4,
      astroDiaryResponseSlaWorkingDays: 2,
      astroDiaryClientResponseWindowCalendarDays: 5,
      astroDiaryWorkingWeekdaysMask: 31,
      astroDiaryServiceTimezone: "Europe/Moscow",
      createdAt: now,
      updatedAt: now
    });
    await transaction.insert(productAccessGrants).values({ productId, value: "journal", order: 0 });
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
    await transaction
      .insert(platformTariffSeries)
      .values({ id: tariffSeriesId, code: tariffSeriesId });
    await transaction.insert(platformTariffVersions).values({
      tariffSeriesId,
      version: 1,
      draftRevision: 1,
      lifecycle: "published",
      name: "Task 2 Fix",
      tagline: "Task 2 Fix",
      monthlyPriceMinor: 1_000,
      yearlyPriceMinor: 10_000,
      monthlyRecurringFrequencyDays: 30,
      yearlyRecurringFrequencyDays: 365,
      currency: "RUB",
      clientSaleCommissionBps: 400,
      isPopular: false,
      displayOrder: 1,
      canonicalPreimage: "task-2-fix",
      canonicalDigest: tariffDigest,
      createdAt: now,
      publishedAt: now
    });
  });

  const authority = { clientUserId, astrologerUserId, productId, relationshipId, orderId };
  const orderInput: CreateFinanceOrderRecordInput = {
    id: orderId,
    clientUserId,
    astrologerUserId,
    productId,
    productTitleSnapshot: "AstroDiary Task 2 Fix",
    purchasePurpose: {
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
    authority,
    orderInput,
    financeAuthority: {
      policyId,
      policyVersion: nextPolicyVersion - 1,
      tariffSeriesId,
      tariffDigest
    }
  };
}

async function seedCanonicalSubscriptionCapture(
  runtime: PostgresRuntime,
  artifacts: FinanceArtifactRegistry
) {
  const prerequisite = await seedPurchaseAuthority(runtime);
  await createDrizzleOrderStore(runtime.database).create(prerequisite.orderInput);
  // The current finance source-lot codec still accepts only the established single-session
  // fulfillment registry. Preserve the already-sealed subscription purchase authority while
  // driving that canonical capture path, then restore the product shape before subscription
  // creation/dispatch reads it.
  await runtime.database.transaction(async (transaction) => {
    await transaction
      .delete(productAccessGrants)
      .where(eq(productAccessGrants.productId, prerequisite.authority.productId));
    await transaction.execute(
      sql`update products
        set revision = revision + 1,
            type = 'single', payment_model = 'once', execution_mode = 'live',
            duration_minutes = 60, subscription_period = null,
            astro_diary_reflection_cycles_per_period = null,
            astro_diary_response_sla_working_days = null,
            astro_diary_client_response_window_calendar_days = null,
            astro_diary_working_weekdays_mask = null,
            astro_diary_service_timezone = null
      where id = ${prerequisite.authority.productId}`
    );
  });
  const intentId = `economic-intent-${randomUUID()}`;
  const sessionId = `economic-session-${randomUUID()}`;
  const providerOperationIntentId = `provider-operation-${randomUUID()}`;
  const webhookId = `webhook-${randomUUID()}`;
  const providerPaymentId = `payment-${randomUUID()}`;
  let observedAt = "";
  const risk = createRiskPolicySnapshot({
    id: prerequisite.financeAuthority.policyId,
    policyVersion: prerequisite.financeAuthority.policyVersion,
    effectiveRiskTier: "standard",
    holdAnchor: "booking_completed",
    holdDurationHours: 48,
    reserveBps: 0,
    reserveReleaseDelayDays: 0,
    providerSettlementRequired: true,
    payoutMinimum: { amountMinor: 100, currency: "RUB" },
    exceptionAuthority: null,
    effectiveAt: "2020-01-01T00:00:00.000Z"
  });
  const fulfillment = {
    supported: true,
    registryKey: "single.once.live.solo",
    registryRevision: 1,
    holdAnchor: "booking_completed",
    terminalEvidence: { owner: "booking", status: "completed", contractVersion: 1 },
    cancellationAllocator: {
      owner: "booking",
      port: "BookingCancellationRefundDecisionPort",
      policyVersion: 1
    }
  } as const;

  await runtime.pool.query(
    `insert into finance_risk_policy_versions
       (policy_id, policy_version, effective_risk_tier, hold_anchor, hold_duration_hours,
        reserve_bps, reserve_release_delay_days, provider_settlement_required,
        payout_minimum_amount_minor, payout_minimum_currency, exception_authority_id,
        exception_authority_version, effective_at, canonical_digest)
     values ($1, $2, 'standard', 'booking_completed', 48, 0, 0, true, 100, 'RUB',
             null, null, '2020-01-01T00:00:00Z', $3)`,
    [
      prerequisite.financeAuthority.policyId,
      prerequisite.financeAuthority.policyVersion,
      hashFinanceCommandPayload(risk)
    ]
  );
  await runtime.pool.query(
    `insert into finance_paid_product_fulfillment_decisions
       (supported, registry_key, registry_revision, hold_anchor, terminal_evidence_owner,
        terminal_evidence_status, terminal_evidence_contract_version,
        cancellation_allocator_owner, cancellation_allocator_port,
        cancellation_allocator_policy_version, canonical_digest)
     values (true, 'single.once.live.solo', 1, 'booking_completed', 'booking', 'completed', 1,
             'booking', 'BookingCancellationRefundDecisionPort', 1, $1)
     on conflict (registry_key, registry_revision) do nothing`,
    [hashFinanceCommandPayload(fulfillment)]
  );
  await createDrizzleEconomicPaymentIntentCreationUnitOfWork({
    database: runtime.database
  }).createEconomicPaymentIntent({
    economicPaymentIntentId: intentId,
    sourceId: prerequisite.authority.orderId,
    purpose: "client_order",
    providerAccount,
    amountMinor: "4900",
    currency: "RUB",
    expectedSourceUniquenessVersion: 0
  });
  await createDrizzleEconomicPaymentSessionOpenUnitOfWork({
    database: runtime.database
  }).openEconomicPaymentSession({
    economicPaymentIntentId: intentId,
    economicPaymentSessionId: sessionId,
    expectedEconomicPaymentVersion: 1,
    providerAccount
  });
  await runtime.pool.query(
    `insert into finance_client_checkout_authorizations
       (authority_id, order_id, client_user_id, payment_command_id, economic_payment_intent_id,
        economic_payment_session_id, provider_operation_intent_id, risk_policy_id,
        risk_policy_version, risk_policy_digest, fulfillment_decision_id,
        fulfillment_decision_version, fulfillment_decision_digest)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1, $12)`,
    [
      `checkout-authority-${randomUUID()}`,
      prerequisite.authority.orderId,
      prerequisite.authority.clientUserId,
      randomUUID(),
      intentId,
      sessionId,
      providerOperationIntentId,
      prerequisite.financeAuthority.policyId,
      prerequisite.financeAuthority.policyVersion,
      hashFinanceCommandPayload(risk),
      fulfillment.registryKey,
      hashFinanceCommandPayload(fulfillment)
    ]
  );

  const webhookBytes = new TextEncoder().encode(JSON.stringify({ id: webhookId }));
  const canonicalBytes = new TextEncoder().encode(JSON.stringify({ id: providerPaymentId }));
  const webhookArtifact = await artifacts.registerSealedArtifact({
    artifact: {
      artifactId: `webhook-artifact-${randomUUID()}`,
      sha256Digest: digest(webhookBytes),
      byteLength: webhookBytes.byteLength
    },
    artifactClass: "provider_webhook",
    binding: { kind: "provider", providerAccount },
    contentType: "application/json",
    privateObject: {
      privateObjectKey: `integration/webhook-${webhookId}`,
      privateObjectVersion: "v1",
      envelopeKeyVersion: "kms-v1",
      sha256Digest: digest(webhookBytes),
      byteLength: webhookBytes.byteLength,
      contentType: "application/json"
    },
    retentionPolicyId: "astro-diary-task-2-webhook",
    retentionPolicyVersion: "1"
  });
  const canonicalArtifact = await artifacts.registerSealedArtifact({
    artifact: {
      artifactId: `canonical-artifact-${randomUUID()}`,
      sha256Digest: digest(canonicalBytes),
      byteLength: canonicalBytes.byteLength
    },
    artifactClass: "provider_canonical_read",
    binding: { kind: "provider", providerAccount },
    contentType: "application/json",
    privateObject: {
      privateObjectKey: `integration/canonical-${providerPaymentId}`,
      privateObjectVersion: "v1",
      envelopeKeyVersion: "kms-v1",
      sha256Digest: digest(canonicalBytes),
      byteLength: canonicalBytes.byteLength,
      contentType: "application/json"
    },
    retentionPolicyId: "astro-diary-task-2-canonical",
    retentionPolicyVersion: "1"
  });
  const stored = await createDrizzleWebhookIngressStorageUnitOfWork({
    database: runtime.database
  }).storeBeforeAcknowledgement({
    expectedTransportIdentityAbsent: true,
    ingressEvidence: {
      kind: "verified_webhook_ingress_evidence",
      provider: "arc_pay",
      providerAccount,
      webhookId,
      providerEventType: "payment.captured",
      rawBodyDigest: digest(webhookBytes),
      sealedPayloadRef: webhookArtifact.artifactId,
      signatureScheme: "arc_pay_hmac_sha256_v1",
      verifierContractVersion: "arc_pay_webhook_ingress_v1",
      webhookSigningKeyVersionId: "key-v1",
      signedTimestamp: "2026-02-05T07:29:58.000Z",
      signatureEvidenceDigest: sha256("webhook-signature"),
      verifiedAt: "2026-02-05T07:29:59.000Z",
      receivedAt: "2026-02-05T07:30:00.000Z"
    }
  } as never);
  const workerId = `astro-diary-task-2-${randomUUID()}`;
  const claim = await createDrizzleCapturedClientOrderWebhookClaimPort({
    database: runtime.database,
    workerId,
    leaseDurationSeconds: 60,
    retryPolicy: { maximumAttempts: 3, baseDelayMilliseconds: 100, maximumDelayMilliseconds: 500 }
  }).claimNextCapturedClientOrderWebhook();
  if (!claim || claim.inboxItemId !== stored.inboxItemId) {
    throw new Error("Canonical capture fixture was not claimable");
  }
  observedAt = new Date().toISOString();
  const canonicalUnitOfWork = createDrizzleOnlineSaleCaptureCanonicalWebhookUnitOfWork({
    database: runtime.database,
    workerId,
    mutationResolver: createDrizzleOnlineSaleCapturePersistenceResolver()
  });
  let canonical;
  try {
    canonical = await canonicalUnitOfWork.applyCanonicalOnlineSaleCapture({
      semanticFact: {
        inboxItemId: claim.inboxItemId,
        expectedInboxVersion: claim.inboxVersion,
        expectedCheckpointSequence: claim.expectedCheckpointSequence,
        processorVersion: 1,
        semanticEvidence: {
          kind: "verified_webhook_semantic_evidence",
          providerAccount,
          webhookId,
          semanticSourceKind: "payment_transition",
          semanticSourceId: createCapturedProviderPaymentSemanticSourceId(providerPaymentId),
          economicPaymentIntentId: intentId,
          economicPaymentSessionId: sessionId,
          providerPaymentId,
          amountMinor: "4900",
          currency: "RUB",
          purpose: "client_order",
          canonicalFactDigest: sha256("canonical-capture-fact"),
          artifact: canonicalArtifact,
          observedAt
        },
        operationEnvelope: operationEnvelope()
      },
      capture: {
        economicPaymentIntentId: intentId,
        expectedEconomicPaymentVersion: 2,
        operationEnvelope: operationEnvelope()
      }
    } as never);
  } catch (error) {
    const reason = error && typeof error === "object" && "reason" in error ? error.reason : error;
    throw new Error(`Canonical capture fixture failed: ${String(reason)}`, { cause: error });
  }
  expect(canonical.effect).toBe("applied_once");
  await runtime.database.transaction(async (transaction) => {
    await transaction.execute(
      sql`update products
        set revision = revision + 1,
            type = 'sub', payment_model = 'sub', execution_mode = 'async',
            duration_minutes = null, subscription_period = 'month',
            astro_diary_reflection_cycles_per_period = 4,
            astro_diary_response_sla_working_days = 2,
            astro_diary_client_response_window_calendar_days = 5,
            astro_diary_working_weekdays_mask = 31,
            astro_diary_service_timezone = 'Europe/Moscow'
      where id = ${prerequisite.authority.productId}`
    );
    await transaction.insert(productAccessGrants).values({
      productId: prerequisite.authority.productId,
      value: "journal",
      order: 0
    });
  });
  const capture = await runtime.pool.query<{ id: string }>(
    "select id::text from finance_online_sale_capture_applications where economic_payment_intent_id = $1",
    [intentId]
  );
  if (!capture.rows[0]) throw new Error("Canonical capture application was not persisted");
  return {
    authority: prerequisite.authority,
    captureApplicationReceiptId: capture.rows[0].id
  };
}

function operationEnvelope() {
  return Object.freeze({
    kind: "resolved_finance_operation_envelope" as const,
    policyId: "client_order_capture",
    policyVersion: 1,
    policyDigest: sha256("capture-policy"),
    maximumRows: 100,
    maximumDecimalDigits: 38,
    maximumArtifactBytes: 64 * 1024
  });
}

function digest(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function createIntegrationDatabase() {
  const rawUrl = process.env.INTEGRATION_DATABASE_URL;
  if (!rawUrl) throw new Error("INTEGRATION_DATABASE_URL is required");
  const baseDatabaseUrl = assertDevelopmentDatabaseUrl(
    rawUrl,
    process.env.NODE_ENV,
    "run Task 2 fix PostgreSQL integration tests against"
  );
  const databaseName = `elevenhouse_astro_diary_task2_fix_${randomUUID().replaceAll("-", "")}`;
  const isolated = new URL(baseDatabaseUrl);
  isolated.pathname = `/${databaseName}`;
  const adminClient = new Client({ connectionString: baseDatabaseUrl });
  await adminClient.connect();
  await adminClient.query(`create database "${databaseName}"`);
  const runtime = createPostgresRuntime({ DATABASE_URL: isolated.toString() });
  await runtime.pool.query(readMigrationSql());
  return {
    runtime,
    close: async () => {
      try {
        await runtime.close();
        await adminClient.query(`drop database if exists "${databaseName}" with (force)`);
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
