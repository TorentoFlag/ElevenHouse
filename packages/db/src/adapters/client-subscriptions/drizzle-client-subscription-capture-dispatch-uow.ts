import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import {
  applyClientSubscriptionCaptureDispatch,
  createPendingClientSubscription,
  sealFinanceClientOrderSubscriptionCaptureAuthority,
  sealClientSubscriptionContract,
  sha256CanonicalJson
} from "@elevenhouse/domain";
import type { ClientSubscriptionEvent } from "@elevenhouse/contracts";
import {
  createFinanceClientOrderCaptureDispatchReceipt,
  type FinanceClientOrderCapturePurposeDispatchExecution,
  type FinanceClientOrderCapturePurposeDispatchUnitOfWork
} from "@elevenhouse/domain/finance-core";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  clientSubscriptionContracts,
  clientSubscriptionPurchaseAuthorities,
  clientSubscriptions
} from "../../schema/client-subscriptions";
import {
  financeClientSubscriptionCaptureDispatchReceipts,
  financeEconomicPaymentIntents,
  financeOnlineSaleCaptureApplications
} from "../../schema/finance";
import { financeProviderSemanticFacts } from "../../schema/finance/webhook-inbox.schema";
import { executeDrizzleClientSubscriptionCreationInTransaction } from "./drizzle-client-subscription-creation-uow";
import { findClientSubscriptionById } from "./drizzle-client-subscription-reader";
import { applyDrizzleClientSubscriptionSourceEventInTransaction } from "./drizzle-client-subscription-uow";

/**
 * Rehydrates the capture/order/contract authority under one PostgreSQL transaction. The outbox
 * input is only a receipt ID; it never carries a subscription, amount, period, or lifecycle ID.
 */
export function createDrizzleClientSubscriptionCaptureDispatchUnitOfWork(
  database: ElevenHouseDatabase
): FinanceClientOrderCapturePurposeDispatchUnitOfWork {
  return {
    rehydrateAndDispatchClientOrderCapture: (input) =>
      database.transaction(
        async (transaction): Promise<FinanceClientOrderCapturePurposeDispatchExecution> => {
          await transaction.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${`client-subscription-capture:${input.captureApplicationReceiptId}`}, 0))`
          );
          const [capture] = await transaction
            .select({
              id: financeOnlineSaleCaptureApplications.id,
              canonicalDigest: financeOnlineSaleCaptureApplications.canonicalDigest,
              orderId: financeEconomicPaymentIntents.sourceId,
              observedAt: financeProviderSemanticFacts.observedAt
            })
            .from(financeOnlineSaleCaptureApplications)
            .innerJoin(
              financeEconomicPaymentIntents,
              eq(
                financeEconomicPaymentIntents.id,
                financeOnlineSaleCaptureApplications.economicPaymentIntentId
              )
            )
            .innerJoin(
              financeProviderSemanticFacts,
              eq(financeProviderSemanticFacts.id, financeOnlineSaleCaptureApplications.semanticFactId)
            )
            .where(
              eq(
                financeOnlineSaleCaptureApplications.id,
                input.captureApplicationReceiptId
              )
            )
            .for("update")
            .limit(1);
          if (!capture) return { outcome: "capture_not_found" };

          const [prior] = await transaction
            .select()
            .from(financeClientSubscriptionCaptureDispatchReceipts)
            .where(
              eq(
                financeClientSubscriptionCaptureDispatchReceipts.captureApplicationReceiptId,
                input.captureApplicationReceiptId
              )
            )
            .limit(1);
          if (prior) return replayDispatchReceipt(prior);

          const [authority] = await transaction
            .select()
            .from(clientSubscriptionPurchaseAuthorities)
            .where(eq(clientSubscriptionPurchaseAuthorities.orderId, capture.orderId))
            .for("no key update")
            .limit(1);
          if (!authority) return { outcome: "not_client_subscription" };

          const subscription = await loadOrCreatePendingSubscription(transaction, {
            orderId: authority.orderId,
            productId: authority.productId,
            relationshipId: authority.relationshipId,
            capturedAt: capture.observedAt.toISOString()
          });
          if (!subscription || subscription.state !== "pending_initial_payment") {
            return { outcome: "authority_conflict" };
          }

          const receipt = createFinanceClientOrderCaptureDispatchReceipt({
            authority: initialAuthority({
              captureApplicationReceiptId: capture.id,
              captureApplicationDigest: capture.canonicalDigest,
              orderId: authority.orderId,
              contractId: subscription.contract.id,
              contractCanonicalDigest: subscription.contract.canonicalDigest,
              subscriptionId: subscription.id,
              subscriptionExpectedVersion: subscription.version,
              capturedAt: capture.observedAt.toISOString()
            }),
            dispatchReceiptId: randomUUID(),
            sourceEventId: randomUUID(),
            target: {
              kind: "initial",
              periodId: randomUUID(),
              activatedEventId: randomUUID(),
              entitlementChangedEventId: randomUUID()
            },
            dispatchedAt: new Date(
              Math.max(Date.now(), capture.observedAt.getTime())
            ).toISOString()
          });
          const application = await applyClientSubscriptionCaptureDispatch(
            {
              apply: (source) =>
                applyDrizzleClientSubscriptionSourceEventInTransaction(transaction, source)
            },
            { sourceEvent: sourceEventFor(receipt), dispatchReceipt: receipt }
          );
          if (application.outcome !== "applied") {
            return { outcome: dispatchFailureOutcome(application.outcome) };
          }

          await transaction.insert(financeClientSubscriptionCaptureDispatchReceipts).values({
            dispatchReceiptId: receipt.dispatchReceiptId,
            captureApplicationReceiptId: capture.id,
            captureApplicationDigest: receipt.authority.captureApplicationDigest,
            orderId: authority.orderId,
            contractId: subscription.contract.id,
            contractCanonicalDigest: asDigest(subscription.contract.canonicalDigest),
            subscriptionId: subscription.id,
            subscriptionExpectedVersion: subscription.version,
            captureKind: "initial",
            renewalRequestId: null,
            intendedPeriodId: null,
            sourceEventId: receipt.sourceEventId,
            sourceEventDigest: receipt.sourceEventDigest,
            periodId: receipt.target.periodId,
            primaryLifecycleEventId: initialTarget(receipt).activatedEventId,
            entitlementChangedEventId: receipt.target.entitlementChangedEventId,
            canonicalPreimage: "server-issued",
            canonicalDigest: "sha256:" + "0".repeat(64),
            capturedAt: capture.observedAt,
            dispatchedAt: new Date(receipt.dispatchedAt)
          });
          return { outcome: "dispatched", receipt, sourceEvent: sourceEventFor(receipt) };
        }
      )
  };
}

async function loadOrCreatePendingSubscription(
  transaction: Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0],
  input: Readonly<{
    orderId: string;
    productId: string;
    relationshipId: string;
    capturedAt: string;
  }>
) {
  const [existingContract] = await transaction
    .select({ subscriptionId: clientSubscriptions.id })
    .from(clientSubscriptionContracts)
    .leftJoin(
      clientSubscriptions,
      eq(clientSubscriptions.contractId, clientSubscriptionContracts.id)
    )
    .where(eq(clientSubscriptionContracts.orderId, input.orderId))
    .limit(1);
  if (existingContract?.subscriptionId) {
    return await findClientSubscriptionById(transaction, existingContract.subscriptionId, "update");
  }
  if (existingContract) return null;

  const subscriptionId = randomUUID();
  const contractId = randomUUID();
  const journalEpochId = randomUUID();
  const creation = await executeDrizzleClientSubscriptionCreationInTransaction(transaction, {
    subscriptionId,
    orderId: input.orderId,
    productId: input.productId,
    relationshipId: input.relationshipId,
    expectedSlotVersion: 0,
    idempotencyKey: `capture-initial:${input.orderId}`,
    requestHash: sha256CanonicalJson({
      purpose: "client_subscription_initial_capture",
      orderId: input.orderId,
      subscriptionId,
      contractId,
      journalEpochId
    }),
    decide: (authority) => {
      const sealed = sealClientSubscriptionContract({
        contractId,
        order: authority.order,
        product: authority.product,
        relationship: authority.relationship,
        createdAt: input.capturedAt
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
  });
  return creation.outcome === "created" ? creation.subscription : null;
}

function sourceEventFor(
  receipt: ReturnType<typeof createFinanceClientOrderCaptureDispatchReceipt>
) {
  return {
    eventId: receipt.sourceEventId,
    eventType: "client_subscription.capture_applied.v1" as const,
    schemaVersion: 1 as const,
    occurredAt: receipt.authority.capturedAt,
    data: {
      subscriptionId: receipt.authority.subscriptionId,
      contractId: receipt.authority.contractId,
      periodId: receipt.target.periodId,
      financeEvidenceId: receipt.authority.captureApplicationReceiptId
    }
  } satisfies ClientSubscriptionEvent;
}

function initialTarget(receipt: ReturnType<typeof createFinanceClientOrderCaptureDispatchReceipt>) {
  if (receipt.target.kind !== "initial")
    throw new Error("Expected initial capture dispatch target");
  return receipt.target;
}

function replayDispatchReceipt(
  row: typeof financeClientSubscriptionCaptureDispatchReceipts.$inferSelect
): FinanceClientOrderCapturePurposeDispatchExecution {
  if (row.captureKind !== "initial" || row.renewalRequestId || row.intendedPeriodId) {
    return { outcome: "authority_conflict" };
  }
  const receipt = createFinanceClientOrderCaptureDispatchReceipt({
    authority: initialAuthority({
      captureApplicationReceiptId: row.captureApplicationReceiptId,
      captureApplicationDigest: row.captureApplicationDigest,
      orderId: row.orderId,
      contractId: row.contractId,
      contractCanonicalDigest: row.contractCanonicalDigest,
      subscriptionId: row.subscriptionId,
      subscriptionExpectedVersion: row.subscriptionExpectedVersion,
      capturedAt: row.capturedAt.toISOString()
    }),
    dispatchReceiptId: row.dispatchReceiptId,
    sourceEventId: row.sourceEventId,
    target: {
      kind: "initial",
      periodId: row.periodId,
      activatedEventId: row.primaryLifecycleEventId,
      entitlementChangedEventId: row.entitlementChangedEventId
    },
    dispatchedAt: row.dispatchedAt.toISOString()
  });
  return { outcome: "replayed", receipt, sourceEvent: sourceEventFor(receipt) };
}

function asDigest(value: string): `sha256:${string}` {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error("Capture dispatch digest is invalid");
  return value as `sha256:${string}`;
}

function initialAuthority(
  input: Readonly<{
    captureApplicationReceiptId: string;
    captureApplicationDigest: string;
    orderId: string;
    contractId: string;
    contractCanonicalDigest: string;
    subscriptionId: string;
    subscriptionExpectedVersion: number;
    capturedAt: string;
  }>
) {
  return sealFinanceClientOrderSubscriptionCaptureAuthority({
    ...input,
    captureApplicationDigest: asDigest(input.captureApplicationDigest),
    contractCanonicalDigest: asDigest(input.contractCanonicalDigest),
    captureKind: "initial"
  });
}

function dispatchFailureOutcome(
  outcome: Exclude<
    Awaited<ReturnType<typeof applyClientSubscriptionCaptureDispatch>>["outcome"],
    "applied"
  >
): "authority_conflict" | "source_event_conflict" | "evidence_conflict" {
  if (outcome === "source_event_conflict") return outcome;
  if (outcome === "evidence_conflict") return outcome;
  return "authority_conflict";
}
