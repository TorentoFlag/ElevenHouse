import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

import { clientAstrologerRelationships } from "../clients/client-astrologer-relationships.schema";
import { clientSubscriptionAllowanceReservations } from "../client-subscriptions/client-subscription-allowances.schema";
import { clientSubscriptionAllowanceConsumptions } from "../client-subscriptions/client-subscription-allowances.schema";
import { clientSubscriptionPeriods } from "../client-subscriptions/client-subscription-periods.schema";
import { clientSubscriptions } from "../client-subscriptions/client-subscriptions.schema";

export const astroDiaryJournals = pgTable(
  "astro_diary_journals",
  {
    id: uuid("id").primaryKey(),
    relationshipId: uuid("relationship_id").notNull(),
    journalEpochId: uuid("journal_epoch_id").notNull(),
    astrologerUserId: uuid("astrologer_user_id").notNull(),
    clientUserId: uuid("client_user_id").notNull(),
    state: text("state").notNull(),
    version: integer("version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("astro_diary_journals_epoch_unique").on(table.journalEpochId),
    unique("astro_diary_journals_pair_identity_unique").on(
      table.id,
      table.clientUserId,
      table.astrologerUserId
    ),
    unique("astro_diary_journals_activation_identity_unique").on(
      table.id,
      table.relationshipId,
      table.journalEpochId
    ),
    foreignKey({
      columns: [table.relationshipId, table.clientUserId, table.astrologerUserId],
      foreignColumns: [
        clientAstrologerRelationships.id,
        clientAstrologerRelationships.clientUserId,
        clientAstrologerRelationships.astrologerUserId
      ],
      name: "astro_diary_journals_relationship_pair_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.journalEpochId],
      foreignColumns: [clientSubscriptions.journalEpochId],
      name: "astro_diary_journals_subscription_epoch_fk"
    }).onDelete("restrict"),
    check(
      "astro_diary_journals_state_check",
      sql`${table.state} in ('active', 'erasing', 'erased')`
    ),
    check("astro_diary_journals_version_check", sql`${table.version} >= 1`),
    check(
      "astro_diary_journals_distinct_users_check",
      sql`${table.clientUserId} <> ${table.astrologerUserId}`
    ),
    index("astro_diary_journals_client_state_idx").on(table.clientUserId, table.state),
    index("astro_diary_journals_astrologer_state_idx").on(table.astrologerUserId, table.state)
  ]
);

export const astroDiaryCycles = pgTable(
  "astro_diary_cycles",
  {
    id: uuid("id").primaryKey(),
    journalId: uuid("journal_id")
      .notNull()
      .references(() => astroDiaryJournals.id, { onDelete: "restrict" }),
    openingPeriodId: uuid("opening_period_id")
      .notNull()
      .references(() => clientSubscriptionPeriods.id, { onDelete: "restrict" }),
    openingAllowanceReservationId: uuid("opening_allowance_reservation_id"),
    awaitingClientPromptItemId: uuid("awaiting_client_prompt_item_id"),
    clientResponseDueAt: timestamp("client_response_due_at", { withTimezone: true }),
    clientResponseWindowCalendarDays: integer("client_response_window_calendar_days"),
    clientResponseTimezone: text("client_response_timezone"),
    state: text("state").notNull(),
    version: integer("version").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closeReason: text("close_reason")
  },
  (table) => [
    unique("astro_diary_cycles_journal_identity_unique").on(table.id, table.journalId),
    foreignKey({
      columns: [table.openingPeriodId, table.openingAllowanceReservationId],
      foreignColumns: [
        clientSubscriptionAllowanceReservations.periodId,
        clientSubscriptionAllowanceReservations.id
      ],
      name: "astro_diary_cycles_allowance_reservation_fk"
    }).onDelete("restrict"),
    check(
      "astro_diary_cycles_state_evidence_check",
      sql`(
        ${table.state} in (
          'awaiting_client_entry',
          'awaiting_astrologer_response',
          'awaiting_client_follow_up',
          'awaiting_astrologer_closing_response'
        ) and ${table.closedAt} is null and ${table.closeReason} is null
      ) or (
        ${table.state} = 'closed'
        and ${table.closedAt} is not null
        and ${table.closeReason} in (
          'completed',
          'client_declined',
          'prompt_withdrawn',
          'client_response_expired',
          'trigger_deleted',
          'journal_deleted',
          'cancelled_by_finance_revocation'
        )
      )`
    ),
    check(
      "astro_diary_cycles_prompt_window_check",
      sql`(
        ${table.state} in ('awaiting_client_entry', 'awaiting_client_follow_up')
        and ${table.awaitingClientPromptItemId} is not null
        and ${table.clientResponseDueAt} is not null
        and ${table.clientResponseWindowCalendarDays} between 1 and 90
        and length(trim(${table.clientResponseTimezone})) between 1 and 100
      ) or (
        ${table.state} not in ('awaiting_client_entry', 'awaiting_client_follow_up', 'closed')
        and ${table.awaitingClientPromptItemId} is null
        and ${table.clientResponseDueAt} is null
        and ${table.clientResponseWindowCalendarDays} is null
        and ${table.clientResponseTimezone} is null
      ) or (
        ${table.state} = 'closed'
        and ${table.awaitingClientPromptItemId} is null
        and (
          (${table.clientResponseDueAt} is null
            and ${table.clientResponseWindowCalendarDays} is null
            and ${table.clientResponseTimezone} is null)
          or (${table.clientResponseDueAt} is not null
            and ${table.clientResponseWindowCalendarDays} between 1 and 90
            and length(trim(${table.clientResponseTimezone})) between 1 and 100)
        )
      )`
    ),
    check(
      "astro_diary_cycles_opening_reservation_check",
      sql`(${table.state} = 'awaiting_client_entry' and ${table.openingAllowanceReservationId} is not null)
        or (${table.state} <> 'awaiting_client_entry' and ${table.openingAllowanceReservationId} is null)`
    ),
    check(
      "astro_diary_cycles_time_order_check",
      sql`(${table.closedAt} is null or ${table.closedAt} >= ${table.openedAt})
        and (${table.clientResponseDueAt} is null or ${table.clientResponseDueAt} > ${table.openedAt})`
    ),
    check("astro_diary_cycles_version_check", sql`${table.version} >= 1`),
    uniqueIndex("astro_diary_cycles_one_open_per_journal")
      .on(table.journalId)
      .where(sql`${table.state} <> 'closed'`),
    index("astro_diary_cycles_journal_opened_idx").on(table.journalId, table.openedAt, table.id)
  ]
);

/** Immutable proof of the paid allowance reservation that opened a reflection cycle. */
export const astroDiaryCycleOpeningAllowanceFacts = pgTable(
  "astro_diary_cycle_opening_allowance_facts",
  {
    cycleId: uuid("cycle_id")
      .primaryKey()
      .references(() => astroDiaryCycles.id, { onDelete: "restrict" }),
    journalId: uuid("journal_id").notNull(),
    openingPeriodId: uuid("opening_period_id").notNull(),
    openingAllowanceReservationId: uuid("opening_allowance_reservation_id"),
    openingAllowanceConsumptionId: uuid("opening_allowance_consumption_id"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull()
  },
  (table) => [
    foreignKey({
      columns: [table.cycleId, table.journalId],
      foreignColumns: [astroDiaryCycles.id, astroDiaryCycles.journalId],
      name: "astro_diary_cycle_opening_allowance_facts_cycle_journal_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.openingPeriodId, table.openingAllowanceReservationId],
      foreignColumns: [
        clientSubscriptionAllowanceReservations.periodId,
        clientSubscriptionAllowanceReservations.id
      ],
      name: "astro_diary_cycle_opening_allowance_facts_reservation_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.openingPeriodId, table.openingAllowanceConsumptionId],
      foreignColumns: [
        clientSubscriptionAllowanceConsumptions.periodId,
        clientSubscriptionAllowanceConsumptions.id
      ],
      name: "astro_diary_cycle_opening_allowance_facts_consumption_fk"
    }).onDelete("restrict"),
    check(
      "astro_diary_cycle_opening_allowance_facts_recorded_check",
      sql`${table.recordedAt} is not null
        and ((${table.openingAllowanceReservationId} is null) <> (${table.openingAllowanceConsumptionId} is null))`
    )
  ]
);

export const astroDiaryResponseObligations = pgTable(
  "astro_diary_response_obligations",
  {
    id: uuid("id").primaryKey(),
    journalId: uuid("journal_id")
      .notNull()
      .references(() => astroDiaryJournals.id, { onDelete: "restrict" }),
    cycleId: uuid("cycle_id").notNull(),
    triggerItemId: uuid("trigger_item_id").notNull(),
    state: text("state").notNull(),
    version: integer("version").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    responseSlaWorkingDays: integer("response_sla_working_days").notNull(),
    serviceTimezone: text("service_timezone").notNull(),
    resolvedDueLocal: text("resolved_due_local").notNull(),
    resolvedDueOffset: text("resolved_due_offset").notNull(),
    satisfiedByItemId: uuid("satisfied_by_item_id"),
    closedAt: timestamp("closed_at", { withTimezone: true })
  },
  (table) => [
    unique("astro_diary_response_obligations_journal_identity_unique").on(
      table.id,
      table.journalId
    ),
    foreignKey({
      columns: [table.cycleId, table.journalId],
      foreignColumns: [astroDiaryCycles.id, astroDiaryCycles.journalId],
      name: "astro_diary_response_obligations_cycle_journal_fk"
    }).onDelete("restrict"),
    check(
      "astro_diary_response_obligations_state_evidence_check",
      sql`(
        ${table.state} in ('open', 'overdue')
        and ${table.satisfiedByItemId} is null
        and ${table.closedAt} is null
      ) or (
        ${table.state} = 'satisfied'
        and ${table.satisfiedByItemId} is not null
        and ${table.closedAt} is not null
      ) or (
        ${table.state} in ('cancelled_by_finance_revocation', 'closed_without_response')
        and ${table.satisfiedByItemId} is null
        and ${table.closedAt} is not null
      )`
    ),
    check(
      "astro_diary_response_obligations_due_evidence_check",
      sql`${table.dueAt} > ${table.openedAt}
        and (${table.closedAt} is null or ${table.closedAt} >= ${table.openedAt})
        and ${table.responseSlaWorkingDays} between 1 and 30
        and length(trim(${table.serviceTimezone})) between 1 and 100
        and length(trim(${table.resolvedDueLocal})) between 1 and 80
        and ${table.resolvedDueOffset} ~ '^[+-](0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$'
        and (${table.resolvedDueLocal} || ${table.resolvedDueOffset})::timestamptz = ${table.dueAt}`
    ),
    check("astro_diary_response_obligations_version_check", sql`${table.version} >= 1`),
    uniqueIndex("astro_diary_response_obligations_one_actionable_per_cycle")
      .on(table.cycleId)
      .where(sql`${table.state} in ('open', 'overdue')`),
    index("astro_diary_response_obligations_due_idx").on(table.state, table.dueAt, table.id)
  ]
);

export const astroDiaryResponseObligationWeekdays = pgTable(
  "astro_diary_response_obligation_weekdays",
  {
    obligationId: uuid("obligation_id")
      .notNull()
      .references(() => astroDiaryResponseObligations.id, { onDelete: "restrict" }),
    isoWeekday: integer("iso_weekday").notNull()
  },
  (table) => [
    primaryKey({
      columns: [table.obligationId, table.isoWeekday],
      name: "astro_diary_response_obligation_weekdays_pk"
    }),
    check(
      "astro_diary_response_obligation_weekdays_value_check",
      sql`${table.isoWeekday} between 1 and 7`
    )
  ]
);
