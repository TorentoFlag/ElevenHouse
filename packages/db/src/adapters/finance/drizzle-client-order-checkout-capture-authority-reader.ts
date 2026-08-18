import type {
  ClientOrderCheckoutCaptureAuthority,
  ClientOrderCheckoutCaptureAuthorityReader,
  FinanceDigest
} from "@elevenhouse/domain/finance-core";
import { hasAsciiControlCharacter } from "@elevenhouse/domain/finance-core";
import { and, eq } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { clientSubscriptionPurchaseAuthorities } from "../../schema/client-subscriptions/client-subscription-purchase-authorities.schema";
import { clientSubscriptionPurchaseFulfillmentAuthorities } from "../../schema/client-subscriptions/client-subscription-purchase-fulfillment-authorities.schema";
import {
  financePaidProductFulfillmentDecisions,
  financeRiskPolicyVersions
} from "../../schema/finance/capture-authorities.schema";
import { orders } from "../../schema/finance/orders.schema";
import { financePolicies } from "../../schema/finance/policies.schema";
import { products } from "../../schema/products/products.schema";

export class ClientOrderCheckoutCaptureAuthorityReaderPersistenceError extends Error {
  readonly code = "CLIENT_ORDER_CHECKOUT_CAPTURE_AUTHORITY_READER_PERSISTENCE_ERROR" as const;

  constructor(
    readonly reason: "invalid_query" | "authority_integrity_conflict" | "persistence_failure"
  ) {
    super("Client checkout capture authority could not be read safely");
  }
}

/**
 * Resolves only the policy version already selected for an order. It deliberately never queries a
 * latest/active risk policy: changing policy after checkout preparation must not alter a capture.
 */
export function createDrizzleClientOrderCheckoutCaptureAuthorityReader(
  database: ElevenHouseDatabase
): ClientOrderCheckoutCaptureAuthorityReader {
  return Object.freeze({
    async findForCheckout(input) {
      const orderId = uuid(input.orderId);
      try {
        const [order] = await database.select().from(orders).where(eq(orders.id, orderId)).limit(1);
        if (!order) return null;
        const [policy] = await database
          .select()
          .from(financePolicies)
          .where(eq(financePolicies.id, order.financePolicySnapshotId))
          .limit(1);
        if (!policy) fail("authority_integrity_conflict");
        const [risk] = await database
          .select()
          .from(financeRiskPolicyVersions)
          .where(
            and(
              eq(financeRiskPolicyVersions.policyId, order.financePolicySnapshotId),
              eq(financeRiskPolicyVersions.policyVersion, String(policy.policyVersion))
            )
          )
          .limit(1);
        if (!risk) fail("authority_integrity_conflict");
        const [subscriptionPurpose] = await database
          .select({
            purchaseAuthorityDigest: clientSubscriptionPurchaseAuthorities.canonicalDigest,
            bindingOrderId: clientSubscriptionPurchaseFulfillmentAuthorities.orderId,
            bindingPurchaseAuthorityDigest:
              clientSubscriptionPurchaseFulfillmentAuthorities.purchaseAuthorityDigest,
            registryKey: clientSubscriptionPurchaseFulfillmentAuthorities.registryKey,
            registryRevision: clientSubscriptionPurchaseFulfillmentAuthorities.registryRevision,
            fulfillmentDecisionDigest:
              clientSubscriptionPurchaseFulfillmentAuthorities.fulfillmentDecisionDigest
          })
          .from(clientSubscriptionPurchaseAuthorities)
          .leftJoin(
            clientSubscriptionPurchaseFulfillmentAuthorities,
            and(
              eq(
                clientSubscriptionPurchaseFulfillmentAuthorities.orderId,
                clientSubscriptionPurchaseAuthorities.orderId
              ),
              eq(
                clientSubscriptionPurchaseFulfillmentAuthorities.purchaseAuthorityDigest,
                clientSubscriptionPurchaseAuthorities.canonicalDigest
              )
            )
          )
          .where(eq(clientSubscriptionPurchaseAuthorities.orderId, order.id))
          .limit(1);
        if (subscriptionPurpose) {
          if (
            !subscriptionPurpose.bindingOrderId ||
            !subscriptionPurpose.bindingPurchaseAuthorityDigest ||
            !subscriptionPurpose.registryKey ||
            !subscriptionPurpose.registryRevision ||
            !subscriptionPurpose.fulfillmentDecisionDigest ||
            subscriptionPurpose.bindingOrderId !== order.id ||
            subscriptionPurpose.bindingPurchaseAuthorityDigest !==
              subscriptionPurpose.purchaseAuthorityDigest
          ) {
            fail("authority_integrity_conflict");
          }
          const [fulfillment] = await database
            .select()
            .from(financePaidProductFulfillmentDecisions)
            .where(
              and(
                eq(
                  financePaidProductFulfillmentDecisions.registryKey,
                  subscriptionPurpose.registryKey
                ),
                eq(
                  financePaidProductFulfillmentDecisions.registryRevision,
                  subscriptionPurpose.registryRevision
                ),
                eq(
                  financePaidProductFulfillmentDecisions.canonicalDigest,
                  subscriptionPurpose.fulfillmentDecisionDigest
                )
              )
            )
            .limit(1);
          if (!fulfillment) fail("authority_integrity_conflict");
          return mapClientOrderCheckoutCaptureAuthority({
            order,
            policy,
            risk,
            fulfillment,
            registryKey: subscriptionPurpose.registryKey
          });
        }
        const [product] = await database
          .select()
          .from(products)
          .where(eq(products.id, order.productId))
          .limit(1);
        if (!product) fail("authority_integrity_conflict");
        const registryKey = `${product.type}.${product.paymentModel}.${product.executionMode}.${product.participantMode}`;
        if (registryKey === "async.once.async.solo" || registryKey === "sub.sub.async.solo") {
          return null;
        }
        const [fulfillment] = await database
          .select()
          .from(financePaidProductFulfillmentDecisions)
          .where(eq(financePaidProductFulfillmentDecisions.registryKey, registryKey))
          .limit(1);
        if (!fulfillment) return null;
        return mapClientOrderCheckoutCaptureAuthority({
          order,
          policy,
          risk,
          fulfillment,
          registryKey
        });
      } catch (error) {
        if (error instanceof ClientOrderCheckoutCaptureAuthorityReaderPersistenceError) throw error;
        throw new ClientOrderCheckoutCaptureAuthorityReaderPersistenceError("persistence_failure");
      }
    }
  } satisfies ClientOrderCheckoutCaptureAuthorityReader);
}

export function mapClientOrderCheckoutCaptureAuthority(
  input: Readonly<{
    order: typeof orders.$inferSelect;
    policy: typeof financePolicies.$inferSelect;
    risk: typeof financeRiskPolicyVersions.$inferSelect;
    fulfillment: typeof financePaidProductFulfillmentDecisions.$inferSelect;
    registryKey: string;
  }>
): ClientOrderCheckoutCaptureAuthority {
  try {
    if (
      input.risk.policyId !== input.order.financePolicySnapshotId ||
      input.risk.policyVersion !== String(input.policy.policyVersion) ||
      input.risk.effectiveRiskTier !== input.order.financePolicyRiskTier ||
      input.risk.holdDurationHours !== input.order.financePolicyHoldDurationHours ||
      input.risk.reserveBps !== input.order.financePolicyReserveBps ||
      input.risk.reserveReleaseDelayDays !== input.order.financePolicyReserveReleaseDelayDays ||
      input.risk.providerSettlementRequired !==
        input.order.financePolicyProviderSettlementRequired ||
      input.fulfillment.registryKey !== input.registryKey
    ) {
      fail("authority_integrity_conflict");
    }
    return Object.freeze({
      riskPolicy: Object.freeze({
        policyId: identifier(input.risk.policyId, 160),
        policyVersion: positiveInteger(input.risk.policyVersion),
        canonicalDigest: digest(input.risk.canonicalDigest)
      }),
      fulfillmentDecision: Object.freeze({
        registryKey: identifier(input.fulfillment.registryKey, 200),
        registryRevision: positiveInteger(input.fulfillment.registryRevision),
        canonicalDigest: digest(input.fulfillment.canonicalDigest)
      })
    });
  } catch (error) {
    if (error instanceof ClientOrderCheckoutCaptureAuthorityReaderPersistenceError) throw error;
    fail("authority_integrity_conflict");
  }
}

function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    fail("invalid_query");
  }
  return value;
}

function identifier(value: unknown, maximum: number): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    value.trim() !== value ||
    hasAsciiControlCharacter(value)
  ) {
    fail("authority_integrity_conflict");
  }
  return value;
}

function positiveInteger(value: unknown): number {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value))
    fail("authority_integrity_conflict");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) fail("authority_integrity_conflict");
  return parsed;
}

function digest(value: unknown): FinanceDigest {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    fail("authority_integrity_conflict");
  }
  return value as FinanceDigest;
}

function fail(reason: ClientOrderCheckoutCaptureAuthorityReaderPersistenceError["reason"]): never {
  throw new ClientOrderCheckoutCaptureAuthorityReaderPersistenceError(reason);
}
