import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { clientBirthDataHistory } from "../clients/client-birth-data.schema";
import { outboxEvents } from "../outbox/outbox-events.schema";
import { flowRuns } from "./flow-runtime.schema";
import { flowWorkItems } from "./flow-work-items.schema";
import { flowBirthProfileRecheckReceiptOutcomeValues, formatFlowSqlValues } from "./flows-values";

/**
 * One durable disposition per profile-revision outbox delivery and Flow run.
 * It stores no birth data: immutable history remains the audit authority.
 */
export const flowBirthProfileRecheckReceipts = pgTable(
  "flow_birth_profile_recheck_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceOutboxEventId: uuid("source_outbox_event_id").notNull(),
    birthDataHistoryId: uuid("birth_data_history_id").notNull(),
    ownerUserId: uuid("owner_user_id").notNull(),
    flowRunId: uuid("flow_run_id").notNull(),
    workItemId: uuid("work_item_id").notNull(),
    birthDataRevision: integer("birth_data_revision").notNull(),
    outcome: text("outcome").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.sourceOutboxEventId],
      foreignColumns: [outboxEvents.id],
      name: "flow_birth_profile_recheck_receipts_outbox_event_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.birthDataHistoryId],
      foreignColumns: [clientBirthDataHistory.id],
      name: "flow_birth_profile_recheck_receipts_history_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.flowRunId, table.ownerUserId],
      foreignColumns: [flowRuns.id, flowRuns.ownerUserId],
      name: "flow_birth_profile_recheck_receipts_run_owner_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workItemId, table.flowRunId, table.ownerUserId],
      foreignColumns: [flowWorkItems.id, flowWorkItems.flowRunId, flowWorkItems.ownerUserId],
      name: "flow_birth_profile_recheck_receipts_work_item_run_owner_fk"
    }).onDelete("restrict"),
    unique("flow_birth_profile_recheck_receipts_source_run_unique").on(
      table.sourceOutboxEventId,
      table.flowRunId
    ),
    index("flow_birth_profile_recheck_receipts_history_idx").on(
      table.birthDataHistoryId,
      table.processedAt,
      table.id
    ),
    check(
      "flow_birth_profile_recheck_receipts_revision_check",
      sql`${table.birthDataRevision} > 0`
    ),
    check(
      "flow_birth_profile_recheck_receipts_outcome_check",
      sql`${table.outcome} in ${sql.raw(
        formatFlowSqlValues(flowBirthProfileRecheckReceiptOutcomeValues)
      )}`
    )
  ]
);
