import { describe, expect, it } from "vitest";

import {
  clientSubscriptionIntegritySql,
  clientSubscriptionImmutableTables,
  clientSubscriptionPeriodExclusionSql
} from "./index";

describe("client subscription PostgreSQL integrity", () => {
  it("seals the exact authoritative contract snapshot and its canonical digest", () => {
    const ddl = normalizeSql(clientSubscriptionIntegritySql);

    expect(ddl).toContain("finance_canonical_jsonb_v1(jsonb_build_object(");
    for (const key of [
      "accessGrants",
      "astrologerUserId",
      "astroDiaryConfig",
      "billingEconomics",
      "cadence",
      "clientUserId",
      "createdAt",
      "currency",
      "deliveryFormats",
      "id",
      "methods",
      "modifiers",
      "orderId",
      "priceMinor",
      "productId",
      "productRevision",
      "relationshipId",
      "requiredClientData"
    ]) {
      expect(clientSubscriptionIntegritySql).toContain(`'${key}'`);
    }
    expect(ddl).toContain("contract_row.canonical_preimage is distinct from expected_preimage");
    expect(ddl).toContain(
      "from finance_order_economics_snapshots where order_id = contract_row.billing_order_id"
    );
    expect(ddl).toContain("canonical_digest = contract_row.billing_economics_digest");
    expect(ddl).toContain("billing economics authority does not match sealed contract");
    for (const key of [
      "allocationRevision",
      "astrologerUserId",
      "commission",
      "commissionBps",
      "gross",
      "orderId",
      "payable",
      "planId",
      "planVersionId"
    ]) {
      expect(clientSubscriptionIntegritySql).toContain(`'${key}'`);
    }
    expect(ddl).toContain("'sha256:' || encode(digest(expected_preimage, 'sha256'), 'hex')");
    expect(ddl).toContain(
      "from client_subscription_purchase_authorities where order_id = contract_row.order_id for no key update"
    );
    expect(ddl).not.toContain("from products where id = contract_row.product_id for no key update");
    expect(ddl).toContain("from orders where id = contract_row.order_id for no key update");
    expect(ddl).toContain(
      "from client_astrologer_relationships where id = contract_row.relationship_id for no key update"
    );
    expect(ddl).toContain("contract_row.created_at !~");
    expect(clientSubscriptionIntegritySql).toContain("[0-9]{0,8}[1-9]");
    expect(ddl).toContain("constraint = 'client_subscription_contract_seal'");
  });

  it("rejects mutation or truncation of every historical fact and receipt", () => {
    expect(clientSubscriptionImmutableTables).toEqual([
      "client_subscription_purchase_authorities",
      "client_subscription_contracts",
      "client_subscription_renewal_requests",
      "client_subscription_periods",
      "client_subscription_transition_receipts",
      "client_subscription_lifecycle_events",
      "client_subscription_creation_receipts",
      "client_subscription_command_receipts",
      "client_subscription_event_application_receipts",
      "client_subscription_allowance_command_receipts",
      "client_subscription_allowance_command_effects",
      "client_entitlement_transition_applications",
      "client_entitlement_transition_effects"
    ]);
    for (const table of clientSubscriptionImmutableTables) {
      expect(clientSubscriptionIntegritySql).toContain(`BEFORE UPDATE OR DELETE ON ${table}`);
      expect(clientSubscriptionIntegritySql).toContain(`BEFORE TRUNCATE ON ${table}`);
    }
    expect(normalizeSql(clientSubscriptionIntegritySql)).toContain("errcode = '55000'");
  });

  it("serializes monotonic head and slot changes without an ABA window", () => {
    const ddl = normalizeSql(clientSubscriptionIntegritySql);

    expect(ddl).toContain("new.version <> old.version + 1");
    expect(ddl).toContain(
      "new.current_subscription_id is distinct from old.current_subscription_id"
    );
    expect(ddl).toContain("new.version is distinct from old.version + 1");
    expect(ddl).toContain("new.version is distinct from old.version");
    expect(ddl).toContain(
      "old.current_subscription_id is not null and new.current_subscription_id is not null"
    );
    expect(ddl).toContain("subscription slot cannot replace one epoch with another directly");
    expect(ddl).toContain("constraint = 'client_subscription_slot_monotonic'");
  });

  it("defers the slot, head, period, allowance, entitlement, and IDs-only outbox graph", () => {
    const ddl = normalizeSql(clientSubscriptionIntegritySql);

    expect(ddl).toContain("deferrable initially deferred");
    expect(ddl).toContain("client_subscription_graph_integrity");
    expect(ddl).toContain("head.renewal_request_id is not null");
    expect(ddl).toContain("slot.current_subscription_id is distinct from head.id");
    expect(ddl).toContain("head.state = 'revoked' and head.renewal_request_id is not null");
    expect(ddl).toContain("subscription head mutation requires its exact transition receipt");
    expect(ddl).toContain("subscription current period must be the latest non-future period");
    expect(ddl).toContain("subscription future period pointer must cover the sole successor");
    expect(ddl).toContain(
      "allowance_row.available + allowance_row.reserved + allowance_row.consumed + allowance_row.released"
    );
    expect(ddl).toContain("client_entitlement_transition_applications");
    expect(ddl).toContain("client_entitlement_transition_effects");
    expect(ddl).toContain("subscription-all revocation effect set is not exact");
    expect(ddl).toContain("reservation consumption facts are inconsistent");
    expect(ddl).toContain("subscription lifecycle event data does not match persisted facts");
    expect(ddl).toContain("client_subscription.lifecycle_event.dispatch_requested.v1");
    expect(ddl).toContain("client-subscription-lifecycle-event-dispatch-request.v1");
    expect(ddl).toContain("jsonb_build_object(");

    for (const table of [
      "client_subscription_creation_receipts",
      "client_subscription_command_receipts",
      "client_subscription_event_application_receipts",
      "client_subscription_allowance_command_receipts"
    ]) {
      expect(ddl).toContain(`after insert or update or delete on ${table}`);
    }
    expect(ddl).toContain("created subscription receipt does not match contract, head, and slot");
    expect(ddl).toContain("rejected subscription receipt does not match order and slot authority");
    expect(ddl).toContain("where checked_subscription_id is not null");
    expect(ddl).toContain("applied subscription persistence receipt lacks its exact transition");
    expect(ddl).toContain("new.result_version is distinct from head.version");
    expect(ddl).toContain("new.result_version <> new.expected_version + 1");
    expect(ddl).toContain("new.result_version <> new.expected_version");
    expect(ddl).toContain("allowance receipt version exceeds its allowance head");
    expect(ddl).toContain("new.result_version = receipt_allowance.version");
    expect(ddl).toContain("allowance receipt command or canonical request hash is invalid");
    expect(ddl).toContain("finance_canonical_jsonb_v1(jsonb_build_object(");
    expect(ddl).toContain("'periodid', new.period_id::text");
    expect(ddl).toContain("'expectedversion', new.expected_version");
    expect(ddl).toContain("'command', new.command");
    expect(ddl).toContain("allowance receipt and exact command effect cardinality is invalid");
    expect(ddl).toContain("allowance command effect does not match canonical receipt command");
    expect(ddl).toContain(
      "allowance command did not persist its exact reservation or consumption fact"
    );
    expect(ddl).toContain(
      "new.command->>'operation' in ('consume_reserved', 'release_reserved', 'forfeit_reserved')"
    );
    expect(ddl).toContain(
      "new.operation in ('consume_reserved', 'release_reserved', 'forfeit_reserved')"
    );
    expect(ddl).toContain("new.operation in ('consume_reserved', 'forfeit_reserved')");
    expect(ddl).toContain(
      "new.operation in ('release_reserved', 'forfeit_reserved') and not exists"
    );
    expect(ddl).toContain("paid subscription period requires its exact initial allowance");
    expect(ddl).toContain("paid subscription period requires applied capture evidence");
    expect(ddl).toContain("subscription transition requires exactly one persistence owner");
    expect(ddl).toContain("sealed subscription contract requires atomic creation graph");
    expect(ddl).toContain("allowance update requires its exact applied command effect");
    expect(ddl).toContain("retained subscription transition must keep its cas slot pointer");
  });

  it("excludes overlapping paid-period ranges and validates timezone evidence", () => {
    const exclusion = normalizeSql(clientSubscriptionPeriodExclusionSql);
    const integrity = normalizeSql(clientSubscriptionIntegritySql);

    expect(exclusion).toContain("create extension if not exists btree_gist");
    expect(exclusion).toContain("exclude using gist");
    expect(exclusion).toContain("tstzrange(starts_at, ends_at, '[)') with &&");
    expect(integrity).toContain("from pg_timezone_names");
    expect(integrity).toContain("resolved_start_local::timestamp");
    expect(integrity).toContain("resolved_end_local::timestamp");
    expect(integrity).toContain(
      "period_row.resolved_start_local || period_row.resolved_start_offset"
    );
    expect(integrity).toContain("period_row.resolved_end_local || period_row.resolved_end_offset");
    expect(integrity).toContain("origin_period.sequence = period_row.anchor_origin_sequence");
    expect(integrity).toContain("predecessor.sequence = period_row.sequence - 1");
    expect(integrity).toContain("contract.cadence = 'week'");
    expect(integrity).toContain("contract.cadence = 'month'");
    expect(integrity).toContain("contract.cadence = 'year'");
    expect(integrity).toContain("subscription period original anchor or cadence chain is invalid");
  });

  it("requires the exact lifecycle output set and exact entitlement effects for every transition", () => {
    const ddl = normalizeSql(clientSubscriptionIntegritySql);

    expect(ddl).toContain("event.occurred_at is distinct from transition_row.occurred_at");
    expect(ddl).toContain("event.event_type = transition_row.primary_event_type");
    expect(ddl).toContain("subscription transition lifecycle output set is invalid");
    expect(ddl).toContain("period entitlement transition effect set is not exact");
    expect(ddl).toContain("subscription-all revocation effect set is not exact");
  });

  it("validates superseded period transitions from immutable effects instead of current grant state", () => {
    const ddl = normalizeSql(clientSubscriptionIntegritySql);
    const periodEffectStart = ddl.indexOf("if transition_row.entitlement_scope = 'period'");
    const subscriptionAllStart = ddl.indexOf(
      "if transition_row.entitlement_scope = 'subscription_all'",
      periodEffectStart
    );
    const periodEffectBlock = ddl.slice(periodEffectStart, subscriptionAllStart);

    expect(periodEffectBlock).toContain("grant_row.period_id = transition_row.period_id");
    expect(periodEffectBlock).toContain(
      "effect.after_state = transition_row.entitlement_state"
    );
    expect(periodEffectBlock).not.toContain(
      "grant_row.source_transition_id = transition_row.transition_id"
    );
    expect(periodEffectBlock).not.toContain(
      "grant_row.source_subscription_version = transition_row.subscription_version"
    );
    expect(periodEffectBlock).not.toContain("effect.after_version = grant_row.version");
    expect(periodEffectBlock).not.toContain("effect.after_state = grant_row.state");
  });

  it("isolates table-specific transition RECORD fields before accessing their columns", () => {
    const ddl = normalizeSql(clientSubscriptionIntegritySql);

    expect(ddl).toContain(
      "if tg_table_name = 'client_entitlement_grants' then if tg_op = 'insert' and not exists"
    );
    expect(ddl).toContain(
      "if tg_table_name = 'client_subscription_period_allowances' then if tg_op = 'update' and not exists"
    );
    expect(ddl).toContain(
      "if tg_table_name = 'client_subscription_command_receipts' then if (new.result_kind = 'applied'"
    );
    expect(ddl).not.toContain(
      "tg_table_name = 'client_entitlement_grants' and tg_op = 'insert' and not exists"
    );
    expect(ddl).not.toContain(
      "tg_table_name = 'client_subscription_command_receipts' and ("
    );
  });

  it("reads the order transaction identity explicitly instead of relying on SELECT star system columns", () => {
    const ddl = normalizeSql(clientSubscriptionIntegritySql);

    expect(ddl).toContain("select xmin::text into strict order_row_transaction_id from orders");
    expect(ddl).toContain(
      "order_row_transaction_id is distinct from pg_current_xact_id()::text"
    );
    expect(ddl).not.toContain("order_row.xmin::text");
  });

  it("never persists the finance capture input as a subscription lifecycle output", () => {
    expect(clientSubscriptionIntegritySql).not.toContain(
      "'client_subscription.capture_applied.v1'"
    );
  });

  it("pins every PL/pgSQL function to trusted schemas", () => {
    const functions = clientSubscriptionIntegritySql.match(
      /CREATE OR REPLACE FUNCTION[\s\S]*?(?=CREATE OR REPLACE FUNCTION|$)/g
    );

    expect(functions).not.toBeNull();
    for (const body of functions ?? []) {
      expect(normalizeSql(body)).toContain("set search_path = pg_catalog, public");
    }
  });

  it("starts reservations open and permits exactly one terminal transition", () => {
    const ddl = normalizeSql(clientSubscriptionIntegritySql);

    expect(ddl).toContain("if tg_op = 'insert' and new.state <> 'reserved'");
    expect(ddl).toContain(
      "before insert or update or delete on client_subscription_allowance_reservations"
    );
  });
});

function normalizeSql(value: string): string {
  return value.replaceAll(/\s+/gu, " ").trim().toLowerCase();
}
