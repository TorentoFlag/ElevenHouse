import { getTableColumns } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { orders } from "../finance/orders.schema";
import {
  clientSubscriptionContracts,
  clientSubscriptionPurchaseAuthorities,
  clientSubscriptionPeriods,
  clientSubscriptionRenewalRequests,
  clientSubscriptionSlots,
  clientSubscriptions
} from "./index";

describe("client subscription contract and head persistence", () => {
  it("binds each subscription contract to an immutable order-side purchase authority", () => {
    const authority = getTableConfig(clientSubscriptionPurchaseAuthorities);
    const contract = getTableConfig(clientSubscriptionContracts);

    expect(Object.keys(getTableColumns(clientSubscriptionPurchaseAuthorities))).toEqual(
      expect.arrayContaining([
        "orderId",
        "productId",
        "productRevision",
        "relationshipId",
        "astrologerUserId",
        "clientUserId",
        "priceMinor",
        "currency",
        "cadence",
        "billingEconomicsDigest",
        "accessGrants",
        "deliveryFormats",
        "requiredClientData",
        "methods",
        "modifiers",
        "astroDiaryConfig",
        "canonicalPreimage",
        "canonicalDigest"
      ])
    );
    expect(authority.foreignKeys.map((foreignKey) => foreignKey.getName())).toEqual(
      expect.arrayContaining([
        "client_subscription_purchase_authorities_order_identity_fk",
        "client_subscription_purchase_authorities_relationship_identity_fk",
        "client_subscription_purchase_authorities_billing_economics_fk"
      ])
    );
    expect(contract.foreignKeys.map((foreignKey) => foreignKey.getName())).toContain(
      "client_subscription_contracts_purchase_authority_fk"
    );
  });

  it("binds the sealed diary contract to exact order, product owner, and relationship identities", () => {
    const contract = getTableConfig(clientSubscriptionContracts);
    const order = getTableConfig(orders);

    expect(Object.keys(getTableColumns(clientSubscriptionContracts))).toEqual(
      expect.arrayContaining([
        "id",
        "orderId",
        "productId",
        "productRevision",
        "relationshipId",
        "astrologerUserId",
        "clientUserId",
        "priceMinor",
        "currency",
        "cadence",
        "billingEconomicsOrderId",
        "billingEconomicsDigest",
        "billingAstrologerUserId",
        "billingPlanId",
        "billingPlanVersionId",
        "billingGrossAmountMinor",
        "billingGrossCurrency",
        "billingCommissionAmountMinor",
        "billingCommissionCurrency",
        "billingPayableAmountMinor",
        "billingPayableCurrency",
        "billingCommissionBps",
        "billingAllocationRevision",
        "accessGrants",
        "deliveryFormats",
        "requiredClientData",
        "methods",
        "modifiers",
        "astroDiaryConfig",
        "canonicalPreimage",
        "canonicalDigest",
        "createdAt"
      ])
    );
    expect(order.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "orders_exact_subscription_identity_unique"
    );
    expect(contract.foreignKeys.map((foreignKey) => foreignKey.getName())).toEqual(
      expect.arrayContaining([
        "client_subscription_contracts_order_identity_fk",
        "client_subscription_contracts_product_owner_fk",
        "client_subscription_contracts_relationship_identity_fk",
        "client_subscription_contracts_billing_economics_fk"
      ])
    );
    expect(contract.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "client_subscription_contracts_positive_rub_check",
        "client_subscription_contracts_cadence_check",
        "client_subscription_contracts_exact_diary_shape_check",
        "client_subscription_contracts_billing_identity_check",
        "client_subscription_contracts_billing_allocation_check",
        "client_subscription_contracts_digest_check"
      ])
    );
  });

  it("stores one monotonic head with explicit current, future, and open-renewal pointers", () => {
    const head = getTableConfig(clientSubscriptions);

    expect(Object.keys(getTableColumns(clientSubscriptions))).toEqual(
      expect.arrayContaining([
        "id",
        "contractId",
        "relationshipId",
        "productId",
        "journalEpochId",
        "state",
        "version",
        "cancellationEffectiveAt",
        "renewalStoppedAt",
        "renewalRequestId",
        "currentPeriodId",
        "futurePeriodId",
        "createdAt",
        "updatedAt"
      ])
    );
    expect(head.uniqueConstraints.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "client_subscriptions_contract_unique",
        "client_subscriptions_epoch_unique",
        "client_subscriptions_exact_identity_unique"
      ])
    );
    expect(head.foreignKeys.map((foreignKey) => foreignKey.getName())).toEqual(
      expect.arrayContaining([
        "client_subscriptions_contract_scope_fk",
        "client_subscriptions_slot_fk"
      ])
    );
    expect(head.indexes.map((index) => index.config.name)).toContain(
      "client_subscriptions_current_relationship_product_unique"
    );
    expect(head.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "client_subscriptions_state_check",
        "client_subscriptions_version_check",
        "client_subscriptions_state_pointer_shape_check"
      ])
    );
  });

  it("serializes subscription epoch creation through a monotonic relationship-product slot", () => {
    const slot = getTableConfig(clientSubscriptionSlots);

    expect(Object.keys(getTableColumns(clientSubscriptionSlots))).toEqual([
      "relationshipId",
      "productId",
      "clientUserId",
      "astrologerUserId",
      "version",
      "currentSubscriptionId",
      "createdAt",
      "updatedAt"
    ]);
    expect(slot.primaryKeys.map((primaryKey) => primaryKey.getName())).toContain(
      "client_subscription_slots_relationship_product_pk"
    );
    expect(slot.foreignKeys.map((foreignKey) => foreignKey.getName())).toEqual(
      expect.arrayContaining([
        "client_subscription_slots_relationship_identity_fk",
        "client_subscription_slots_product_owner_fk"
      ])
    );
    expect(slot.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "client_subscription_slots_version_check",
        "client_subscription_slots_current_version_check"
      ])
    );
  });

  it("retains immutable renewal requests and immutable half-open paid-period facts", () => {
    const renewal = getTableConfig(clientSubscriptionRenewalRequests);
    const period = getTableConfig(clientSubscriptionPeriods);

    expect(Object.keys(getTableColumns(clientSubscriptionRenewalRequests))).toEqual(
      expect.arrayContaining([
        "id",
        "subscriptionId",
        "sourcePeriodId",
        "intendedPeriodId",
        "requestedAt"
      ])
    );
    expect(renewal.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "client_subscription_renewal_requests_exact_identity_unique"
    );
    expect(Object.keys(getTableColumns(clientSubscriptionPeriods))).toEqual(
      expect.arrayContaining([
        "id",
        "subscriptionId",
        "contractId",
        "sequence",
        "startsAt",
        "endsAt",
        "anchorCapturedAt",
        "anchorServiceTimezone",
        "anchorOriginSequence",
        "anchorLocalDateTime",
        "resolvedStartLocal",
        "resolvedStartOffset",
        "resolvedEndLocal",
        "resolvedEndOffset",
        "captureEvidenceId",
        "createdAt"
      ])
    );
    expect(period.uniqueConstraints.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "client_subscription_periods_subscription_sequence_unique",
        "client_subscription_periods_exact_identity_unique",
        "client_subscription_periods_allowance_scope_unique",
        "client_subscription_periods_capture_evidence_unique"
      ])
    );
    expect(period.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "client_subscription_periods_sequence_check",
        "client_subscription_periods_half_open_range_check",
        "client_subscription_periods_anchor_check"
      ])
    );
  });

  it("allows a contiguous period to retain the original anchor and requires a lapsed re-anchor to start at capture", () => {
    const period = getTableConfig(clientSubscriptionPeriods);
    const anchor = period.checks.find(
      (constraint) => constraint.name === "client_subscription_periods_anchor_check"
    );
    const predicate = new PgDialect().sqlToQuery(anchor!.value).sql;

    expect(normalizeSql(predicate)).toContain(
      normalizeSql(
        '"client_subscription_periods"."anchor_origin_sequence" = "client_subscription_periods"."sequence" and "client_subscription_periods"."anchor_captured_at" = "client_subscription_periods"."starts_at"'
      )
    );
    expect(normalizeSql(predicate)).toContain(
      normalizeSql(
        '"client_subscription_periods"."anchor_origin_sequence" < "client_subscription_periods"."sequence" and "client_subscription_periods"."anchor_captured_at" < "client_subscription_periods"."starts_at"'
      )
    );
    expect(normalizeSql(predicate)).toContain(
      normalizeSql('"client_subscription_periods"."anchor_origin_sequence" >= 1')
    );
  });
});

function normalizeSql(value: string): string {
  return value.replaceAll(/\s+/gu, " ").trim().toLowerCase();
}
