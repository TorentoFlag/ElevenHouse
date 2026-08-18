import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  applyClientSubscriptionCaptureDispatch,
  canonicalizeFinanceCommandPayload,
  createPendingClientSubscription,
  executeClientSubscriptionCreation,
  publishProduct,
  sealClientSubscriptionContract,
  updateProduct,
  type ClientSubscription,
  type CreateFinanceOrderRecordInput
} from "@elevenhouse/domain";
import {
  createCapturedProviderPaymentSemanticSourceId,
  createFinanceClientOrderCaptureDispatchReceipt,
  createFinanceClientSubscriptionCaptureAppliedEvent,
  createFinanceOperationResourcePolicyDraft,
  createProviderDispatchEnvelope,
  createRiskPolicySnapshot,
  hashFinanceCommandPayload,
  publishFinanceOperationResourcePolicyDraft,
  resolveFinanceOperationEnvelope,
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
import { clientSubscriptionPurchaseAuthorities } from "../../schema/client-subscriptions/client-subscription-purchase-authorities.schema";
import { clientAstrologerRelationships } from "../../schema/clients/client-astrologer-relationships.schema";
import { financeArtifactRetentionPolicies } from "../../schema/finance/finance-artifacts.schema";
import { financeClientSubscriptionCaptureDispatchReceipts } from "../../schema/finance/client-subscription-capture-dispatch.schema";
import { financePaidProductFulfillmentDecisions } from "../../schema/finance/capture-authorities.schema";
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
import { createDrizzleClientOrderCheckoutCaptureAuthorityReader } from "../finance/drizzle-client-order-checkout-capture-authority-reader";
import { createDrizzleClientOrderCheckoutPreparationUnitOfWork } from "../finance/drizzle-client-order-checkout-preparation-uow";
import { createDrizzleCapturedClientOrderWebhookClaimPort } from "../finance/drizzle-captured-client-order-webhook-claim-port";
import { createDrizzleOnlineSaleCaptureCanonicalWebhookUnitOfWork } from "../finance/drizzle-online-sale-capture-canonical-webhook-uow";
import { createDrizzleOnlineSaleCapturePersistenceResolver } from "../finance/drizzle-online-sale-capture-persistence-resolver";
import { createDrizzleOrderStore } from "../finance/drizzle-order-store";
import { createDrizzleWebhookIngressStorageUnitOfWork } from "../finance/drizzle-webhook-ingress-storage-uow";
import { createDrizzleProductStore } from "../products/drizzle-products-store";
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
          policyId: "astro-diary-task-2-provider-request",
          policyVersion: "1",
          artifactClass: "provider_request",
          retainForSeconds: "3600",
          authorityRef: "integration-test",
          effectiveAt: new Date("2020-01-01T00:00:00.000Z")
        },
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

  it("rolls subscription head, period, allowance, entitlement evidence and the full activation delivery graph back", async () => {
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

  it("seals the exact paid-fulfillment decision beside the immutable Diary purchase authority", async () => {
    const prerequisite = await seedPurchaseAuthority(runtime);
    await createDrizzleOrderStore(runtime.database).create(prerequisite.orderInput);

    const sealed = await runtime.pool.query<{
      purchase_authority_digest: string;
      registry_key: string;
      registry_revision: string;
      fulfillment_decision_digest: string;
      canonical_preimage: string;
      canonical_digest: string;
    }>(
      `select purchase_authority_digest,
              registry_key,
              registry_revision::text,
              fulfillment_decision_digest,
              canonical_preimage,
              canonical_digest
         from client_subscription_purchase_fulfillment_authorities
        where order_id = $1`,
      [prerequisite.authority.orderId]
    );
    expect(sealed.rows).toHaveLength(1);
    expect(sealed.rows[0]).toMatchObject({
      registry_key: "sub.sub.async.solo",
      registry_revision: "1"
    });
    expect(sealed.rows[0]?.purchase_authority_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(sealed.rows[0]?.fulfillment_decision_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(sealed.rows[0]?.canonical_preimage).toContain(
      '"kind":"client_subscription_purchase_fulfillment_authority"'
    );
    expect(sealed.rows[0]?.canonical_digest).toMatch(/^sha256:[a-f0-9]{64}$/);

    await expect(
      runtime.pool.query(
        `update client_subscription_purchase_fulfillment_authorities
            set registry_revision = 2
          where order_id = $1`,
        [prerequisite.authority.orderId]
      )
    ).rejects.toThrow(/immutable/i);
  });

  it("rejects a generic same-key subscription without sealed Diary purpose before checkout capture", async () => {
    const prerequisite = await seedPurchaseAuthority(runtime);
    const genericProduct = await updateProduct({
      store: createDrizzleProductStore(runtime.database),
      ownerUserId: prerequisite.authority.astrologerUserId,
      productId: prerequisite.authority.productId,
      expectedRevision: 2,
      patch: { accessGrants: [], astroDiaryConfig: null },
      now: new Date("2026-01-01T00:01:00.000Z")
    });
    expect(genericProduct).toMatchObject({
      status: "active",
      revision: 3,
      type: "sub",
      paymentModel: "sub",
      executionMode: "async",
      participantMode: "solo",
      accessGrants: [],
      astroDiaryConfig: null
    });
    await createDrizzleOrderStore(runtime.database).create({
      ...prerequisite.orderInput,
      purchasePurpose: { kind: "standard", expectedProductRevision: 3 }
    });
    await seedCheckoutRiskAuthority(runtime, prerequisite.financeAuthority);

    await expect(
      createDrizzleClientOrderCheckoutCaptureAuthorityReader(runtime.database).findForCheckout({
        orderId: prerequisite.authority.orderId
      })
    ).resolves.toBeNull();
    await expect(
      runtime.pool.query(
        `select order_id
           from client_subscription_purchase_fulfillment_authorities
          where order_id = $1`,
        [prerequisite.authority.orderId]
      )
    ).resolves.toMatchObject({ rows: [] });
  });

  it("pins the order's Diary decision across product mutation and later registry revisions", async () => {
    const prerequisite = await seedPurchaseAuthority(runtime);
    await createDrizzleOrderStore(runtime.database).create(prerequisite.orderInput);
    const sealed = await runtime.pool.query<{
      registry_key: string;
      registry_revision: string;
      fulfillment_decision_digest: string;
    }>(
      `select registry_key,
              registry_revision::text,
              fulfillment_decision_digest
         from client_subscription_purchase_fulfillment_authorities
        where order_id = $1`,
      [prerequisite.authority.orderId]
    );
    expect(sealed.rows).toHaveLength(1);

    await runtime.database.insert(financePaidProductFulfillmentDecisions).values({
      supported: true,
      registryKey: "sub.sub.async.solo",
      registryRevision: "2",
      holdAnchor: "booking_completed",
      terminalEvidenceOwner: "booking",
      terminalEvidenceStatus: "completed",
      terminalEvidenceContractVersion: "1",
      cancellationAllocatorOwner: "booking",
      cancellationAllocatorPort: "BookingCancellationRefundDecisionPort",
      cancellationAllocatorPolicyVersion: "1"
    });
    const laterOrder = await seedPurchaseAuthority(runtime);
    await createDrizzleOrderStore(runtime.database).create(laterOrder.orderInput);
    const laterBinding = await runtime.pool.query<{
      registry_revision: string;
      fulfillment_decision_digest: string;
    }>(
      `select registry_revision::text, fulfillment_decision_digest
         from client_subscription_purchase_fulfillment_authorities
        where order_id = $1`,
      [laterOrder.authority.orderId]
    );
    expect(laterBinding.rows).toEqual([
      {
        registry_revision: "1",
        fulfillment_decision_digest: sealed.rows[0]?.fulfillment_decision_digest
      }
    ]);
    const mutatedProduct = await updateProduct({
      store: createDrizzleProductStore(runtime.database),
      ownerUserId: prerequisite.authority.astrologerUserId,
      productId: prerequisite.authority.productId,
      expectedRevision: 2,
      patch: {
        type: "single",
        paymentModel: "once",
        executionMode: "live",
        subscriptionPeriod: null,
        durationMinutes: 60,
        accessGrants: [],
        astroDiaryConfig: null
      },
      now: new Date("2026-01-01T00:02:00.000Z")
    });
    expect(mutatedProduct).toMatchObject({
      revision: 3,
      type: "single",
      paymentModel: "once",
      executionMode: "live"
    });
    await seedCheckoutRiskAuthority(runtime, prerequisite.financeAuthority);

    const authority = await createDrizzleClientOrderCheckoutCaptureAuthorityReader(
      runtime.database
    ).findForCheckout({ orderId: prerequisite.authority.orderId });
    expect(authority?.fulfillmentDecision).toEqual({
      registryKey: sealed.rows[0]?.registry_key,
      registryRevision: Number(sealed.rows[0]?.registry_revision),
      canonicalDigest: sealed.rows[0]?.fulfillment_decision_digest
    });
    expect(authority?.fulfillmentDecision.registryRevision).toBe(1);
    if (!authority) throw new Error("Expected sealed Diary checkout authority");

    const dispatchEnvelope = createProviderDispatchEnvelope({
      kind: "checkout_session_create",
      amount: { amountMinor: 4_900, currency: "RUB" },
      captureMode: "one_stage",
      paymentMethods: [{ method: "bank_card", paymentMode: "redirect" }],
      successUrl: "https://example.test/checkout/success",
      failureUrl: "https://example.test/checkout/failure",
      cancelUrl: "https://example.test/checkout/cancel",
      externalId: prerequisite.authority.orderId,
      orderId: prerequisite.authority.orderId,
      fiscalSnapshot: null
    });
    if (dispatchEnvelope.kind !== "checkout_session_create") {
      throw new Error("Expected checkout dispatch envelope");
    }
    const dispatchBytes = canonicalizeFinanceCommandPayload(dispatchEnvelope);
    const dispatchArtifact = await artifacts.registerSealedArtifact({
      artifact: {
        artifactId: `mutated-product-request-${randomUUID()}`,
        sha256Digest: digest(dispatchBytes),
        byteLength: dispatchBytes.byteLength
      },
      artifactClass: "provider_request",
      binding: { kind: "provider", providerAccount },
      contentType: "application/json",
      privateObject: {
        privateObjectKey: `integration/mutated-product-${prerequisite.authority.orderId}`,
        privateObjectVersion: "v1",
        envelopeKeyVersion: "kms-v1",
        sha256Digest: digest(dispatchBytes),
        byteLength: dispatchBytes.byteLength,
        contentType: "application/json"
      },
      retentionPolicyId: "astro-diary-task-2-provider-request",
      retentionPolicyVersion: "1"
    });
    await expect(
      createDrizzleClientOrderCheckoutPreparationUnitOfWork(
        runtime.database
      ).prepareClientOrderCheckout({
        checkoutPreparationId: randomUUID(),
        checkoutAuthorizationId: `checkout-authority-${randomUUID()}`,
        paymentCommandId: randomUUID(),
        orderId: prerequisite.authority.orderId,
        clientUserId: prerequisite.authority.clientUserId,
        economicPaymentIntentId: `economic-intent-${randomUUID()}`,
        economicPaymentSessionId: `economic-session-${randomUUID()}`,
        providerOperationIntentId: randomUUID(),
        providerAccount,
        dispatchEnvelope,
        dispatchArtifact,
        idempotencyKey: randomUUID(),
        idempotencyRetentionDeadline: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
        captureAuthority: authority,
        operationEnvelope: operationEnvelope()
      })
    ).resolves.toMatchObject({ checkoutPreparation: { state: "checkout_requested" } });
  });

  it("activates through the production capture-dispatch composition from canonical finance evidence and seals its dispatch receipt", async () => {
    const fixture = await seedCanonicalSubscriptionCapture(runtime, artifacts);
    const dispatched = await createDrizzleClientSubscriptionCaptureDispatchUnitOfWork(
      runtime.database
    ).rehydrateAndDispatchClientOrderCapture({
      captureApplicationReceiptId: fixture.captureApplicationReceiptId
    });
    expect(dispatched.outcome).not.toBe("not_client_subscription");
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
    const [purchaseAuthority] = await runtime.database
      .select()
      .from(clientSubscriptionPurchaseAuthorities)
      .where(eq(clientSubscriptionPurchaseAuthorities.orderId, fixture.authority.orderId));
    expect(purchaseAuthority).toMatchObject({
      productRevision: 2,
      cadence: "month",
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
    });
    const [subscription] = await runtime.database
      .select()
      .from(clientSubscriptions)
      .where(eq(clientSubscriptions.id, dispatchReceipt!.subscriptionId));
    expect(subscription).toMatchObject({ state: "active", version: 2 });
    expect(
      await activationArtifactSnapshot(runtime, {
        id: subscription!.id,
        journalEpochId: subscription!.journalEpochId
      })
    ).toEqual({
      subscription_head: { state: "active", version: 2 },
      period_count: 1,
      allowance_count: 1,
      entitlement_count: 1,
      entitlement_transition_application_count: 1,
      entitlement_transition_effect_count: 1,
      lifecycle_count: 2,
      transition_count: 1,
      source_receipt_count: 1,
      journal_count: 1,
      activation_receipt_count: 1,
      activation_event_count: 1,
      delivery_count: 1,
      outbox_count: 1
    });
    expect(fixture.financeCaptureOutboxCount).toBe(1);
    expect(fixture.fulfillmentDecisionId).toBe("sub.sub.async.solo");
    expect(fixture.astrologerAccrual).toEqual({
      account_code: "astrologer_pending",
      account_class: "liability",
      normal_side: "credit",
      astrologer_user_id: fixture.authority.astrologerUserId,
      side: "credit",
      amount_minor: "4704",
      lot_bucket: "pending",
      lot_status: "active",
      wallet_pending_minor: "4704",
      wallet_available_minor: "0"
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
  subscription: Pick<ClientSubscription, "id" | "journalEpochId">
) {
  const result = await runtime.pool.query(
    `select
       (select jsonb_build_object('state', state, 'version', version)
          from client_subscriptions where id = $1) as subscription_head,
       (select count(*)::int from client_subscription_periods where subscription_id = $1) as period_count,
       (select count(*)::int from client_subscription_period_allowances where subscription_id = $1) as allowance_count,
       (select count(*)::int from client_entitlement_grants where subscription_id = $1) as entitlement_count,
       (select count(*)::int from client_entitlement_transition_applications where subscription_id = $1) as entitlement_transition_application_count,
       (select count(*)::int from client_entitlement_transition_effects where subscription_id = $1) as entitlement_transition_effect_count,
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
      status: "draft",
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

  const publishedProduct = await publishProduct({
    store: createDrizzleProductStore(runtime.database),
    ownerUserId: astrologerUserId,
    productId,
    expectedRevision: 1,
    now
  });
  expect(publishedProduct).toMatchObject({ status: "active", revision: 2 });

  const authority = { clientUserId, astrologerUserId, productId, relationshipId, orderId };
  const orderInput: CreateFinanceOrderRecordInput = {
    id: orderId,
    clientUserId,
    astrologerUserId,
    productId,
    productTitleSnapshot: "AstroDiary Task 2 Fix",
    purchasePurpose: {
      kind: "astro_diary_subscription",
      expectedProductRevision: 2,
      acceptedProduct: {
        productId,
        revision: 2,
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

async function seedCheckoutRiskAuthority(
  runtime: PostgresRuntime,
  authority: Readonly<{ policyId: string; policyVersion: number }>
): Promise<void> {
  const risk = createRiskPolicySnapshot({
    id: authority.policyId,
    policyVersion: authority.policyVersion,
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
  await runtime.pool.query(
    `insert into finance_risk_policy_versions
       (policy_id, policy_version, effective_risk_tier, hold_anchor, hold_duration_hours,
        reserve_bps, reserve_release_delay_days, provider_settlement_required,
        payout_minimum_amount_minor, payout_minimum_currency, exception_authority_id,
        exception_authority_version, effective_at, canonical_digest)
     values ($1, $2, 'standard', 'booking_completed', 48, 0, 0, true, 100, 'RUB',
             null, null, '2020-01-01T00:00:00Z', $3)`,
    [authority.policyId, authority.policyVersion, hashFinanceCommandPayload(risk)]
  );
}

async function seedCanonicalSubscriptionCapture(
  runtime: PostgresRuntime,
  artifacts: FinanceArtifactRegistry
) {
  const prerequisite = await seedPurchaseAuthority(runtime);
  await createDrizzleOrderStore(runtime.database).create(prerequisite.orderInput);
  const intentId = `economic-intent-${randomUUID()}`;
  const sessionId = `economic-session-${randomUUID()}`;
  const providerOperationIntentId = randomUUID();
  const webhookId = `webhook-${randomUUID()}`;
  const providerPaymentId = `payment-${randomUUID()}`;
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
  const captureAuthority = await createDrizzleClientOrderCheckoutCaptureAuthorityReader(
    runtime.database
  ).findForCheckout({ orderId: prerequisite.authority.orderId });
  if (!captureAuthority) throw new Error("AstroDiary checkout capture authority was not resolved");
  expect(captureAuthority.fulfillmentDecision.registryKey).toBe("sub.sub.async.solo");

  const dispatchEnvelope = createProviderDispatchEnvelope({
    kind: "checkout_session_create",
    amount: { amountMinor: 4_900, currency: "RUB" },
    captureMode: "one_stage",
    paymentMethods: [{ method: "bank_card", paymentMode: "redirect" }],
    successUrl: "https://example.test/checkout/success",
    failureUrl: "https://example.test/checkout/failure",
    cancelUrl: "https://example.test/checkout/cancel",
    externalId: prerequisite.authority.orderId,
    orderId: prerequisite.authority.orderId,
    fiscalSnapshot: null
  });
  if (dispatchEnvelope.kind !== "checkout_session_create") {
    throw new Error("AstroDiary checkout dispatch envelope was not canonical");
  }
  const dispatchBytes = canonicalizeFinanceCommandPayload(dispatchEnvelope);
  const dispatchArtifact = await artifacts.registerSealedArtifact({
    artifact: {
      artifactId: `provider-request-artifact-${randomUUID()}`,
      sha256Digest: digest(dispatchBytes),
      byteLength: dispatchBytes.byteLength
    },
    artifactClass: "provider_request",
    binding: { kind: "provider", providerAccount },
    contentType: "application/json",
    privateObject: {
      privateObjectKey: `integration/provider-request-${prerequisite.authority.orderId}`,
      privateObjectVersion: "v1",
      envelopeKeyVersion: "kms-v1",
      sha256Digest: digest(dispatchBytes),
      byteLength: dispatchBytes.byteLength,
      contentType: "application/json"
    },
    retentionPolicyId: "astro-diary-task-2-provider-request",
    retentionPolicyVersion: "1"
  });
  const checkout = await createDrizzleClientOrderCheckoutPreparationUnitOfWork(
    runtime.database
  ).prepareClientOrderCheckout({
    checkoutPreparationId: randomUUID(),
    checkoutAuthorizationId: `checkout-authority-${randomUUID()}`,
    paymentCommandId: randomUUID(),
    orderId: prerequisite.authority.orderId,
    clientUserId: prerequisite.authority.clientUserId,
    economicPaymentIntentId: intentId,
    economicPaymentSessionId: sessionId,
    providerOperationIntentId,
    providerAccount,
    dispatchEnvelope,
    dispatchArtifact,
    idempotencyKey: randomUUID(),
    idempotencyRetentionDeadline: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
    captureAuthority,
    operationEnvelope: operationEnvelope()
  });
  expect(checkout.checkoutPreparation.state).toBe("checkout_requested");

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
  const observedAt = new Date().toISOString();
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
  const capture = await runtime.pool.query<{ id: string }>(
    "select id::text from finance_online_sale_capture_applications where economic_payment_intent_id = $1",
    [intentId]
  );
  if (!capture.rows[0]) throw new Error("Canonical capture application was not persisted");
  const financeCaptureOutbox = await runtime.pool.query<{ count: number }>(
    `select count(*)::int as count
       from outbox_events
      where event_type = 'finance.client_order.capture_applied.v1'
        and aggregate_id = $1`,
    [capture.rows[0].id]
  );
  const captureBinding = await runtime.pool.query<{ fulfillment_decision_id: string }>(
    `select fulfillment_decision_id
       from finance_online_sale_capture_authority_bindings
      where order_id = $1`,
    [prerequisite.authority.orderId]
  );
  const astrologerAccrual = await runtime.pool.query<{
    account_code: string;
    account_class: string;
    normal_side: string;
    astrologer_user_id: string;
    side: string;
    amount_minor: string;
    lot_bucket: string;
    lot_status: string;
    wallet_pending_minor: string;
    wallet_available_minor: string;
  }>(
    `select account.code as account_code,
            account.account_class,
            account.normal_side,
            account.astrologer_user_id::text as astrologer_user_id,
            entry.side,
            entry.amount_minor::text as amount_minor,
            lot.bucket as lot_bucket,
            lot.status as lot_status,
            wallet.pending_minor::text as wallet_pending_minor,
            wallet.available_minor::text as wallet_available_minor
       from finance_online_sale_capture_applications application
       join finance_online_sale_capture_journal_proofs proof
         on proof.proof_id = application.online_sale_journal_proof_id
       join finance_online_sale_capture_journal_proof_entries proof_entry
         on proof_entry.proof_id = proof.proof_id
       join finance_journal_entries entry
         on entry.id = proof_entry.journal_entry_id
       join finance_accounts account
         on account.id = entry.account_id
       join finance_online_sale_capture_root_lots lot
         on lot.receipt_id = application.online_sale_receipt_id
       join finance_online_wallet_heads wallet
         on wallet.id = application.online_wallet_id
      where application.id = $1
        and account.code = 'astrologer_pending'`,
    [capture.rows[0].id]
  );
  if (astrologerAccrual.rows.length !== 1) {
    throw new Error("Canonical capture did not accrue exactly one astrologer payable credit");
  }
  const [product] = await runtime.database
    .select()
    .from(products)
    .where(eq(products.id, prerequisite.authority.productId));
  expect(product).toMatchObject({
    revision: 2,
    type: "sub",
    paymentModel: "sub",
    executionMode: "async",
    subscriptionPeriod: "month",
    participantMode: "solo",
    astroDiaryReflectionCyclesPerPeriod: 4,
    astroDiaryResponseSlaWorkingDays: 2,
    astroDiaryClientResponseWindowCalendarDays: 5,
    astroDiaryWorkingWeekdaysMask: 31,
    astroDiaryServiceTimezone: "Europe/Moscow"
  });
  return {
    authority: prerequisite.authority,
    captureApplicationReceiptId: capture.rows[0].id,
    financeCaptureOutboxCount: financeCaptureOutbox.rows[0]?.count ?? 0,
    fulfillmentDecisionId: captureBinding.rows[0]?.fulfillment_decision_id ?? null,
    astrologerAccrual: astrologerAccrual.rows[0]
  };
}

function operationEnvelope() {
  return resolveFinanceOperationEnvelope({
    policy: publishFinanceOperationResourcePolicyDraft(
      createFinanceOperationResourcePolicyDraft({
        policyId: "client_order_capture",
        version: 1,
        operationKind: "client_checkout_prepare",
        maximumRows: 100,
        maximumDecimalDigits: 38,
        maximumArtifactBytes: 64 * 1024
      })
    ),
    operationKind: "client_checkout_prepare"
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
