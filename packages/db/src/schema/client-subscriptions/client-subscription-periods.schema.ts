import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid
} from "drizzle-orm/pg-core";

import { clientSubscriptions } from "./client-subscriptions.schema";

export const clientSubscriptionPeriods = pgTable(
  "client_subscription_periods",
  {
    id: uuid("id").primaryKey(),
    subscriptionId: uuid("subscription_id").notNull(),
    contractId: uuid("contract_id").notNull(),
    sequence: integer("sequence").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    anchorCapturedAt: timestamp("anchor_captured_at", { withTimezone: true }).notNull(),
    anchorServiceTimezone: text("anchor_service_timezone").notNull(),
    anchorOriginSequence: integer("anchor_origin_sequence").notNull(),
    anchorLocalDateTime: text("anchor_local_date_time").notNull(),
    resolvedStartLocal: text("resolved_start_local").notNull(),
    resolvedStartOffset: text("resolved_start_offset").notNull(),
    resolvedEndLocal: text("resolved_end_local").notNull(),
    resolvedEndOffset: text("resolved_end_offset").notNull(),
    captureEvidenceId: uuid("capture_evidence_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("client_subscription_periods_subscription_sequence_unique").on(
      table.subscriptionId,
      table.sequence
    ),
    unique("client_subscription_periods_exact_identity_unique").on(
      table.id,
      table.subscriptionId,
      table.contractId,
      table.sequence
    ),
    unique("client_subscription_periods_id_subscription_unique").on(table.id, table.subscriptionId),
    unique("client_subscription_periods_allowance_scope_unique").on(
      table.id,
      table.subscriptionId,
      table.endsAt
    ),
    unique("client_subscription_periods_id_subscription_bounds_unique").on(
      table.id,
      table.subscriptionId,
      table.startsAt,
      table.endsAt
    ),
    unique("client_subscription_periods_entitlement_scope_unique").on(
      table.id,
      table.subscriptionId,
      table.contractId,
      table.startsAt,
      table.endsAt
    ),
    unique("client_subscription_periods_capture_evidence_unique").on(
      table.subscriptionId,
      table.captureEvidenceId
    ),
    foreignKey({
      columns: [table.subscriptionId, table.contractId],
      foreignColumns: [clientSubscriptions.id, clientSubscriptions.contractId],
      name: "client_subscription_periods_subscription_contract_fk"
    }).onDelete("restrict"),
    check("client_subscription_periods_sequence_check", sql`${table.sequence} >= 1`),
    check(
      "client_subscription_periods_half_open_range_check",
      sql`${table.startsAt} < ${table.endsAt}`
    ),
    check(
      "client_subscription_periods_anchor_check",
      sql`${table.anchorOriginSequence} >= 1
        and ((
          ${table.anchorOriginSequence} = ${table.sequence}
          and ${table.anchorCapturedAt} = ${table.startsAt}
        ) or (
          ${table.anchorOriginSequence} < ${table.sequence}
          and ${table.anchorCapturedAt} < ${table.startsAt}
        ))
        and length(trim(${table.anchorServiceTimezone})) between 1 and 100
        and length(trim(${table.anchorLocalDateTime})) > 0
        and length(trim(${table.resolvedStartLocal})) > 0
        and length(trim(${table.resolvedEndLocal})) > 0
        and ${table.resolvedStartOffset} ~ '^[+-][0-9]{2}:[0-9]{2}$'
        and ${table.resolvedEndOffset} ~ '^[+-][0-9]{2}:[0-9]{2}$'`
    ),
    index("client_subscription_periods_subscription_bounds_idx").on(
      table.subscriptionId,
      table.startsAt,
      table.endsAt
    )
  ]
);
