import { and, asc, eq, sql } from "drizzle-orm";
import {
  OrderProductRevisionConflictError,
  OrderPurchaseAuthorityChangedError,
  resolvePaidProductFulfillment,
  type PaidProductFulfillmentDecision,
  type PaidProductFulfillmentDependencyRef,
  type OrderPurchasePurpose
} from "@elevenhouse/domain";

import type { FinanceTransaction } from "../finance/drizzle-finance-command-store";
import { clientSubscriptionPurchaseFulfillmentAuthorities } from "../../schema/client-subscriptions/client-subscription-purchase-fulfillment-authorities.schema";
import { clientAstrologerRelationships } from "../../schema/clients/client-astrologer-relationships.schema";
import { financePaidProductFulfillmentDecisions } from "../../schema/finance/capture-authorities.schema";
import { orders } from "../../schema/finance/orders.schema";
import { productAccessGrants } from "../../schema/products/product-access-grants.schema";
import { productDeliveryFormats } from "../../schema/products/product-delivery-formats.schema";
import { productMethods } from "../../schema/products/product-methods.schema";
import { productModifiers } from "../../schema/products/product-modifiers.schema";
import { productRequiredClientData } from "../../schema/products/product-required-client-data.schema";
import { products } from "../../schema/products/products.schema";

/**
 * Seals the immutable order-side AstroDiary purchase fact while the order row still belongs to
 * the current transaction. Non-AstroDiary orders deliberately produce no authority row.
 */
export async function sealClientSubscriptionPurchaseAuthorityForOrder(
  transaction: FinanceTransaction,
  input: Readonly<{ orderId: string; purpose: OrderPurchasePurpose }>
): Promise<void> {
  const [locked] = await transaction
    .select({ order: orders, product: products })
    .from(orders)
    .innerJoin(products, eq(products.id, orders.productId))
    .where(eq(orders.id, input.orderId))
    .for("no key update", { of: products })
    .limit(1);
  if (!locked) throw new OrderPurchaseAuthorityChangedError();
  if (locked.product.revision !== input.purpose.expectedProductRevision) {
    throw new OrderProductRevisionConflictError(
      input.purpose.expectedProductRevision,
      locked.product.revision
    );
  }
  if (
    locked.product.ownerUserId !== locked.order.astrologerUserId ||
    locked.product.status !== "active" ||
    locked.product.priceMinor !== locked.order.grossAmountMinor ||
    locked.product.currency !== locked.order.grossCurrency
  ) {
    throw new OrderPurchaseAuthorityChangedError();
  }

  if (input.purpose.kind === "standard") {
    if (locked.product.astroDiaryReflectionCyclesPerPeriod !== null) {
      throw new OrderPurchaseAuthorityChangedError();
    }
    return;
  }

  const accepted = input.purpose.acceptedProduct;
  if (
    accepted.productId !== locked.product.id ||
    accepted.revision !== locked.product.revision ||
    accepted.ownerUserId !== locked.product.ownerUserId ||
    accepted.status !== locked.product.status ||
    accepted.type !== locked.product.type ||
    accepted.paymentModel !== locked.product.paymentModel ||
    accepted.executionMode !== locked.product.executionMode ||
    accepted.participantMode !== locked.product.participantMode ||
    accepted.priceMinor !== locked.product.priceMinor ||
    accepted.currency !== locked.product.currency ||
    accepted.cadence !== locked.product.subscriptionPeriod ||
    accepted.trialDays !== locked.product.trialDays ||
    accepted.groupSize !== locked.product.groupSize ||
    accepted.packageSessionCount !== locked.product.packageSessionCount ||
    accepted.astroDiaryConfig.reflectionCyclesPerPeriod !==
      locked.product.astroDiaryReflectionCyclesPerPeriod ||
    accepted.astroDiaryConfig.responseSlaWorkingDays !==
      locked.product.astroDiaryResponseSlaWorkingDays ||
    accepted.astroDiaryConfig.clientResponseWindowCalendarDays !==
      locked.product.astroDiaryClientResponseWindowCalendarDays ||
    accepted.astroDiaryConfig.serviceTimezone !== locked.product.astroDiaryServiceTimezone ||
    weekdaysMask(accepted.astroDiaryConfig.workingWeekdays) !==
      locked.product.astroDiaryWorkingWeekdaysMask
  ) {
    throw new OrderPurchaseAuthorityChangedError();
  }

  const [relationship] = await transaction
    .select()
    .from(clientAstrologerRelationships)
    .where(
      and(
        eq(
          clientAstrologerRelationships.clientUserId,
          input.purpose.acceptedRelationship.clientUserId
        ),
        eq(
          clientAstrologerRelationships.astrologerUserId,
          input.purpose.acceptedRelationship.astrologerUserId
        )
      )
    )
    .for("no key update")
    .limit(1);
  if (
    !relationship ||
    relationship.status !== "active" ||
    relationship.clientUserId !== locked.order.clientUserId ||
    relationship.astrologerUserId !== locked.order.astrologerUserId
  ) {
    throw new OrderPurchaseAuthorityChangedError();
  }

  const accessGrants = await transaction
    .select({ value: productAccessGrants.value })
    .from(productAccessGrants)
    .where(eq(productAccessGrants.productId, accepted.productId))
    .orderBy(asc(productAccessGrants.order));
  const deliveryFormats = await transaction
    .select({ value: productDeliveryFormats.value })
    .from(productDeliveryFormats)
    .where(eq(productDeliveryFormats.productId, accepted.productId))
    .orderBy(asc(productDeliveryFormats.order));
  const requiredClientData = await transaction
    .select({ value: productRequiredClientData.value })
    .from(productRequiredClientData)
    .where(eq(productRequiredClientData.productId, accepted.productId))
    .orderBy(asc(productRequiredClientData.order));
  const methods = await transaction
    .select({ value: productMethods.value })
    .from(productMethods)
    .where(eq(productMethods.productId, accepted.productId))
    .orderBy(asc(productMethods.order));
  const modifiers = await transaction
    .select({ id: productModifiers.id })
    .from(productModifiers)
    .where(eq(productModifiers.productId, accepted.productId));
  if (
    !sameValues(accessGrants, accepted.accessGrants) ||
    !sameValues(deliveryFormats, accepted.deliveryFormats) ||
    !sameValues(requiredClientData, accepted.requiredClientData) ||
    !sameValues(methods, accepted.methods) ||
    modifiers.length !== accepted.modifiers.length
  ) {
    throw new OrderPurchaseAuthorityChangedError();
  }

  const fulfillmentRows = await transaction
    .select()
    .from(financePaidProductFulfillmentDecisions)
    .where(eq(financePaidProductFulfillmentDecisions.registryKey, "sub.sub.async.solo"));
  const fulfillmentDecision = await resolvePaidProductFulfillment({
    product: {
      type: accepted.type,
      paymentModel: accepted.paymentModel,
      executionMode: accepted.executionMode,
      participantMode: accepted.participantMode,
      subscriptionPeriod: accepted.cadence,
      trialDays: accepted.trialDays,
      durationMinutes: null,
      packageSessionCount: accepted.packageSessionCount,
      groupSize: accepted.groupSize,
      deliveryFormats: accepted.deliveryFormats,
      requiredClientData: accepted.requiredClientData,
      methods: accepted.methods,
      accessGrants: accepted.accessGrants,
      modifiers: accepted.modifiers,
      astroDiaryConfig: accepted.astroDiaryConfig
    },
    reader: {
      getDependencyStatus: async (reference) =>
        fulfillmentRows.some((row) => matchesFulfillmentDependency(row, reference))
          ? "registered"
          : "missing"
    }
  });
  const fulfillment = fulfillmentRows.find(
    (row) =>
      fulfillmentDecision.supported &&
      row.registryKey === fulfillmentDecision.registryKey &&
      row.registryRevision === String(fulfillmentDecision.registryRevision)
  );
  if (
    !fulfillmentDecision.supported ||
    fulfillmentDecision.registryKey !== "sub.sub.async.solo" ||
    !fulfillment ||
    !matchesFulfillmentDecision(fulfillment, fulfillmentDecision)
  ) {
    throw new OrderPurchaseAuthorityChangedError();
  }

  const result = await transaction.execute(
    sql<{ order_id: string; canonical_digest: string }>`
    with candidate as (
      select
        order_row.id as order_id,
        product_row.id as product_id,
        product_row.revision as product_revision,
        relationship_row.id as relationship_id,
        order_row.astrologer_user_id,
        order_row.client_user_id,
        order_row.gross_amount_minor::integer as price_minor,
        order_row.gross_currency as currency,
        product_row.subscription_period as cadence,
        economics.order_id as billing_economics_order_id,
        economics.canonical_digest as billing_economics_digest,
        jsonb_build_array('journal') as access_grants,
        jsonb_build_array('chat', 'audio', 'file') as delivery_formats,
        '[]'::jsonb as required_client_data,
        '[]'::jsonb as methods,
        '[]'::jsonb as modifiers,
        jsonb_build_object(
          'clientResponseWindowCalendarDays', product_row.astro_diary_client_response_window_calendar_days,
          'reflectionCyclesPerPeriod', product_row.astro_diary_reflection_cycles_per_period,
          'responseSlaWorkingDays', product_row.astro_diary_response_sla_working_days,
          'serviceTimezone', product_row.astro_diary_service_timezone,
          'workingWeekdays', (
            select coalesce(jsonb_agg(weekday order by weekday), '[]'::jsonb)
              from generate_series(1, 7) as weekday
             where product_row.astro_diary_working_weekdays_mask & (1 << (weekday - 1)) <> 0
          )
        ) as astro_diary_config,
        economics.allocation_revision,
        economics.commission_amount_minor,
        economics.commission_bps,
        economics.commission_currency,
        economics.gross_amount_minor,
        economics.gross_currency,
        economics.payable_amount_minor,
        economics.payable_currency,
        economics.plan_id,
        economics.plan_version_id,
        order_row.created_at
      from orders order_row
      join products product_row
        on product_row.id = order_row.product_id
       and product_row.owner_user_id = order_row.astrologer_user_id
      join client_astrologer_relationships relationship_row
        on relationship_row.client_user_id = order_row.client_user_id
       and relationship_row.astrologer_user_id = order_row.astrologer_user_id
       and relationship_row.status = 'active'
      join finance_order_economics_snapshots economics
        on economics.order_id = order_row.id::text
      where order_row.id = ${input.orderId}
        and product_row.status = 'active'
        and product_row.type = 'sub'
        and product_row.payment_model = 'sub'
        and product_row.execution_mode = 'async'
        and product_row.participant_mode = 'solo'
        and product_row.subscription_period in ('week', 'month', 'year')
        and product_row.price_minor > 0
        and product_row.price_minor = order_row.gross_amount_minor
        and product_row.currency = order_row.gross_currency
        and product_row.trial_days is null
        and product_row.group_size is null
        and product_row.package_session_count is null
        and product_row.astro_diary_reflection_cycles_per_period is not null
        and (select coalesce(jsonb_agg(value order by "order"), '[]'::jsonb)
               from product_access_grants where product_id = product_row.id) = '["journal"]'::jsonb
        and (select coalesce(jsonb_agg(value order by "order"), '[]'::jsonb)
               from product_delivery_formats where product_id = product_row.id) = '["chat","audio","file"]'::jsonb
        and not exists (select 1 from product_required_client_data where product_id = product_row.id)
        and not exists (select 1 from product_methods where product_id = product_row.id)
        and not exists (select 1 from product_modifiers where product_id = product_row.id)
    ), sealed as (
      select candidate.*,
        finance_canonical_jsonb_v1(jsonb_build_object(
          'accessGrants', candidate.access_grants,
          'astrologerUserId', candidate.astrologer_user_id::text,
          'astroDiaryConfig', candidate.astro_diary_config,
          'billingEconomics', jsonb_build_object(
            'allocationRevision', candidate.allocation_revision,
            'astrologerUserId', candidate.astrologer_user_id::text,
            'commission', jsonb_build_object('amountMinor', candidate.commission_amount_minor, 'currency', candidate.commission_currency),
            'commissionBps', candidate.commission_bps,
            'gross', jsonb_build_object('amountMinor', candidate.gross_amount_minor, 'currency', candidate.gross_currency),
            'orderId', candidate.billing_economics_order_id,
            'payable', jsonb_build_object('amountMinor', candidate.payable_amount_minor, 'currency', candidate.payable_currency),
            'planId', candidate.plan_id,
            'planVersionId', candidate.plan_version_id
          ),
          'cadence', candidate.cadence,
          'clientUserId', candidate.client_user_id::text,
          'currency', candidate.currency,
          'deliveryFormats', candidate.delivery_formats,
          'methods', candidate.methods,
          'modifiers', candidate.modifiers,
          'orderId', candidate.order_id::text,
          'priceMinor', candidate.price_minor,
          'productId', candidate.product_id::text,
          'productRevision', candidate.product_revision,
          'relationshipId', candidate.relationship_id::text,
          'requiredClientData', candidate.required_client_data
        )) as canonical_preimage
      from candidate
    )
    insert into client_subscription_purchase_authorities (
      order_id, product_id, product_revision, relationship_id, astrologer_user_id,
      client_user_id, price_minor, currency, cadence, billing_economics_order_id,
      billing_economics_digest, access_grants, delivery_formats, required_client_data,
      methods, modifiers, astro_diary_config, canonical_preimage, canonical_digest, created_at
    )
    select
      sealed.order_id, sealed.product_id, sealed.product_revision, sealed.relationship_id,
      sealed.astrologer_user_id, sealed.client_user_id, sealed.price_minor, sealed.currency,
      sealed.cadence, sealed.billing_economics_order_id, sealed.billing_economics_digest,
      sealed.access_grants, sealed.delivery_formats, sealed.required_client_data, sealed.methods,
      sealed.modifiers, sealed.astro_diary_config, sealed.canonical_preimage,
      'sha256:' || encode(digest(sealed.canonical_preimage, 'sha256'), 'hex'), sealed.created_at
    from sealed
    returning order_id, canonical_digest
  `
  );
  const sealedPurchaseAuthority = result.rows[0] as
    | { order_id: string; canonical_digest: string }
    | undefined;
  if (
    result.rows.length !== 1 ||
    sealedPurchaseAuthority?.order_id !== input.orderId ||
    !/^sha256:[a-f0-9]{64}$/.test(sealedPurchaseAuthority.canonical_digest)
  ) {
    throw new OrderPurchaseAuthorityChangedError();
  }
  await transaction.insert(clientSubscriptionPurchaseFulfillmentAuthorities).values({
    orderId: input.orderId,
    purchaseAuthorityDigest: sealedPurchaseAuthority.canonical_digest,
    registryKey: fulfillment.registryKey,
    registryRevision: fulfillment.registryRevision,
    fulfillmentDecisionDigest: fulfillment.canonicalDigest
  });
}

function matchesFulfillmentDependency(
  row: typeof financePaidProductFulfillmentDecisions.$inferSelect,
  reference: PaidProductFulfillmentDependencyRef
): boolean {
  if (!row.supported) return false;
  if (reference.kind === "terminal_evidence") {
    return (
      row.terminalEvidenceOwner === reference.owner &&
      row.terminalEvidenceStatus === reference.status &&
      row.terminalEvidenceContractVersion === String(reference.contractVersion)
    );
  }
  return (
    row.cancellationAllocatorOwner === reference.owner &&
    row.cancellationAllocatorPort === reference.port &&
    row.cancellationAllocatorPolicyVersion === String(reference.policyVersion)
  );
}

function matchesFulfillmentDecision(
  row: typeof financePaidProductFulfillmentDecisions.$inferSelect,
  decision: Extract<PaidProductFulfillmentDecision, { supported: true }>
): boolean {
  return (
    row.supported &&
    row.holdAnchor === decision.holdAnchor &&
    row.terminalEvidenceOwner === decision.terminalEvidence.owner &&
    row.terminalEvidenceStatus === decision.terminalEvidence.status &&
    row.terminalEvidenceContractVersion === String(decision.terminalEvidence.contractVersion) &&
    row.cancellationAllocatorOwner === decision.cancellationAllocator.owner &&
    row.cancellationAllocatorPort === decision.cancellationAllocator.port &&
    row.cancellationAllocatorPolicyVersion === String(decision.cancellationAllocator.policyVersion)
  );
}

function weekdaysMask(weekdays: readonly number[]): number {
  return weekdays.reduce((mask, weekday) => mask | (1 << (weekday - 1)), 0);
}

function sameValues(
  rows: readonly Readonly<{ value: string }>[],
  expected: readonly string[]
): boolean {
  return (
    rows.length === expected.length && rows.every((row, index) => row.value === expected[index])
  );
}
