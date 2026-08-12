import { getTableColumns } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  clientEntitlementGrants,
  clientEntitlementTransitionApplications,
  clientEntitlementTransitionEffects,
  clientSubscriptionAllowanceCommandReceipts,
  clientSubscriptionAllowanceCommandEffects,
  clientSubscriptionAllowanceConsumptions,
  clientSubscriptionAllowanceReservations,
  clientSubscriptionCommandReceipts,
  clientSubscriptionCreationReceipts,
  clientSubscriptionEventApplicationReceipts,
  clientSubscriptionLifecycleEvents,
  clientSubscriptionPeriodAllowances,
  clientSubscriptionTransitionReceipts
} from "./index";

describe("client subscription facts, receipts, allowances, and entitlements", () => {
  it("persists immutable lifecycle facts behind one transition receipt", () => {
    const transition = getTableConfig(clientSubscriptionTransitionReceipts);
    const event = getTableConfig(clientSubscriptionLifecycleEvents);

    expect(Object.keys(getTableColumns(clientSubscriptionTransitionReceipts))).toEqual(
      expect.arrayContaining([
        "transitionId",
        "subscriptionId",
        "contractId",
        "relationshipId",
        "journalEpochId",
        "subscriptionVersion",
        "state",
        "entitlementState",
        "entitlementScope",
        "primaryEventType",
        "slotEffect",
        "periodId",
        "occurredAt"
      ])
    );
    expect(transition.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "client_subscription_transition_receipts_subscription_version_unique"
    );
    expect(Object.keys(getTableColumns(clientSubscriptionLifecycleEvents))).toEqual(
      expect.arrayContaining([
        "id",
        "transitionId",
        "subscriptionId",
        "contractId",
        "subscriptionVersion",
        "eventType",
        "schemaVersion",
        "occurredAt",
        "data"
      ])
    );
    expect(event.foreignKeys.map((foreignKey) => foreignKey.getName())).toContain(
      "client_subscription_lifecycle_events_transition_fk"
    );
    expect(event.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "client_subscription_lifecycle_events_type_check",
        "client_subscription_lifecycle_events_schema_version_check"
      ])
    );
  });

  it("stores deterministic applied and rejected command/application replays", () => {
    const creation = getTableConfig(clientSubscriptionCreationReceipts);
    const command = getTableConfig(clientSubscriptionCommandReceipts);
    const application = getTableConfig(clientSubscriptionEventApplicationReceipts);

    expect(Object.keys(getTableColumns(clientSubscriptionCreationReceipts))).toEqual(
      expect.arrayContaining([
        "orderId",
        "relationshipId",
        "productId",
        "idempotencyKey",
        "requestHash",
        "expectedSlotVersion",
        "resultSlotVersion",
        "slotEffect",
        "resultKind",
        "result",
        "resultSnapshot",
        "subscriptionId",
        "contractId",
        "contractDigest"
      ])
    );
    expect(creation.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "client_subscription_creation_receipts_order_key_unique"
    );
    expect(Object.keys(getTableColumns(clientSubscriptionCommandReceipts))).toEqual(
      expect.arrayContaining([
        "subscriptionId",
        "expectedVersion",
        "idempotencyKey",
        "requestHash",
        "resultKind",
        "result",
        "resultSnapshot",
        "resultVersion",
        "transitionId",
        "slotEffect",
        "createdAt"
      ])
    );
    expect(command.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "client_subscription_command_receipts_scope_key_unique"
    );
    expect(command.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "client_subscription_command_receipts_request_hash_check",
        "client_subscription_command_receipts_result_check"
      ])
    );
    expect(Object.keys(getTableColumns(clientSubscriptionEventApplicationReceipts))).toEqual(
      expect.arrayContaining([
        "sourceEventId",
        "sourceEventDigest",
        "evidenceId",
        "subscriptionId",
        "resultKind",
        "result",
        "resultSnapshot",
        "resultVersion",
        "transitionId",
        "slotEffect",
        "createdAt"
      ])
    );
    expect(application.uniqueConstraints.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "client_subscription_event_applications_source_unique",
        "client_subscription_event_applications_evidence_unique"
      ])
    );
    expect(
      application.uniqueConstraints
        .find(
          (constraint) =>
            constraint.name === "client_subscription_event_applications_evidence_unique"
        )
        ?.columns.map((column) => column.name)
    ).toEqual(["evidence_id"]);
  });

  it("binds a created subscription replay to the exact immutable contract and receipt result", () => {
    const creation = getTableConfig(clientSubscriptionCreationReceipts);
    const predicate = new PgDialect().sqlToQuery(
      creation.checks.find(
        (constraint) => constraint.name === "client_subscription_creation_receipts_result_check"
      )!.value
    ).sql;

    expect(predicate).toContain(
      `"client_subscription_creation_receipts"."result_snapshot"->'contract'->>'productId' = "client_subscription_creation_receipts"."product_id"::text`
    );
    expect(predicate).toContain(
      `"client_subscription_creation_receipts"."result_snapshot"->'contract'->>'relationshipId' = "client_subscription_creation_receipts"."relationship_id"::text`
    );
    expect(predicate).toContain(
      `"client_subscription_creation_receipts"."result_snapshot"->'subscription'->'contract' = "client_subscription_creation_receipts"."result_snapshot"->'contract'`
    );
    expect(predicate).toContain(
      `"client_subscription_creation_receipts"."result" = jsonb_build_object(`
    );
    expect(predicate).toContain(
      `'subscriptionId', "client_subscription_creation_receipts"."subscription_id"::text`
    );
    expect(predicate).toContain(
      `'contractDigest', "client_subscription_creation_receipts"."contract_digest"`
    );
    expect(predicate).toContain(
      `"client_subscription_creation_receipts"."result_kind" = 'rejected'`
    );
    expect(predicate).toContain(
      `"client_subscription_creation_receipts"."result_snapshot" is null`
    );
  });

  it("allows only subscription lifecycle outputs, never the finance capture input", () => {
    const event = getTableConfig(clientSubscriptionLifecycleEvents);
    const typeCheck = event.checks.find(
      (constraint) => constraint.name === "client_subscription_lifecycle_events_type_check"
    );
    const predicate = new PgDialect().sqlToQuery(typeCheck!.value).sql;

    expect(predicate).toContain("client_subscription.initial_payment_ended.v1");
    expect(predicate).toContain("client_subscription.entitlement_changed.v1");
    expect(predicate).not.toContain("client_subscription.capture_applied.v1");
  });

  it("normalizes allowance buckets, reservations, consumptions, and replay receipts", () => {
    const allowance = getTableConfig(clientSubscriptionPeriodAllowances);
    const reservation = getTableConfig(clientSubscriptionAllowanceReservations);
    const consumption = getTableConfig(clientSubscriptionAllowanceConsumptions);
    const receipt = getTableConfig(clientSubscriptionAllowanceCommandReceipts);
    const effect = getTableConfig(clientSubscriptionAllowanceCommandEffects);

    expect(Object.keys(getTableColumns(clientSubscriptionPeriodAllowances))).toEqual(
      expect.arrayContaining([
        "periodId",
        "subscriptionId",
        "endsAt",
        "total",
        "available",
        "reserved",
        "consumed",
        "released",
        "version"
      ])
    );
    expect(allowance.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "client_subscription_period_allowances_nonnegative_check",
        "client_subscription_period_allowances_arithmetic_check",
        "client_subscription_period_allowances_version_check"
      ])
    );
    expect(reservation.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "client_subscription_allowance_reservations_period_identity_unique"
    );
    expect(consumption.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "client_subscription_allowance_consumptions_period_identity_unique"
    );
    expect(consumption.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "client_subscription_allowance_consumptions_reservation_unique"
    );
    expect(
      new PgDialect().sqlToQuery(
        consumption.checks.find(
          (constraint) =>
            constraint.name === "client_subscription_allowance_consumptions_source_check"
        )!.value
      ).sql
    ).toContain(
      '"client_subscription_allowance_consumptions"."id" = "client_subscription_allowance_consumptions"."reservation_id"'
    );
    expect(receipt.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "client_subscription_allowance_receipts_period_key_unique"
    );
    expect(Object.keys(getTableColumns(clientSubscriptionAllowanceCommandReceipts))).toEqual(
      expect.arrayContaining(["expectedVersion", "command"])
    );
    expect(Object.keys(getTableColumns(clientSubscriptionAllowanceCommandEffects))).toEqual([
      "periodId",
      "idempotencyKey",
      "beforeVersion",
      "beforeAvailable",
      "beforeReserved",
      "beforeConsumed",
      "beforeReleased",
      "afterVersion",
      "afterAvailable",
      "afterReserved",
      "afterConsumed",
      "afterReleased",
      "operation",
      "occurredAt",
      "reservationId",
      "reservationStateBefore",
      "reservationStateAfter",
      "consumptionId"
    ]);
    expect(effect.foreignKeys.map((foreignKey) => foreignKey.getName())).toContain(
      "client_subscription_allowance_command_effects_receipt_fk"
    );
    expect(effect.foreignKeys.map((foreignKey) => foreignKey.getName())).toEqual(
      expect.arrayContaining([
        "client_subscription_allowance_command_effects_reservation_fk",
        "client_subscription_allowance_command_effects_consumption_fk"
      ])
    );
    expect(effect.checks.map((constraint) => constraint.name)).toContain(
      "client_subscription_allowance_command_effects_operation_check"
    );
    expect(effect.checks.map((constraint) => constraint.name)).toContain(
      "client_subscription_allowance_command_effects_fact_transition_check"
    );
    const receiptCommandPredicate = new PgDialect().sqlToQuery(
      receipt.checks.find(
        (constraint) => constraint.name === "client_subscription_allowance_receipts_command_check"
      )!.value
    ).sql;
    const effectOperationPredicate = new PgDialect().sqlToQuery(
      effect.checks.find(
        (constraint) =>
          constraint.name === "client_subscription_allowance_command_effects_operation_check"
      )!.value
    ).sql;
    const effectFactPredicate = new PgDialect().sqlToQuery(
      effect.checks.find(
        (constraint) =>
          constraint.name === "client_subscription_allowance_command_effects_fact_transition_check"
      )!.value
    ).sql;
    expect(receiptCommandPredicate).toContain("forfeit_reserved");
    expect(effectOperationPredicate).toContain("forfeit_reserved");
    expect(effectFactPredicate).toContain("forfeit_reserved");
    const receiptResultPredicate = new PgDialect().sqlToQuery(
      receipt.checks.find(
        (constraint) => constraint.name === "client_subscription_allowance_receipts_result_check"
      )!.value
    ).sql;
    expect(receiptResultPredicate).toContain("reservation_already_exists");
    expect(receiptResultPredicate).toContain("paid_access_not_ended");
  });

  it("keeps one independently versioned entitlement grant per paid period", () => {
    const grant = getTableConfig(clientEntitlementGrants);
    const application = getTableConfig(clientEntitlementTransitionApplications);
    const effect = getTableConfig(clientEntitlementTransitionEffects);

    expect(Object.keys(getTableColumns(clientEntitlementGrants))).toEqual(
      expect.arrayContaining([
        "id",
        "subscriptionId",
        "contractId",
        "relationshipId",
        "journalEpochId",
        "periodId",
        "capability",
        "startsAt",
        "endsAt",
        "state",
        "version",
        "sourceTransitionId",
        "sourceSubscriptionVersion"
      ])
    );
    expect(grant.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "client_entitlement_grants_subscription_period_capability_unique"
    );
    expect(grant.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "client_entitlement_grants_capability_check",
        "client_entitlement_grants_state_check",
        "client_entitlement_grants_half_open_range_check",
        "client_entitlement_grants_version_check"
      ])
    );
    expect(application.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "client_entitlement_transition_applications_transition_unique"
    );
    expect(effect.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "client_entitlement_transition_effects_application_grant_unique"
    );
    const effectVersionCheck = effect.checks.find(
      (constraint) => constraint.name === "client_entitlement_transition_effects_version_check"
    );
    const effectVersionPredicate = new PgDialect().sqlToQuery(effectVersionCheck!.value).sql;
    expect(effectVersionPredicate).toContain('before_version" is null');
    expect(effectVersionPredicate).toContain('after_version" = 1');
  });
});
