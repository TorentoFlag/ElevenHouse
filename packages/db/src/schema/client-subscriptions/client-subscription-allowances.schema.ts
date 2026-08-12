import type { ClientSubscriptionAllowanceCommand } from "@elevenhouse/domain";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { clientSubscriptionPeriods } from "./client-subscription-periods.schema";

export const clientSubscriptionPeriodAllowances = pgTable(
  "client_subscription_period_allowances",
  {
    periodId: uuid("period_id").primaryKey(),
    subscriptionId: uuid("subscription_id").notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    total: integer("total").notNull(),
    available: integer("available").notNull(),
    reserved: integer("reserved").notNull(),
    consumed: integer("consumed").notNull(),
    released: integer("released").notNull(),
    version: integer("version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("client_subscription_period_allowances_exact_identity_unique").on(
      table.periodId,
      table.subscriptionId
    ),
    foreignKey({
      columns: [table.periodId, table.subscriptionId, table.endsAt],
      foreignColumns: [
        clientSubscriptionPeriods.id,
        clientSubscriptionPeriods.subscriptionId,
        clientSubscriptionPeriods.endsAt
      ],
      name: "client_subscription_period_allowances_period_fk"
    }).onDelete("restrict"),
    check(
      "client_subscription_period_allowances_nonnegative_check",
      sql`${table.total} >= 0 and ${table.available} >= 0 and ${table.reserved} >= 0 and ${table.consumed} >= 0 and ${table.released} >= 0`
    ),
    check(
      "client_subscription_period_allowances_arithmetic_check",
      sql`${table.available} + ${table.reserved} + ${table.consumed} + ${table.released} = ${table.total}`
    ),
    check("client_subscription_period_allowances_version_check", sql`${table.version} >= 1`)
  ]
);

export const clientSubscriptionAllowanceReservations = pgTable(
  "client_subscription_allowance_reservations",
  {
    id: uuid("id").primaryKey(),
    periodId: uuid("period_id").notNull(),
    subscriptionId: uuid("subscription_id").notNull(),
    state: text("state").notNull(),
    reservedAt: timestamp("reserved_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true })
  },
  (table) => [
    unique("client_subscription_allowance_reservations_period_identity_unique").on(
      table.periodId,
      table.id
    ),
    unique("client_subscription_allowance_reservations_exact_identity_unique").on(
      table.id,
      table.periodId,
      table.subscriptionId
    ),
    foreignKey({
      columns: [table.periodId, table.subscriptionId],
      foreignColumns: [
        clientSubscriptionPeriodAllowances.periodId,
        clientSubscriptionPeriodAllowances.subscriptionId
      ],
      name: "client_subscription_allowance_reservations_allowance_fk"
    }).onDelete("restrict"),
    check(
      "client_subscription_allowance_reservations_state_check",
      sql`(
        ${table.state} = 'reserved' and ${table.consumedAt} is null and ${table.releasedAt} is null
      ) or (
        ${table.state} = 'consumed' and ${table.consumedAt} is not null and ${table.releasedAt} is null
      ) or (
        ${table.state} = 'released' and ${table.consumedAt} is null and ${table.releasedAt} is not null
      )`
    )
  ]
);

export const clientSubscriptionAllowanceConsumptions = pgTable(
  "client_subscription_allowance_consumptions",
  {
    id: uuid("id").primaryKey(),
    periodId: uuid("period_id").notNull(),
    subscriptionId: uuid("subscription_id").notNull(),
    source: text("source").notNull(),
    reservationId: uuid("reservation_id"),
    consumedAt: timestamp("consumed_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("client_subscription_allowance_consumptions_period_identity_unique").on(
      table.periodId,
      table.id
    ),
    unique("client_subscription_allowance_consumptions_reservation_unique").on(table.reservationId),
    foreignKey({
      columns: [table.periodId, table.subscriptionId],
      foreignColumns: [
        clientSubscriptionPeriodAllowances.periodId,
        clientSubscriptionPeriodAllowances.subscriptionId
      ],
      name: "client_subscription_allowance_consumptions_allowance_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.reservationId, table.periodId, table.subscriptionId],
      foreignColumns: [
        clientSubscriptionAllowanceReservations.id,
        clientSubscriptionAllowanceReservations.periodId,
        clientSubscriptionAllowanceReservations.subscriptionId
      ],
      name: "client_subscription_allowance_consumptions_reservation_fk"
    }).onDelete("restrict"),
    check(
      "client_subscription_allowance_consumptions_source_check",
      sql`(${table.source} = 'available' and ${table.reservationId} is null)
        or (${table.source} = 'reservation'
          and ${table.reservationId} is not null
          and ${table.id} = ${table.reservationId})`
    )
  ]
);

export const clientSubscriptionAllowanceCommandReceipts = pgTable(
  "client_subscription_allowance_command_receipts",
  {
    periodId: uuid("period_id").notNull(),
    expectedVersion: integer("expected_version").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    requestHash: varchar("request_hash", { length: 71 }).notNull(),
    command: jsonb("command").$type<ClientSubscriptionAllowanceCommand>().notNull(),
    resultKind: text("result_kind").notNull(),
    result: jsonb("result").$type<Record<string, unknown>>().notNull(),
    resultVersion: integer("result_version").notNull()
  },
  (table) => [
    unique("client_subscription_allowance_receipts_period_key_unique").on(
      table.periodId,
      table.idempotencyKey
    ),
    foreignKey({
      columns: [table.periodId],
      foreignColumns: [clientSubscriptionPeriodAllowances.periodId],
      name: "client_subscription_allowance_receipts_allowance_fk"
    }).onDelete("restrict"),
    check(
      "client_subscription_allowance_receipts_hash_check",
      sql`${table.requestHash} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "client_subscription_allowance_receipts_command_check",
      sql`jsonb_typeof(${table.command}) = 'object'
        and ${table.command}->>'operation' in (
          'reserve',
          'consume_available',
          'consume_reserved',
          'release_reserved',
          'forfeit_reserved',
          'expire_available'
        )`
    ),
    check(
      "client_subscription_allowance_receipts_result_check",
      sql`${table.resultKind} in ('applied', 'rejected')
        and jsonb_typeof(${table.result}) = 'object'
        and ${table.expectedVersion} >= 1
        and (
          (${table.resultKind} = 'applied' and ${table.resultVersion} = ${table.expectedVersion} + 1)
          or (${table.resultKind} = 'rejected' and ${table.resultVersion} = ${table.expectedVersion})
        )
        and (
          (${table.resultKind} = 'applied'
            and ${table.result} = jsonb_build_object('outcome', 'applied'))
          or (${table.resultKind} = 'rejected'
            and ${table.result}->>'outcome' = 'rejected'
            and jsonb_typeof(${table.result}->'decision') = 'object'
            and ${table.result}->'decision' = jsonb_build_object(
              'outcome', ${table.result}->'decision'->>'outcome'
            )
            and ${table.result}->'decision'->>'outcome' in (
              'allowance_exhausted',
              'period_ended',
              'paid_access_not_ended',
              'reservation_already_exists',
              'reservation_not_found',
              'reservation_not_active'
            )
            and ${table.result} - ARRAY['outcome', 'decision']::text[] = '{}'::jsonb)
        )`
    )
  ]
);

export const clientSubscriptionAllowanceCommandEffects = pgTable(
  "client_subscription_allowance_command_effects",
  {
    periodId: uuid("period_id").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    beforeVersion: integer("before_version").notNull(),
    beforeAvailable: integer("before_available").notNull(),
    beforeReserved: integer("before_reserved").notNull(),
    beforeConsumed: integer("before_consumed").notNull(),
    beforeReleased: integer("before_released").notNull(),
    afterVersion: integer("after_version").notNull(),
    afterAvailable: integer("after_available").notNull(),
    afterReserved: integer("after_reserved").notNull(),
    afterConsumed: integer("after_consumed").notNull(),
    afterReleased: integer("after_released").notNull(),
    operation: text("operation").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    reservationId: uuid("reservation_id"),
    reservationStateBefore: text("reservation_state_before"),
    reservationStateAfter: text("reservation_state_after"),
    consumptionId: uuid("consumption_id")
  },
  (table) => [
    unique("client_subscription_allowance_command_effects_receipt_unique").on(
      table.periodId,
      table.idempotencyKey
    ),
    unique("client_subscription_allowance_command_effects_version_unique").on(
      table.periodId,
      table.afterVersion
    ),
    foreignKey({
      columns: [table.periodId, table.idempotencyKey],
      foreignColumns: [
        clientSubscriptionAllowanceCommandReceipts.periodId,
        clientSubscriptionAllowanceCommandReceipts.idempotencyKey
      ],
      name: "client_subscription_allowance_command_effects_receipt_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.reservationId, table.periodId],
      foreignColumns: [
        clientSubscriptionAllowanceReservations.id,
        clientSubscriptionAllowanceReservations.periodId
      ],
      name: "client_subscription_allowance_command_effects_reservation_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.consumptionId, table.periodId],
      foreignColumns: [
        clientSubscriptionAllowanceConsumptions.id,
        clientSubscriptionAllowanceConsumptions.periodId
      ],
      name: "client_subscription_allowance_command_effects_consumption_fk"
    }).onDelete("restrict"),
    check(
      "client_subscription_allowance_command_effects_version_check",
      sql`${table.beforeVersion} >= 1 and ${table.afterVersion} = ${table.beforeVersion} + 1`
    ),
    check(
      "client_subscription_allowance_command_effects_nonnegative_check",
      sql`${table.beforeAvailable} >= 0
        and ${table.beforeReserved} >= 0
        and ${table.beforeConsumed} >= 0
        and ${table.beforeReleased} >= 0
        and ${table.afterAvailable} >= 0
        and ${table.afterReserved} >= 0
        and ${table.afterConsumed} >= 0
        and ${table.afterReleased} >= 0`
    ),
    check(
      "client_subscription_allowance_command_effects_total_check",
      sql`${table.beforeAvailable} + ${table.beforeReserved} + ${table.beforeConsumed} + ${table.beforeReleased}
        = ${table.afterAvailable} + ${table.afterReserved} + ${table.afterConsumed} + ${table.afterReleased}`
    ),
    check(
      "client_subscription_allowance_command_effects_operation_check",
      sql`(
        ${table.operation} = 'reserve'
        and ${table.afterAvailable} = ${table.beforeAvailable} - 1
        and ${table.afterReserved} = ${table.beforeReserved} + 1
        and ${table.afterConsumed} = ${table.beforeConsumed}
        and ${table.afterReleased} = ${table.beforeReleased}
      ) or (
        ${table.operation} = 'consume_available'
        and ${table.afterAvailable} = ${table.beforeAvailable} - 1
        and ${table.afterReserved} = ${table.beforeReserved}
        and ${table.afterConsumed} = ${table.beforeConsumed} + 1
        and ${table.afterReleased} = ${table.beforeReleased}
      ) or (
        ${table.operation} = 'consume_reserved'
        and ${table.afterAvailable} = ${table.beforeAvailable}
        and ${table.afterReserved} = ${table.beforeReserved} - 1
        and ${table.afterConsumed} = ${table.beforeConsumed} + 1
        and ${table.afterReleased} = ${table.beforeReleased}
      ) or (
        ${table.operation} = 'release_reserved'
        and ${table.afterReserved} = ${table.beforeReserved} - 1
        and ${table.afterConsumed} = ${table.beforeConsumed}
        and (
          (${table.afterAvailable} = ${table.beforeAvailable} + 1
            and ${table.afterReleased} = ${table.beforeReleased})
          or (${table.afterAvailable} = ${table.beforeAvailable}
            and ${table.afterReleased} = ${table.beforeReleased} + 1)
        )
      ) or (
        ${table.operation} = 'forfeit_reserved'
        and ${table.afterAvailable} = ${table.beforeAvailable}
        and ${table.afterReserved} = ${table.beforeReserved} - 1
        and ${table.afterConsumed} = ${table.beforeConsumed}
        and ${table.afterReleased} = ${table.beforeReleased} + 1
      ) or (
        ${table.operation} = 'expire_available'
        and ${table.afterAvailable} = 0
        and ${table.afterReserved} = ${table.beforeReserved}
        and ${table.afterConsumed} = ${table.beforeConsumed}
        and ${table.afterReleased} = ${table.beforeReleased} + ${table.beforeAvailable}
      )`
    ),
    check(
      "client_subscription_allowance_command_effects_fact_transition_check",
      sql`(
        ${table.operation} = 'reserve'
        and ${table.reservationId} is not null
        and ${table.reservationStateBefore} is null
        and ${table.reservationStateAfter} = 'reserved'
        and ${table.consumptionId} is null
      ) or (
        ${table.operation} = 'consume_available'
        and ${table.reservationId} is null
        and ${table.reservationStateBefore} is null
        and ${table.reservationStateAfter} is null
        and ${table.consumptionId} is not null
      ) or (
        ${table.operation} = 'consume_reserved'
        and ${table.reservationId} is not null
        and ${table.reservationStateBefore} = 'reserved'
        and ${table.reservationStateAfter} = 'consumed'
        and ${table.consumptionId} = ${table.reservationId}
      ) or (
        ${table.operation} in ('release_reserved', 'forfeit_reserved')
        and ${table.reservationId} is not null
        and ${table.reservationStateBefore} = 'reserved'
        and ${table.reservationStateAfter} = 'released'
        and ${table.consumptionId} is null
      ) or (
        ${table.operation} = 'expire_available'
        and ${table.reservationId} is null
        and ${table.reservationStateBefore} is null
        and ${table.reservationStateAfter} is null
        and ${table.consumptionId} is null
      )`
    )
  ]
);
