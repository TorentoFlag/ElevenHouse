import {
  flowWorkItemPriorityV2Values,
  flowWorkItemStatusValues,
  flowWorkItemTaskKindValues
} from "@elevenhouse/contracts";
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

import { users } from "../identity/accounts.schema";
import { flowExecutionTokens, flowRunEvents, flowRuns } from "./flow-runtime.schema";
import { flowRuntimeCommands } from "./flow-runtime-commands.schema";
import { formatFlowSqlValues } from "./flows-values";

export const flowWorkItems = pgTable(
  "flow_work_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    flowRunId: uuid("flow_run_id").notNull(),
    flowVersionId: uuid("flow_version_id").notNull(),
    tokenId: uuid("token_id").notNull(),
    nodeActivationSequence: bigint("node_activation_sequence", { mode: "bigint" }).notNull(),
    nodeId: text("node_id").notNull(),
    completionHandle: text("completion_handle").notNull(),
    status: text("status").notNull().default("pending"),
    taskKind: text("task_kind").notNull(),
    title: text("title").notNull(),
    instructions: text("instructions"),
    assigneeUserId: uuid("assignee_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    priority: text("priority").notNull().default("normal"),
    duePolicyKind: text("due_policy_kind").notNull(),
    dueLeadTimeMinutes: integer("due_lead_time_minutes"),
    dueBookingLifecycleRevision: integer("due_booking_lifecycle_revision"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    revision: integer("revision").notNull().default(1),
    resultSummary: text("result_summary"),
    lastCommandId: uuid("last_command_id"),
    lastRunEventId: uuid("last_run_event_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedByUserId: uuid("completed_by_user_id").references(() => users.id, {
      onDelete: "restrict"
    }),
    expiredAt: timestamp("expired_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true })
  },
  (table) => [
    foreignKey({
      columns: [table.flowRunId, table.flowVersionId, table.ownerUserId],
      foreignColumns: [flowRuns.id, flowRuns.flowVersionId, flowRuns.ownerUserId],
      name: "flow_work_items_run_version_owner_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tokenId, table.flowRunId, table.ownerUserId],
      foreignColumns: [
        flowExecutionTokens.id,
        flowExecutionTokens.flowRunId,
        flowExecutionTokens.ownerUserId
      ],
      name: "flow_work_items_token_run_owner_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.lastCommandId, table.flowRunId, table.ownerUserId],
      foreignColumns: [
        flowRuntimeCommands.id,
        flowRuntimeCommands.flowRunId,
        flowRuntimeCommands.ownerUserId
      ],
      name: "flow_work_items_last_command_run_owner_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.lastRunEventId, table.flowRunId, table.ownerUserId],
      foreignColumns: [flowRunEvents.id, flowRunEvents.flowRunId, flowRunEvents.ownerUserId],
      name: "flow_work_items_last_run_event_run_owner_fk"
    }).onDelete("restrict"),
    unique("flow_work_items_id_run_owner_unique").on(
      table.id,
      table.flowRunId,
      table.ownerUserId
    ),
    uniqueIndex("flow_work_items_token_activation_unique").on(
      table.tokenId,
      table.nodeActivationSequence
    ),
    index("flow_work_items_owner_status_available_idx").on(
      table.ownerUserId,
      table.status,
      table.availableAt,
      table.createdAt,
      table.id
    ),
    index("flow_work_items_run_created_idx").on(table.flowRunId, table.createdAt, table.id),
    check(
      "flow_work_items_status_check",
      sql`${table.status} in ${sql.raw(formatFlowSqlValues(flowWorkItemStatusValues))}`
    ),
    check(
      "flow_work_items_task_kind_check",
      sql`${table.taskKind} in ${sql.raw(formatFlowSqlValues(flowWorkItemTaskKindValues))}`
    ),
    check(
      "flow_work_items_priority_check",
      sql`${table.priority} in ${sql.raw(formatFlowSqlValues(flowWorkItemPriorityV2Values))}`
    ),
    check(
      "flow_work_items_due_policy_check",
      sql`(
        ${table.duePolicyKind} = 'none'
        and ${table.dueLeadTimeMinutes} is null
        and ${table.dueBookingLifecycleRevision} is null
        and ${table.dueAt} is null
      ) or (
        ${table.duePolicyKind} = 'before_booking_start'
        and ${table.dueLeadTimeMinutes} between 0 and 525600
        and ${table.dueBookingLifecycleRevision} > 0
        and ${table.dueAt} is not null
      )`
    ),
    check(
      "flow_work_items_node_check",
      sql`${table.nodeActivationSequence} > 0
        and length(trim(${table.nodeId})) between 1 and 160
        and ${table.nodeId} ~ '^[a-z0-9][a-z0-9_-]*$'
        and ${table.completionHandle} = 'success'`
    ),
    check("flow_work_items_assignment_check", sql`${table.assigneeUserId} = ${table.ownerUserId}`),
    check("flow_work_items_revision_check", sql`${table.revision} > 0`),
    check(
      "flow_work_items_provenance_revision_check",
      sql`(
        ${table.revision} = 1
        and ${table.status} = 'pending'
        and ${table.lastCommandId} is null
        and ${table.lastRunEventId} is null
      ) or (
        ${table.revision} > 1
        and (${table.lastCommandId} is null) <> (${table.lastRunEventId} is null)
      )`
    ),
    check(
      "flow_work_items_content_check",
      sql`length(trim(${table.title})) between 1 and 180
        and (${table.instructions} is null
          or length(trim(${table.instructions})) between 1 and 4000)
        and (${table.resultSummary} is null
          or length(trim(${table.resultSummary})) between 1 and 1000)
        and (${table.status} = 'completed' or ${table.resultSummary} is null)`
    ),
    check(
      "flow_work_items_lifecycle_check",
      sql`(
        ${table.status} = 'pending'
        and ${table.snoozedUntil} is null
        and ${table.completedAt} is null
        and ${table.completedByUserId} is null
        and ${table.expiredAt} is null
        and ${table.canceledAt} is null
      ) or (
        ${table.status} = 'in_progress'
        and ${table.startedAt} is not null
        and ${table.snoozedUntil} is null
        and ${table.completedAt} is null
        and ${table.completedByUserId} is null
        and ${table.expiredAt} is null
        and ${table.canceledAt} is null
      ) or (
        ${table.status} = 'snoozed'
        and ${table.snoozedUntil} is not null
        and ${table.availableAt} = ${table.snoozedUntil}
        and ${table.completedAt} is null
        and ${table.completedByUserId} is null
        and ${table.expiredAt} is null
        and ${table.canceledAt} is null
      ) or (
        ${table.status} = 'completed'
        and ${table.startedAt} is not null
        and ${table.completedAt} is not null
        and ${table.snoozedUntil} is null
        and ${table.expiredAt} is null
        and ${table.canceledAt} is null
      ) or (
        ${table.status} = 'expired'
        and ${table.expiredAt} is not null
        and ${table.snoozedUntil} is null
        and ${table.completedAt} is null
        and ${table.completedByUserId} is null
        and ${table.canceledAt} is null
      ) or (
        ${table.status} = 'canceled'
        and ${table.canceledAt} is not null
        and ${table.snoozedUntil} is null
        and ${table.completedAt} is null
        and ${table.completedByUserId} is null
        and ${table.expiredAt} is null
      )`
    ),
    check(
      "flow_work_items_time_order_check",
      sql`${table.updatedAt} >= ${table.createdAt}
        and ${table.availableAt} >= ${table.createdAt}
        and (${table.startedAt} is null or ${table.startedAt} >= ${table.createdAt})
        and (${table.snoozedUntil} is null or ${table.snoozedUntil} >= ${table.updatedAt})
        and (${table.completedAt} is null or ${table.completedAt} >= ${table.startedAt})
        and (${table.expiredAt} is null or ${table.expiredAt} >= ${table.createdAt})
        and (${table.canceledAt} is null or ${table.canceledAt} >= ${table.createdAt})`
    )
  ]
);

export const flowWorkItemCoreIntegritySql = `CREATE OR REPLACE FUNCTION elevenhouse_guard_flow_work_item_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $flow_work_item_guard$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'flow work items cannot be truncated'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_work_items_transition_guard';
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1 FROM flow_runs
       WHERE id = OLD.flow_run_id
         AND owner_user_id = OLD.owner_user_id
    ) THEN
      RAISE EXCEPTION 'flow work items can only be deleted with their run'
        USING ERRCODE = '55000', CONSTRAINT = 'flow_work_items_transition_guard';
    END IF;
    RETURN OLD;
  END IF;

  IF ROW(
      OLD.id, OLD.owner_user_id, OLD.flow_run_id, OLD.flow_version_id,
      OLD.token_id, OLD.node_activation_sequence, OLD.node_id,
      OLD.completion_handle, OLD.task_kind, OLD.title, OLD.instructions,
      OLD.assignee_user_id, OLD.priority, OLD.due_policy_kind,
      OLD.due_lead_time_minutes, OLD.created_at
    ) IS DISTINCT FROM ROW(
      NEW.id, NEW.owner_user_id, NEW.flow_run_id, NEW.flow_version_id,
      NEW.token_id, NEW.node_activation_sequence, NEW.node_id,
      NEW.completion_handle, NEW.task_kind, NEW.title, NEW.instructions,
      NEW.assignee_user_id, NEW.priority, NEW.due_policy_kind,
      NEW.due_lead_time_minutes, NEW.created_at
    ) THEN
    RAISE EXCEPTION 'flow work-item identity and pinned configuration are immutable'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_work_items_transition_guard';
  END IF;

  IF OLD.status IN ('completed', 'expired', 'canceled')
     OR NEW.revision <> OLD.revision + 1
     OR NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'flow work item permits one provenance-backed lifecycle transition'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_work_items_transition_guard';
  END IF;

  IF NEW.last_command_id IS NOT NULL
     AND NEW.last_command_id IS DISTINCT FROM OLD.last_command_id
     AND NEW.last_run_event_id IS NULL
     AND NEW.due_at IS NOT DISTINCT FROM OLD.due_at
     AND NEW.due_booking_lifecycle_revision
           IS NOT DISTINCT FROM OLD.due_booking_lifecycle_revision
     AND (
       (OLD.status = 'pending' AND NEW.status IN ('in_progress', 'snoozed', 'expired', 'canceled'))
       OR (OLD.status = 'in_progress' AND NEW.status IN ('snoozed', 'completed', 'expired', 'canceled'))
       OR (OLD.status = 'snoozed' AND NEW.status IN ('snoozed', 'expired', 'canceled'))
     ) THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'snoozed'
     AND NEW.status = 'pending'
     AND NEW.last_command_id IS NULL
     AND NEW.last_run_event_id IS NOT NULL
     AND NEW.last_run_event_id IS DISTINCT FROM OLD.last_run_event_id
     AND NEW.due_at IS NOT DISTINCT FROM OLD.due_at
     AND NEW.due_booking_lifecycle_revision
           IS NOT DISTINCT FROM OLD.due_booking_lifecycle_revision
     AND (
       SELECT count(*) = 1
         FROM flow_run_events event
        WHERE event.id = NEW.last_run_event_id
          AND event.owner_user_id = NEW.owner_user_id
          AND event.flow_run_id = NEW.flow_run_id
          AND event.event_type = 'work_item_available'
          AND event.node_id = NEW.node_id
          AND event.attempt_id IS NULL
          AND event.command_id IS NULL
          AND event.occurred_at IS NOT DISTINCT FROM NEW.updated_at
          AND event.summary->>'schemaVersion' = 'flow-runtime-trace.v1'
          AND event.summary->>'outcome' = 'available'
          AND event.summary->>'nodeKind' = 'astrologer_work_item'
          AND event.summary->>'reasonCode' = 'FLOW_WORK_ITEM_SNOOZE_ELAPSED'
          AND event.summary->>'resultCode' = 'FLOW_WORK_ITEM_AVAILABLE'
          AND event.summary->>'workItemId' = NEW.id::text
          AND (event.summary->>'fromRevision')::integer = OLD.revision
          AND (event.summary->>'toRevision')::integer = NEW.revision
          AND (event.summary->>'scheduledFor')::timestamptz
                IS NOT DISTINCT FROM OLD.snoozed_until
     ) THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('pending', 'in_progress', 'snoozed')
     AND NEW.status = 'completed'
     AND NEW.completed_by_user_id IS NULL
     AND NEW.last_command_id IS NULL
     AND NEW.last_run_event_id IS NOT NULL
     AND NEW.last_run_event_id IS DISTINCT FROM OLD.last_run_event_id
     AND NEW.due_at IS NOT DISTINCT FROM OLD.due_at
     AND NEW.due_booking_lifecycle_revision
           IS NOT DISTINCT FROM OLD.due_booking_lifecycle_revision
     AND NEW.started_at IS NOT NULL
     AND NEW.completed_at IS NOT NULL
     AND NEW.completed_at IS NOT DISTINCT FROM NEW.updated_at
     AND (
       SELECT count(*) = 1
         FROM flow_run_events event
        WHERE event.id = NEW.last_run_event_id
          AND event.owner_user_id = NEW.owner_user_id
          AND event.flow_run_id = NEW.flow_run_id
          AND event.event_type = 'token_advanced'
          AND event.node_id = NEW.node_id
          AND event.attempt_id IS NULL
          AND event.command_id IS NULL
          AND event.occurred_at IS NOT DISTINCT FROM NEW.updated_at
          AND event.summary->>'schemaVersion' = 'flow-runtime-trace.v1'
          AND event.summary->>'outcome' = 'advanced'
          AND event.summary->>'nodeKind' = 'astrologer_work_item'
          AND event.summary->>'reasonCode' = 'FLOW_BIRTH_PROFILE_RECHECK_READY'
          AND event.summary->>'resultCode' = 'FLOW_TOKEN_ADVANCED'
          AND event.summary->>'sourceHandle' = 'success'
          AND event.summary->>'workItemId' = NEW.id::text
          AND (event.summary->>'fromRevision')::integer = OLD.revision
          AND (event.summary->>'toRevision')::integer = NEW.revision
     ) THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('pending', 'in_progress', 'snoozed')
     AND NEW.status = 'canceled'
     AND NEW.last_command_id IS NULL
     AND NEW.last_run_event_id IS NOT NULL
     AND NEW.last_run_event_id IS DISTINCT FROM OLD.last_run_event_id
     AND NEW.due_at IS NOT DISTINCT FROM OLD.due_at
     AND NEW.due_booking_lifecycle_revision
           IS NOT DISTINCT FROM OLD.due_booking_lifecycle_revision
     AND (
       SELECT count(*) = 1
         FROM flow_run_events event
        WHERE event.id = NEW.last_run_event_id
          AND event.owner_user_id = NEW.owner_user_id
          AND event.flow_run_id = NEW.flow_run_id
          AND event.event_type = 'run_canceled'
          AND event.node_id = NEW.node_id
          AND event.command_id IS NULL
          AND event.booking_lifecycle_event_id IS NOT NULL
          AND event.occurred_at IS NOT DISTINCT FROM NEW.updated_at
          AND event.occurred_at IS NOT DISTINCT FROM NEW.canceled_at
          AND event.summary->>'schemaVersion' = 'flow-runtime-trace.v1'
          AND event.summary->>'outcome' = 'canceled'
          AND event.summary->>'nodeKind' = 'astrologer_work_item'
          AND event.summary->>'reasonCode' = 'FLOW_BOOKING_CANCELED'
          AND event.summary->>'resultCode' = 'FLOW_RUN_CANCELED'
     ) THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('pending', 'in_progress', 'snoozed')
     AND NEW.status IN ('pending', 'in_progress', 'snoozed')
     AND OLD.due_policy_kind = 'before_booking_start'
     AND OLD.due_booking_lifecycle_revision IS NOT NULL
     AND NEW.due_booking_lifecycle_revision = OLD.due_booking_lifecycle_revision + 1
     AND NEW.last_command_id IS NULL
     AND NEW.last_run_event_id IS NOT NULL
     AND NEW.last_run_event_id IS DISTINCT FROM OLD.last_run_event_id
     AND ROW(
       NEW.result_summary, NEW.started_at, NEW.completed_at,
       NEW.completed_by_user_id, NEW.expired_at, NEW.canceled_at
     ) IS NOT DISTINCT FROM ROW(
       OLD.result_summary, OLD.started_at, OLD.completed_at,
       OLD.completed_by_user_id, OLD.expired_at, OLD.canceled_at
     )
     AND (
       (
         NEW.status = OLD.status
         AND NEW.available_at IS NOT DISTINCT FROM OLD.available_at
         AND NEW.snoozed_until IS NOT DISTINCT FROM OLD.snoozed_until
       ) OR (
         OLD.status = 'snoozed'
         AND NEW.status = 'snoozed'
         AND NEW.snoozed_until IS NOT NULL
         AND NEW.snoozed_until = NEW.due_at
         AND NEW.available_at = NEW.snoozed_until
         AND NEW.snoozed_until < OLD.snoozed_until
       ) OR (
         OLD.status = 'snoozed'
         AND NEW.status = 'pending'
         AND NEW.snoozed_until IS NULL
         AND NEW.available_at = NEW.updated_at
         AND LEAST(OLD.snoozed_until, NEW.due_at) <= NEW.updated_at
       )
     )
     AND (
       SELECT count(*) = 1
         FROM flow_run_events event
        WHERE event.id = NEW.last_run_event_id
          AND event.owner_user_id = NEW.owner_user_id
          AND event.flow_run_id = NEW.flow_run_id
          AND event.event_type = 'booking_rescheduled'
          AND event.node_id = NEW.node_id
          AND event.attempt_id IS NULL
          AND event.command_id IS NULL
          AND event.booking_lifecycle_event_id IS NOT NULL
          AND event.occurred_at IS NOT DISTINCT FROM NEW.updated_at
          AND event.summary->>'schemaVersion' = 'flow-runtime-trace.v1'
          AND event.summary->>'outcome' = 'rescheduled'
          AND event.summary->>'nodeKind' = 'astrologer_work_item'
          AND event.summary->>'reasonCode' = 'FLOW_BOOKING_RESCHEDULED'
          AND event.summary->>'resultCode' = 'FLOW_BOOKING_SCHEDULE_UPDATED'
          AND event.summary->>'workItemId' = NEW.id::text
          AND (event.summary->>'bookingLifecycleRevision')::integer =
                NEW.due_booking_lifecycle_revision
          AND (event.summary->>'fromRevision')::integer = OLD.revision
          AND (event.summary->>'toRevision')::integer = NEW.revision
          AND event.summary->>'previousWorkItemStatus' = OLD.status
          AND event.summary->>'currentWorkItemStatus' = NEW.status
          AND (event.summary->>'previousDueAt')::timestamptz
                IS NOT DISTINCT FROM OLD.due_at
          AND (event.summary->>'currentDueAt')::timestamptz
                IS NOT DISTINCT FROM NEW.due_at
          AND (event.summary->>'previousSnoozedUntil')::timestamptz
                IS NOT DISTINCT FROM OLD.snoozed_until
          AND (event.summary->>'currentSnoozedUntil')::timestamptz
                IS NOT DISTINCT FROM NEW.snoozed_until
          AND event.summary->>'snoozeAdjustment' = CASE
            WHEN OLD.status = 'snoozed' AND NEW.status = 'pending' THEN 'woken'
            WHEN OLD.snoozed_until IS DISTINCT FROM NEW.snoozed_until THEN 'shortened'
            ELSE 'unchanged'
          END
     ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'flow work item permits one provenance-backed lifecycle transition'
    USING ERRCODE = '55000', CONSTRAINT = 'flow_work_items_transition_guard';

END;
$flow_work_item_guard$;
--> statement-breakpoint
CREATE TRIGGER "flow_work_items_transition_guard"
BEFORE UPDATE OR DELETE ON flow_work_items
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_flow_work_item_mutation();
--> statement-breakpoint
CREATE TRIGGER "flow_work_items_truncate_guard"
BEFORE TRUNCATE ON flow_work_items
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_flow_work_item_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_assert_flow_work_item_command()
RETURNS trigger
LANGUAGE plpgsql
AS $flow_work_item_command_guard$
DECLARE
  checked_command_id uuid;
  checked_run_event_id uuid;
  command_row flow_runtime_commands%ROWTYPE;
  work_item_row flow_work_items%ROWTYPE;
  outcome_row flow_runtime_command_outcomes%ROWTYPE;
  event_row flow_run_events%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'flow_run_events' THEN
    IF TG_OP <> 'INSERT'
       OR NOT (
         NEW.event_type = 'work_item_available'
         OR NEW.event_type = 'booking_rescheduled'
         OR (NEW.event_type = 'run_canceled' AND NEW.booking_lifecycle_event_id IS NOT NULL)
         OR (
           NEW.event_type = 'token_advanced'
           AND NEW.command_id IS NULL
           AND NEW.summary->>'reasonCode' = 'FLOW_BIRTH_PROFILE_RECHECK_READY'
         )
       ) THEN
      RETURN NULL;
    END IF;
    checked_run_event_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'flow_work_items' THEN
    IF TG_OP <> 'DELETE' AND NEW.last_run_event_id IS NOT NULL THEN
      checked_run_event_id := NEW.last_run_event_id;
    ELSIF TG_OP = 'DELETE' THEN
      checked_command_id := OLD.last_command_id;
    ELSE
      checked_command_id := NEW.last_command_id;
    END IF;
    IF checked_command_id IS NULL THEN
      IF checked_run_event_id IS NULL THEN
        RETURN NULL;
      END IF;
    END IF;
  ELSE
    checked_command_id := COALESCE(NEW.id, OLD.id);
  END IF;

  IF checked_run_event_id IS NOT NULL THEN
    SELECT * INTO event_row
      FROM flow_run_events
     WHERE id = checked_run_event_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'work-item service transition requires its durable run event'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_work_items_event_consistency';
    END IF;

    SELECT * INTO work_item_row
      FROM flow_work_items
     WHERE last_run_event_id = checked_run_event_id;
    IF NOT FOUND THEN
      IF event_row.event_type = 'booking_rescheduled'
         AND event_row.booking_lifecycle_event_id IS NOT NULL
         AND event_row.summary->'workItemId' = 'null'::jsonb
         AND NOT EXISTS (
           SELECT 1
             FROM flow_work_items item
            WHERE item.owner_user_id = event_row.owner_user_id
              AND item.flow_run_id = event_row.flow_run_id
              AND item.status IN ('pending', 'in_progress', 'snoozed')
              AND item.due_policy_kind = 'before_booking_start'
         ) THEN
        RETURN NULL;
      ELSIF event_row.event_type = 'run_canceled'
         AND event_row.booking_lifecycle_event_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
             FROM flow_work_items item
            WHERE item.owner_user_id = event_row.owner_user_id
              AND item.flow_run_id = event_row.flow_run_id
              AND item.status IN ('pending', 'in_progress', 'snoozed')
         ) THEN
        RETURN NULL;
      END IF;
      RAISE EXCEPTION 'work-item service transition requires matching item provenance'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_work_items_event_consistency';
    END IF;

    IF work_item_row.owner_user_id IS DISTINCT FROM event_row.owner_user_id
       OR work_item_row.flow_run_id IS DISTINCT FROM event_row.flow_run_id
       OR work_item_row.node_id IS DISTINCT FROM event_row.node_id
       OR work_item_row.last_command_id IS NOT NULL
       OR event_row.occurred_at IS DISTINCT FROM work_item_row.updated_at
       OR event_row.summary->>'schemaVersion' IS DISTINCT FROM 'flow-runtime-trace.v1' THEN
      RAISE EXCEPTION 'flow work item and service event provenance do not agree'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_work_items_event_consistency';
    END IF;

    IF event_row.event_type = 'work_item_available' AND (
         work_item_row.status IS DISTINCT FROM 'pending'
         OR event_row.attempt_id IS NOT NULL
         OR event_row.command_id IS NOT NULL
         OR event_row.booking_lifecycle_event_id IS NOT NULL
         OR event_row.summary->>'outcome' IS DISTINCT FROM 'available'
         OR event_row.summary->>'nodeKind' IS DISTINCT FROM 'astrologer_work_item'
         OR event_row.summary->>'reasonCode' IS DISTINCT FROM 'FLOW_WORK_ITEM_SNOOZE_ELAPSED'
         OR event_row.summary->>'resultCode' IS DISTINCT FROM 'FLOW_WORK_ITEM_AVAILABLE'
         OR event_row.summary->>'workItemId' IS DISTINCT FROM work_item_row.id::text
         OR (event_row.summary->>'fromRevision')::integer
              IS DISTINCT FROM work_item_row.revision - 1
         OR (event_row.summary->>'toRevision')::integer
              IS DISTINCT FROM work_item_row.revision
         OR (event_row.summary->>'scheduledFor')::timestamptz > event_row.occurred_at
       ) THEN
      RAISE EXCEPTION 'flow work item and service event provenance do not agree'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_work_items_event_consistency';
    ELSIF event_row.event_type = 'run_canceled' AND (
         work_item_row.status IS DISTINCT FROM 'canceled'
         OR work_item_row.canceled_at IS DISTINCT FROM event_row.occurred_at
         OR event_row.command_id IS NOT NULL
         OR event_row.booking_lifecycle_event_id IS NULL
         OR event_row.summary->>'outcome' IS DISTINCT FROM 'canceled'
         OR event_row.summary->>'nodeKind' IS DISTINCT FROM 'astrologer_work_item'
         OR event_row.summary->>'reasonCode' IS DISTINCT FROM 'FLOW_BOOKING_CANCELED'
         OR event_row.summary->>'resultCode' IS DISTINCT FROM 'FLOW_RUN_CANCELED'
       ) THEN
      RAISE EXCEPTION 'flow work item and service event provenance do not agree'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_work_items_event_consistency';
    ELSIF event_row.event_type = 'booking_rescheduled' AND (
         work_item_row.status NOT IN ('pending', 'in_progress', 'snoozed')
         OR work_item_row.due_policy_kind IS DISTINCT FROM 'before_booking_start'
         OR work_item_row.due_booking_lifecycle_revision IS NULL
         OR event_row.attempt_id IS NOT NULL
         OR event_row.command_id IS NOT NULL
         OR event_row.booking_lifecycle_event_id IS NULL
         OR event_row.summary->>'outcome' IS DISTINCT FROM 'rescheduled'
         OR event_row.summary->>'reasonCode' IS DISTINCT FROM 'FLOW_BOOKING_RESCHEDULED'
         OR event_row.summary->>'resultCode' IS DISTINCT FROM 'FLOW_BOOKING_SCHEDULE_UPDATED'
         OR event_row.summary->>'workItemId' IS DISTINCT FROM work_item_row.id::text
         OR (event_row.summary->>'bookingLifecycleRevision')::integer
              IS DISTINCT FROM work_item_row.due_booking_lifecycle_revision
         OR (event_row.summary->>'fromRevision')::integer
              IS DISTINCT FROM work_item_row.revision - 1
         OR (event_row.summary->>'toRevision')::integer
              IS DISTINCT FROM work_item_row.revision
         OR event_row.summary->>'currentWorkItemStatus'
              IS DISTINCT FROM work_item_row.status
         OR (event_row.summary->>'currentDueAt')::timestamptz
              IS DISTINCT FROM work_item_row.due_at
         OR (event_row.summary->>'currentSnoozedUntil')::timestamptz
              IS DISTINCT FROM work_item_row.snoozed_until
       ) THEN
      RAISE EXCEPTION 'flow work item and Booking reschedule provenance do not agree'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_work_items_event_consistency';
    ELSIF event_row.event_type = 'token_advanced' AND (
         work_item_row.status IS DISTINCT FROM 'completed'
         OR work_item_row.completed_by_user_id IS NOT NULL
         OR work_item_row.completed_at IS DISTINCT FROM event_row.occurred_at
         OR event_row.attempt_id IS NOT NULL
         OR event_row.command_id IS NOT NULL
         OR event_row.summary->>'outcome' IS DISTINCT FROM 'advanced'
         OR event_row.summary->>'nodeKind' IS DISTINCT FROM 'astrologer_work_item'
         OR event_row.summary->>'reasonCode' IS DISTINCT FROM 'FLOW_BIRTH_PROFILE_RECHECK_READY'
         OR event_row.summary->>'resultCode' IS DISTINCT FROM 'FLOW_TOKEN_ADVANCED'
         OR event_row.summary->>'sourceHandle' IS DISTINCT FROM 'success'
         OR event_row.summary->>'workItemId' IS DISTINCT FROM work_item_row.id::text
         OR (event_row.summary->>'fromRevision')::integer
              IS DISTINCT FROM work_item_row.revision - 1
         OR (event_row.summary->>'toRevision')::integer
              IS DISTINCT FROM work_item_row.revision
       ) THEN
      RAISE EXCEPTION 'flow work item and birth-profile recheck provenance do not agree'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_work_items_event_consistency';
    ELSIF event_row.event_type NOT IN (
      'work_item_available', 'run_canceled', 'booking_rescheduled', 'token_advanced'
    ) THEN
      RAISE EXCEPTION 'work-item service transition requires a supported durable run event'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_work_items_event_consistency';
    END IF;
    RETURN NULL;
  END IF;

  SELECT * INTO command_row
    FROM flow_runtime_commands
   WHERE id = checked_command_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF command_row.command_scope NOT IN (
    'flows.runtime.cancel.v1',
    'flows.work-items.start.v1',
    'flows.work-items.snooze.v1',
    'flows.work-items.complete.v1'
  ) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO work_item_row
    FROM flow_work_items
   WHERE last_command_id = checked_command_id;

  IF command_row.state = 'failed' THEN
    IF FOUND THEN
      RAISE EXCEPTION 'failed flow command cannot own a work-item transition'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_work_items_command_consistency';
    END IF;
    RETURN NULL;
  END IF;

  IF command_row.state <> 'succeeded' OR NOT FOUND THEN
    IF command_row.command_scope LIKE 'flows.work-items.%' OR FOUND THEN
      RAISE EXCEPTION 'successful work-item transition requires a succeeded command'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_work_items_command_consistency';
    END IF;
    RETURN NULL;
  END IF;

  SELECT * INTO outcome_row
    FROM flow_runtime_command_outcomes
   WHERE command_id = checked_command_id;
  IF NOT FOUND
     OR outcome_row.response_status IS DISTINCT FROM 200
     OR command_row.api_surface IS DISTINCT FROM 'astrologer-api'
     OR command_row.owner_user_id IS DISTINCT FROM work_item_row.owner_user_id
     OR command_row.flow_run_id IS DISTINCT FROM work_item_row.flow_run_id
     OR (
       command_row.command_scope <> 'flows.runtime.cancel.v1'
       AND (
         outcome_row.response_body->'workItem'->>'id' IS DISTINCT FROM work_item_row.id::text
         OR outcome_row.response_body->'workItem'->>'flowRunId' IS DISTINCT FROM work_item_row.flow_run_id::text
         OR outcome_row.response_body->'workItem'->>'status' IS DISTINCT FROM work_item_row.status
         OR outcome_row.response_body->'workItem'->>'revision' IS DISTINCT FROM work_item_row.revision::text
       )
     )
     OR (
       command_row.command_scope = 'flows.runtime.cancel.v1'
       AND (
         command_row.route_template IS DISTINCT FROM '/flow-runs/:runId/cancel'
         OR command_row.resource_id IS DISTINCT FROM work_item_row.flow_run_id
         OR work_item_row.status IS DISTINCT FROM 'canceled'
         OR outcome_row.response_body->'run'->>'id' IS DISTINCT FROM work_item_row.flow_run_id::text
         OR outcome_row.response_body->'run'->>'status' IS DISTINCT FROM 'canceled'
       )
     )
     OR (
       command_row.command_scope = 'flows.work-items.start.v1'
       AND (
         command_row.route_template IS DISTINCT FROM '/flow-work-items/:workItemId/start'
         OR command_row.resource_id IS DISTINCT FROM work_item_row.id
         OR work_item_row.status IS DISTINCT FROM 'in_progress'
       )
     )
     OR (
       command_row.command_scope = 'flows.work-items.snooze.v1'
       AND (
         command_row.route_template IS DISTINCT FROM '/flow-work-items/:workItemId/snooze'
         OR command_row.resource_id IS DISTINCT FROM work_item_row.id
         OR work_item_row.status IS DISTINCT FROM 'snoozed'
       )
     )
     OR (
       command_row.command_scope = 'flows.work-items.complete.v1'
       AND (
         command_row.route_template IS DISTINCT FROM '/flow-work-items/:workItemId/complete'
         OR command_row.resource_id IS DISTINCT FROM work_item_row.id
         OR work_item_row.status IS DISTINCT FROM 'completed'
         OR work_item_row.completed_by_user_id IS DISTINCT FROM command_row.actor_user_id
       )
     ) THEN
    RAISE EXCEPTION 'flow work item and command provenance do not agree'
      USING ERRCODE = '23514', CONSTRAINT = 'flow_work_items_command_consistency';
  END IF;

  RETURN NULL;
END;
$flow_work_item_command_guard$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "flow_work_items_command_consistency"
AFTER INSERT OR UPDATE OR DELETE ON flow_work_items
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_flow_work_item_command();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "flow_runtime_commands_work_item_consistency"
AFTER INSERT OR UPDATE OR DELETE ON flow_runtime_commands
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_flow_work_item_command();`;

export const flowWorkItemEventIntegritySql = `CREATE CONSTRAINT TRIGGER "flow_run_events_work_item_consistency"
AFTER INSERT ON flow_run_events
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_flow_work_item_command();`;

export const flowWorkItemIntegritySql = `${flowWorkItemCoreIntegritySql}
--> statement-breakpoint
${flowWorkItemEventIntegritySql}`;
