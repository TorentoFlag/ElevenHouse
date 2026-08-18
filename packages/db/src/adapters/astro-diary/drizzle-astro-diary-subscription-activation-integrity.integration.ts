import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  applyClientSubscriptionCaptureDispatch,
  canonicalizeFinanceCommandPayload,
  createOrder,
  createPendingClientSubscription,
  executeClientSubscriptionCreation,
  publishProduct,
  sealClientSubscriptionContract,
  updateProduct,
  type ClientSubscription
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
import {
  financeProviderAccountSeries,
  financeProviderAccounts
} from "../../schema/finance/provider-accounts.schema";
import { users } from "../../schema/identity/accounts.schema";
import { platformTariffSubscriptions } from "../../schema/platform-billing/tariff-authority.schema";
import { productAccessGrants } from "../../schema/products/product-access-grants.schema";
import { productDeliveryFormats } from "../../schema/products/product-delivery-formats.schema";
import { products } from "../../schema/products/products.schema";
import { availabilitySchedules } from "../../schema/scheduling/availability.schema";
import { bookings, scheduleReservations } from "../../schema/scheduling/bookings.schema";
import { createDrizzleClientStore } from "../clients/drizzle-client-store";
import { createDrizzleClientSubscriptionCreationUnitOfWork } from "../client-subscriptions/drizzle-client-subscription-creation-uow";
import { createDrizzleClientSubscriptionCaptureDispatchUnitOfWork } from "../client-subscriptions/drizzle-client-subscription-capture-dispatch-uow";
import { applyDrizzleClientSubscriptionSourceEventInTransaction } from "../client-subscriptions/drizzle-client-subscription-uow";
import { createDrizzleClientOrderCheckoutCaptureAuthorityReader } from "../finance/drizzle-client-order-checkout-capture-authority-reader";
import { createDrizzleClientOrderCheckoutPreparationUnitOfWork } from "../finance/drizzle-client-order-checkout-preparation-uow";
import { createDrizzleCapturedClientOrderWebhookClaimPort } from "../finance/drizzle-captured-client-order-webhook-claim-port";
import { createDrizzleOnlineSaleCaptureCanonicalWebhookUnitOfWork } from "../finance/drizzle-online-sale-capture-canonical-webhook-uow";
import { createDrizzleOnlineSaleCapturePersistenceResolver } from "../finance/drizzle-online-sale-capture-persistence-resolver";
import { createDrizzleFinancePolicyStore } from "../finance/drizzle-finance-policy-store";
import { createDrizzleOrderStore } from "../finance/drizzle-order-store";
import { createDrizzleWebhookIngressStorageUnitOfWork } from "../finance/drizzle-webhook-ingress-storage-uow";
import { createDrizzleProductStore } from "../products/drizzle-products-store";
import { createDrizzlePlatformTariffAuthorityStore } from "../platform-billing/drizzle-platform-tariff-authority-store";
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
    await createProductionOrder(runtime, prerequisite);

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
    await createProductionOrder(runtime, prerequisite, 3);
    await seedCheckoutRiskAuthority(runtime, prerequisite.financeAuthority);

    await expect(
      createDrizzleClientOrderCheckoutCaptureAuthorityReader(runtime.database).findForCheckout({
        orderId: prerequisite.authority.orderId
      })
    ).resolves.toBeNull();
    await expect(
      runtime.pool.query(
        `select order_id
           from client_subscription_purchase_authorities
          where order_id = $1::uuid
          union all
         select order_id
           from client_subscription_purchase_fulfillment_authorities
          where order_id = $1::uuid`,
        [prerequisite.authority.orderId]
      )
    ).resolves.toMatchObject({ rows: [] });

    const injectedAuthority = await runtime.pool.query<{
      risk_policy_id: string;
      risk_policy_version: string;
      risk_policy_digest: string;
      registry_revision: string;
      fulfillment_decision_digest: string;
    }>(
      `select risk.policy_id as risk_policy_id,
              risk.policy_version::text as risk_policy_version,
              risk.canonical_digest as risk_policy_digest,
              fulfillment.registry_revision::text as registry_revision,
              fulfillment.canonical_digest as fulfillment_decision_digest
         from finance_risk_policy_versions risk
         cross join finance_paid_product_fulfillment_decisions fulfillment
        where risk.policy_id = $1
          and risk.policy_version = $2
          and fulfillment.registry_key = 'sub.sub.async.solo'
          and fulfillment.registry_revision = 1`,
      [prerequisite.financeAuthority.policyId, prerequisite.financeAuthority.policyVersion]
    );
    expect(injectedAuthority.rows).toHaveLength(1);
    const globalDiaryAuthority = injectedAuthority.rows[0];
    if (!globalDiaryAuthority) throw new Error("Expected globally registered Diary authority");

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
        artifactId: `generic-reserved-key-request-${randomUUID()}`,
        sha256Digest: digest(dispatchBytes),
        byteLength: dispatchBytes.byteLength
      },
      artifactClass: "provider_request",
      binding: { kind: "provider", providerAccount },
      contentType: "application/json",
      privateObject: {
        privateObjectKey: `integration/generic-reserved-key-${prerequisite.authority.orderId}`,
        privateObjectVersion: "v1",
        envelopeKeyVersion: "kms-v1",
        sha256Digest: digest(dispatchBytes),
        byteLength: dispatchBytes.byteLength,
        contentType: "application/json"
      },
      retentionPolicyId: "astro-diary-task-2-provider-request",
      retentionPolicyVersion: "1"
    });
    const checkoutPreparationId = randomUUID();
    const checkoutAuthorizationId = `checkout-authority-${randomUUID()}`;
    const economicPaymentIntentId = `economic-intent-${randomUUID()}`;
    const economicPaymentSessionId = `economic-session-${randomUUID()}`;
    const providerOperationIntentId = randomUUID();

    await expect(
      createDrizzleClientOrderCheckoutPreparationUnitOfWork(
        runtime.database
      ).prepareClientOrderCheckout({
        checkoutPreparationId,
        checkoutAuthorizationId,
        paymentCommandId: randomUUID(),
        orderId: prerequisite.authority.orderId,
        clientUserId: prerequisite.authority.clientUserId,
        economicPaymentIntentId,
        economicPaymentSessionId,
        providerOperationIntentId,
        providerAccount,
        dispatchEnvelope,
        dispatchArtifact,
        idempotencyKey: randomUUID(),
        idempotencyRetentionDeadline: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
        captureAuthority: {
          riskPolicy: {
            policyId: globalDiaryAuthority.risk_policy_id,
            policyVersion: Number(globalDiaryAuthority.risk_policy_version),
            canonicalDigest: globalDiaryAuthority.risk_policy_digest as `sha256:${string}`
          },
          fulfillmentDecision: {
            registryKey: "sub.sub.async.solo",
            registryRevision: Number(globalDiaryAuthority.registry_revision),
            canonicalDigest: globalDiaryAuthority.fulfillment_decision_digest as `sha256:${string}`
          }
        },
        operationEnvelope: operationEnvelope()
      })
    ).rejects.toMatchObject({ reason: "persistence_write_incomplete" });

    const artifactsAfterRejection = await runtime.pool.query<{
      checkout_preparation_count: number;
      checkout_authorization_count: number;
      economic_intent_count: number;
      economic_source_head_count: number;
      economic_intent_receipt_count: number;
      economic_session_count: number;
      economic_session_receipt_count: number;
      provider_operation_count: number;
      checkout_outbox_count: number;
      capture_binding_count: number;
      capture_application_count: number;
      wallet_count: number;
      subscription_count: number;
      astro_diary_journal_count: number;
      finance_journal_transaction_count: number;
      finance_journal_entry_count: number;
    }>(
      `select
         (select count(*)::int from finance_client_checkout_preparations
           where id = $1::uuid) as checkout_preparation_count,
         (select count(*)::int from finance_client_checkout_authorizations
           where authority_id = $2) as checkout_authorization_count,
         (select count(*)::int from finance_economic_payment_intents
           where id = $3) as economic_intent_count,
         (select count(*)::int from finance_economic_payment_source_heads
           where purpose = 'client_order' and source_id = $4::uuid::text) as economic_source_head_count,
         (select count(*)::int from finance_economic_payment_intent_creation_receipts
           where economic_payment_intent_id = $3) as economic_intent_receipt_count,
         (select count(*)::int from finance_economic_payment_sessions
           where id = $5) as economic_session_count,
         (select count(*)::int from finance_economic_payment_session_open_receipts
           where economic_payment_session_id = $5) as economic_session_receipt_count,
         (select count(*)::int from finance_provider_operation_intents
           where id = $6) as provider_operation_count,
         (select count(*)::int from outbox_events
           where aggregate_id = $6::uuid) as checkout_outbox_count,
         (select count(*)::int from finance_online_sale_capture_authority_bindings
           where order_id = $4::uuid::text) as capture_binding_count,
         (select count(*)::int
            from finance_online_sale_capture_applications application
            join finance_online_sale_capture_authority_bindings binding
              on binding.receipt_id = application.online_sale_receipt_id
           where binding.order_id = $4::uuid::text) as capture_application_count,
         (select count(*)::int from finance_online_wallet_heads
           where astrologer_user_id = $7::uuid) as wallet_count,
         (select count(*)::int from client_subscriptions
           where relationship_id = $8::uuid) as subscription_count,
         (select count(*)::int from astro_diary_journals
           where relationship_id = $8::uuid) as astro_diary_journal_count,
         (select count(*)::int
            from finance_journal_transactions journal_transaction
            join finance_source_identities source_identity
              on source_identity.id = journal_transaction.source_identity_id
           where source_identity.source_kind = 'order'
             and source_identity.source_id = $4::uuid::text) as finance_journal_transaction_count,
         (select count(*)::int
            from finance_journal_entries journal_entry
            join finance_journal_transactions journal_transaction
              on journal_transaction.id = journal_entry.journal_transaction_id
            join finance_source_identities source_identity
              on source_identity.id = journal_transaction.source_identity_id
           where source_identity.source_kind = 'order'
             and source_identity.source_id = $4::uuid::text) as finance_journal_entry_count`,
      [
        checkoutPreparationId,
        checkoutAuthorizationId,
        economicPaymentIntentId,
        prerequisite.authority.orderId,
        economicPaymentSessionId,
        providerOperationIntentId,
        prerequisite.authority.astrologerUserId,
        prerequisite.authority.relationshipId
      ]
    );
    expect(artifactsAfterRejection.rows).toEqual([
      {
        checkout_preparation_count: 0,
        checkout_authorization_count: 0,
        economic_intent_count: 0,
        economic_source_head_count: 0,
        economic_intent_receipt_count: 0,
        economic_session_count: 0,
        economic_session_receipt_count: 0,
        provider_operation_count: 0,
        checkout_outbox_count: 0,
        capture_binding_count: 0,
        capture_application_count: 0,
        wallet_count: 0,
        subscription_count: 0,
        astro_diary_journal_count: 0,
        finance_journal_transaction_count: 0,
        finance_journal_entry_count: 0
      }
    ]);
  });

  it("pins the order's Diary decision across product mutation and later registry revisions", async () => {
    const prerequisite = await seedPurchaseAuthority(runtime);
    await createProductionOrder(runtime, prerequisite);
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
    await createProductionOrder(runtime, laterOrder);
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

  it("rejects a misrouted single decision for a sealed Diary order before capture and leaves no paid artifacts", async () => {
    const prerequisite = await seedPurchaseAuthority(runtime);
    await createProductionOrder(runtime, prerequisite);
    await seedCheckoutRiskAuthority(runtime, prerequisite.financeAuthority);

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
      now: new Date("2026-01-01T00:03:00.000Z")
    });
    expect(mutatedProduct).toMatchObject({
      revision: 3,
      type: "single",
      paymentModel: "once",
      executionMode: "live"
    });

    const sealedAuthority = await createDrizzleClientOrderCheckoutCaptureAuthorityReader(
      runtime.database
    ).findForCheckout({ orderId: prerequisite.authority.orderId });
    if (!sealedAuthority) throw new Error("Expected sealed Diary checkout authority");
    expect(sealedAuthority.fulfillmentDecision.registryKey).toBe("sub.sub.async.solo");

    await runtime.database.insert(financePaidProductFulfillmentDecisions).values({
      supported: true,
      registryKey: "single.once.live.solo",
      registryRevision: "1",
      holdAnchor: "booking_completed",
      terminalEvidenceOwner: "booking",
      terminalEvidenceStatus: "completed",
      terminalEvidenceContractVersion: "1",
      cancellationAllocatorOwner: "booking",
      cancellationAllocatorPort: "BookingCancellationRefundDecisionPort",
      cancellationAllocatorPolicyVersion: "1"
    });
    const wrongDecision = await runtime.pool.query<{
      registry_revision: string;
      canonical_digest: string;
    }>(
      `select registry_revision::text, canonical_digest
         from finance_paid_product_fulfillment_decisions
        where registry_key = 'single.once.live.solo'
        order by registry_revision desc
        limit 1`
    );
    if (!wrongDecision.rows[0]) throw new Error("Expected live single fulfillment decision");

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
        artifactId: `misrouted-single-request-${randomUUID()}`,
        sha256Digest: digest(dispatchBytes),
        byteLength: dispatchBytes.byteLength
      },
      artifactClass: "provider_request",
      binding: { kind: "provider", providerAccount },
      contentType: "application/json",
      privateObject: {
        privateObjectKey: `integration/misrouted-single-${prerequisite.authority.orderId}`,
        privateObjectVersion: "v1",
        envelopeKeyVersion: "kms-v1",
        sha256Digest: digest(dispatchBytes),
        byteLength: dispatchBytes.byteLength,
        contentType: "application/json"
      },
      retentionPolicyId: "astro-diary-task-2-provider-request",
      retentionPolicyVersion: "1"
    });
    const economicPaymentIntentId = `economic-intent-${randomUUID()}`;

    await expect(
      createDrizzleClientOrderCheckoutPreparationUnitOfWork(
        runtime.database
      ).prepareClientOrderCheckout({
        checkoutPreparationId: randomUUID(),
        checkoutAuthorizationId: `checkout-authority-${randomUUID()}`,
        paymentCommandId: randomUUID(),
        orderId: prerequisite.authority.orderId,
        clientUserId: prerequisite.authority.clientUserId,
        economicPaymentIntentId,
        economicPaymentSessionId: `economic-session-${randomUUID()}`,
        providerOperationIntentId: randomUUID(),
        providerAccount,
        dispatchEnvelope,
        dispatchArtifact,
        idempotencyKey: randomUUID(),
        idempotencyRetentionDeadline: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
        captureAuthority: {
          riskPolicy: sealedAuthority.riskPolicy,
          fulfillmentDecision: {
            registryKey: "single.once.live.solo",
            registryRevision: Number(wrongDecision.rows[0].registry_revision),
            canonicalDigest: wrongDecision.rows[0].canonical_digest as `sha256:${string}`
          }
        },
        operationEnvelope: operationEnvelope()
      })
    ).rejects.toMatchObject({ reason: "persistence_write_incomplete" });

    const paidArtifacts = await runtime.pool.query<{
      checkout_intent_count: number;
      checkout_authorization_count: number;
      wallet_count: number;
      capture_binding_count: number;
      capture_application_count: number;
      subscription_count: number;
      journal_count: number;
    }>(
      `select
         (select count(*)::int from finance_economic_payment_intents
           where id = $1) as checkout_intent_count,
         (select count(*)::int from finance_client_checkout_authorizations
           where order_id = $2::uuid) as checkout_authorization_count,
         (select count(*)::int from finance_online_wallet_heads
           where astrologer_user_id = $3::uuid) as wallet_count,
         (select count(*)::int from finance_online_sale_capture_authority_bindings
           where order_id = $2::text) as capture_binding_count,
         (select count(*)::int
            from finance_online_sale_capture_applications application
            join finance_online_sale_capture_authority_bindings binding
              on binding.receipt_id = application.online_sale_receipt_id
           where binding.order_id = $2::text) as capture_application_count,
         (select count(*)::int from client_subscriptions
           where relationship_id = $4::uuid) as subscription_count,
         (select count(*)::int from astro_diary_journals
           where relationship_id = $4::uuid) as journal_count`,
      [
        economicPaymentIntentId,
        prerequisite.authority.orderId,
        prerequisite.authority.astrologerUserId,
        prerequisite.authority.relationshipId
      ]
    );
    expect(paidArtifacts.rows).toEqual([
      {
        checkout_intent_count: 0,
        checkout_authorization_count: 0,
        wallet_count: 0,
        capture_binding_count: 0,
        capture_application_count: 0,
        subscription_count: 0,
        journal_count: 0
      }
    ]);
  });

  it("preserves checkout for a standard live product without Diary purchase authority", async () => {
    const prerequisite = await seedPurchaseAuthority(runtime);
    const standardProduct = await updateProduct({
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
      now: new Date("2026-01-01T00:03:00.000Z")
    });
    expect(standardProduct).toMatchObject({
      status: "active",
      revision: 3,
      type: "single",
      paymentModel: "once",
      executionMode: "live"
    });
    const bookingId = await seedPaidBookingHold(runtime, prerequisite);
    await createProductionOrder(runtime, prerequisite, 3, bookingId);
    await seedCheckoutRiskAuthority(runtime, prerequisite.financeAuthority);
    await runtime.database
      .insert(financePaidProductFulfillmentDecisions)
      .values({
        supported: true,
        registryKey: "single.once.live.solo",
        registryRevision: "1",
        holdAnchor: "booking_completed",
        terminalEvidenceOwner: "booking",
        terminalEvidenceStatus: "completed",
        terminalEvidenceContractVersion: "1",
        cancellationAllocatorOwner: "booking",
        cancellationAllocatorPort: "BookingCancellationRefundDecisionPort",
        cancellationAllocatorPolicyVersion: "1"
      })
      .onConflictDoNothing();

    const authority = await createDrizzleClientOrderCheckoutCaptureAuthorityReader(
      runtime.database
    ).findForCheckout({ orderId: prerequisite.authority.orderId });
    if (!authority) throw new Error("Expected standard live checkout authority");
    expect(authority.fulfillmentDecision.registryKey).toBe("single.once.live.solo");
    await expect(
      runtime.pool.query(
        `select order_id
           from client_subscription_purchase_authorities
          where order_id = $1::uuid
          union all
         select order_id
           from client_subscription_purchase_fulfillment_authorities
          where order_id = $1::uuid`,
        [prerequisite.authority.orderId]
      )
    ).resolves.toMatchObject({ rows: [] });

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
        artifactId: `standard-live-request-${randomUUID()}`,
        sha256Digest: digest(dispatchBytes),
        byteLength: dispatchBytes.byteLength
      },
      artifactClass: "provider_request",
      binding: { kind: "provider", providerAccount },
      contentType: "application/json",
      privateObject: {
        privateObjectKey: `integration/standard-live-${prerequisite.authority.orderId}`,
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
  await createProductionOrder(runtime, prerequisite);
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
  const policyVersion = nextPolicyVersion++;
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
  });

  await createDrizzleFinancePolicyStore(runtime.database).createPolicySnapshot({
    id: policyId,
    policyVersion,
    riskTier: "standard",
    holdDurationHours: 48,
    reserveBps: 0,
    reserveReleaseDelayDays: 0,
    providerSettlementRequired: true,
    createdByUserId: astrologerUserId,
    now: now.toISOString()
  });

  const tariffStore = createDrizzlePlatformTariffAuthorityStore({ database: runtime.database });
  const tariffDraft = await tariffStore.createDraft({
    tariffSeriesId,
    version: 1,
    name: "Task 2 Fix",
    tagline: "Task 2 Fix",
    monthlyPriceMinor: 0,
    yearlyPriceMinor: 0,
    monthlyRecurringFrequencyDays: null,
    yearlyRecurringFrequencyDays: null,
    clientSaleCommissionBps: 400,
    seatsLimit: 1,
    bookingsLimit: null,
    aiRequestsLimit: null,
    automationLimit: null,
    isPopular: false,
    displayOrder: 1,
    features: ["products"]
  });
  const publishedTariff = await tariffStore.publishDraft({
    tariffSeriesId,
    version: 1,
    expectedDraftRevision: tariffDraft.draftRevision
  });
  await runtime.database.insert(platformTariffSubscriptions).values({
    id: randomUUID(),
    ownerUserId: astrologerUserId,
    tariffSeriesId,
    tariffVersion: 1,
    tariffVersionDigest: publishedTariff.canonicalDigest,
    commissionBpsSnapshot: 400,
    billingCycle: "month",
    state: "active",
    version: 1,
    startsAt: new Date("2025-01-01T00:00:00.000Z"),
    endsAt: new Date("2027-01-01T00:00:00.000Z"),
    createdAt: now,
    updatedAt: now
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
  return {
    authority,
    financeAuthority: {
      policyId,
      policyVersion,
      tariffSeriesId,
      tariffDigest: publishedTariff.canonicalDigest
    }
  };
}

async function createProductionOrder(
  runtime: PostgresRuntime,
  prerequisite: Awaited<ReturnType<typeof seedPurchaseAuthority>>,
  expectedProductRevision = 2,
  bookingId: string | null = null
) {
  const clientStore = createDrizzleClientStore(runtime.database);
  const order = await createOrder({
    orderStore: createDrizzleOrderStore(runtime.database),
    relationshipReader: {
      hasActiveRelationship: async (input) => Boolean(await clientStore.getAstrologerClient(input))
    },
    productStore: createDrizzleProductStore(runtime.database),
    financePolicyStore: createDrizzleFinancePolicyStore(runtime.database),
    tariffAuthorityStore: createDrizzlePlatformTariffAuthorityStore({
      database: runtime.database
    }),
    clientUserId: prerequisite.authority.clientUserId,
    request: {
      astrologerUserId: prerequisite.authority.astrologerUserId,
      productId: prerequisite.authority.productId,
      expectedProductRevision,
      directLinkIntentId: null,
      bookingId
    },
    idempotencyKey: `task-2-order-${prerequisite.authority.orderId}`,
    now: new Date("2026-01-01T00:00:00.000Z"),
    idGenerator: () => prerequisite.authority.orderId
  });
  expect(order).toMatchObject({
    id: prerequisite.authority.orderId,
    clientUserId: prerequisite.authority.clientUserId,
    astrologerUserId: prerequisite.authority.astrologerUserId,
    productId: prerequisite.authority.productId,
    status: "pending_payment",
    grossAmount: { amountMinor: 4_900, currency: "RUB" },
    platformFee: { amountMinor: 196, currency: "RUB" },
    astrologerNetAmount: { amountMinor: 4_704, currency: "RUB" }
  });
  return order;
}

async function seedPaidBookingHold(
  runtime: PostgresRuntime,
  prerequisite: Awaited<ReturnType<typeof seedPurchaseAuthority>>
): Promise<string> {
  const scheduleId = randomUUID();
  const reservationId = randomUUID();
  const bookingId = randomUUID();
  const now = new Date("2026-01-01T00:00:00.000Z");
  const holdExpiresAt = new Date("2026-01-02T00:00:00.000Z");
  const serviceStartAt = new Date("2026-01-10T12:00:00.000Z");
  const serviceEndAt = new Date("2026-01-10T13:00:00.000Z");

  await runtime.database.transaction(async (transaction) => {
    await transaction.insert(availabilitySchedules).values({
      id: scheduleId,
      ownerUserId: prerequisite.authority.astrologerUserId,
      name: "Task 2 standard checkout",
      timeZone: "Europe/Moscow",
      isDefault: true,
      version: 1,
      startIntervalMinutes: 60,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      minimumNoticeMinutes: 0,
      bookingHorizonDays: 365,
      maximumBookingsPerDay: null,
      createdAt: now,
      updatedAt: now
    });
    await transaction.insert(scheduleReservations).values({
      id: reservationId,
      ownerUserId: prerequisite.authority.astrologerUserId,
      scheduleId,
      kind: "hold",
      lifecycle: "active",
      serviceStartAt,
      serviceEndAt,
      occupiedStartAt: serviceStartAt,
      occupiedEndAt: serviceEndAt,
      sourceAggregateId: null,
      holdExpiresAt,
      createdAt: now,
      updatedAt: now
    });
    await transaction.insert(bookings).values({
      id: bookingId,
      ownerUserId: prerequisite.authority.astrologerUserId,
      clientUserId: prerequisite.authority.clientUserId,
      productId: prerequisite.authority.productId,
      reservationId,
      source: "client_paid",
      state: "hold",
      lifecycleRevision: 0,
      holdExpiresAt,
      serviceStartAt,
      serviceEndAt,
      productTitleSnapshot: "AstroDiary Task 2 Fix",
      durationMinutesSnapshot: 60,
      deliveryFormatSnapshot: "chat",
      priceMinorSnapshot: 4_900,
      currencySnapshot: "RUB",
      timeZoneSnapshot: "Europe/Moscow",
      policySnapshot: {
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        minimumNoticeMinutes: 0
      },
      clientDataRequirementsSnapshot: {
        schemaVersion: "booking-client-data-requirements.v1",
        executionMode: "live",
        participantMode: "solo",
        requiredClientData: [],
        methods: []
      },
      createdAt: now,
      updatedAt: now
    });
  });

  return bookingId;
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
  await createProductionOrder(runtime, prerequisite);
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
