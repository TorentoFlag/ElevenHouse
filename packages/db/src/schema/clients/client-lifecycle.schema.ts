import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

import { clientAstrologerRelationships } from "./client-astrologer-relationships.schema";
import {
  clientLifecycleCauseKindValues,
  clientLifecycleDispositionValues,
  clientLifecycleModeValues,
  clientLifecycleStatusValues,
  formatClientSqlValues
} from "./client-values";

export const clientLifecycleStates = pgTable(
  "client_lifecycle_states",
  {
    relationshipId: uuid("relationship_id")
      .primaryKey()
      .references(() => clientAstrologerRelationships.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    mode: text("mode").notNull().default("automatic"),
    latestAutomaticCandidateStatus: text("latest_automatic_candidate_status"),
    revision: integer("revision").notNull().default(1),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "client_lifecycle_states_status_check",
      sql`${table.status} in ${sql.raw(formatClientSqlValues(clientLifecycleStatusValues))}`
    ),
    check(
      "client_lifecycle_states_mode_check",
      sql`${table.mode} in ${sql.raw(formatClientSqlValues(clientLifecycleModeValues))}`
    ),
    check(
      "client_lifecycle_states_candidate_status_check",
      sql`${table.latestAutomaticCandidateStatus} is null or ${table.latestAutomaticCandidateStatus} in ${sql.raw(
        formatClientSqlValues(clientLifecycleStatusValues)
      )}`
    ),
    check("client_lifecycle_states_revision_check", sql`${table.revision} >= 1`),
    index("client_lifecycle_states_mode_activity_idx").on(table.mode, table.lastActivityAt)
  ]
);

export const clientLifecycleHistory = pgTable(
  "client_lifecycle_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => clientAstrologerRelationships.id, { onDelete: "cascade" }),
    sourceEventId: text("source_event_id").notNull(),
    causeKind: text("cause_kind").notNull(),
    beforeStatus: text("before_status"),
    afterStatus: text("after_status").notNull(),
    disposition: text("disposition").notNull(),
    actorUserId: uuid("actor_user_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("client_lifecycle_history_relationship_source_unique").on(
      table.relationshipId,
      table.sourceEventId
    ),
    index("client_lifecycle_history_relationship_occurred_idx").on(
      table.relationshipId,
      table.occurredAt,
      table.id
    ),
    check(
      "client_lifecycle_history_cause_check",
      sql`${table.causeKind} in ${sql.raw(formatClientSqlValues(clientLifecycleCauseKindValues))}`
    ),
    check(
      "client_lifecycle_history_before_status_check",
      sql`${table.beforeStatus} is null or ${table.beforeStatus} in ${sql.raw(
        formatClientSqlValues(clientLifecycleStatusValues)
      )}`
    ),
    check(
      "client_lifecycle_history_after_status_check",
      sql`${table.afterStatus} in ${sql.raw(formatClientSqlValues(clientLifecycleStatusValues))}`
    ),
    check(
      "client_lifecycle_history_disposition_check",
      sql`${table.disposition} in ${sql.raw(formatClientSqlValues(clientLifecycleDispositionValues))}`
    ),
    check(
      "client_lifecycle_history_source_event_id_length_check",
      sql`length(trim(${table.sourceEventId})) between 1 and 180`
    )
  ]
);
