import { createHash } from "node:crypto";

import type { Client } from "pg";

import { flowRuntimeCommandEventIntegritySql } from "./augment-flows-baseline";
import {
  flowWorkItemBookingDeadlineSafetyBaselineDdl,
  flowWorkItemSafetyBaselineDdl,
  flowWorkItemWakeSafetyBaselineDdl
} from "./production-baseline-plan";

type CatalogFingerprint = {
  readonly hash: string;
  readonly relations: number;
  readonly columns: number;
  readonly constraints: number;
  readonly indexes: number;
  readonly triggers: number;
  readonly functions: number;
  readonly unvalidatedConstraints: number;
  readonly invalidIndexes: number;
};

export type FlowWorkItemSafetyReconciliationResult = "already_current" | "reconciled";

const workItemSafetyRelations = [
  "flow_runtime_commands",
  "flow_runtime_command_outcomes",
  "flow_work_items"
] as const;

const currentCatalog = {
  hash: "a3eb744ce6f2887364fab14cdfc1ba2d677ee07e43c79c9741561d0bef8acb72",
  relations: 3,
  columns: 50,
  constraints: 35,
  indexes: 13,
  triggers: 9,
  functions: 6,
  unvalidatedConstraints: 0,
  invalidIndexes: 0
} as const satisfies CatalogFingerprint;

const generatedCommandEventPredecessorCatalog = {
  hash: "5b86692597dc86df2812f929fa577737634f9e7b570a6438528b3670beb340c1",
  relations: 3,
  columns: 50,
  constraints: 35,
  indexes: 13,
  triggers: 8,
  functions: 5,
  unvalidatedConstraints: 0,
  invalidIndexes: 0
} as const satisfies CatalogFingerprint;

const bookingDeadlinePredecessorCatalog = {
  hash: "80c1732402d1c0a1fe3c4d4b70e3d0a9c824a979e3ef4c5fe9ef942453a590f2",
  relations: 3,
  columns: 47,
  constraints: 34,
  indexes: 13,
  triggers: 9,
  functions: 6,
  unvalidatedConstraints: 0,
  invalidIndexes: 0
} as const satisfies CatalogFingerprint;

const wakePredecessorCatalog = {
  hash: "b9ae55baa0b61d09e8338f3f1a579781cee7afe3cb5d562a27c5a984709948e9",
  relations: 3,
  columns: 46,
  constraints: 32,
  indexes: 12,
  triggers: 9,
  functions: 6,
  unvalidatedConstraints: 0,
  invalidIndexes: 0
} as const satisfies CatalogFingerprint;

const commandEventPredecessorCatalog = {
  hash: "427252a8a879509008a06c8ff3e81ea87edadbae90a07fb2999274030e6f3580",
  relations: 3,
  columns: 46,
  constraints: 32,
  indexes: 12,
  triggers: 8,
  functions: 5,
  unvalidatedConstraints: 0,
  invalidIndexes: 0
} as const satisfies CatalogFingerprint;

const wakeCommandEventPredecessorCatalog = {
  hash: "2c523bae2167898edbf49be955574a144bcea5309b5a3432b86ec1d2152f2d77",
  relations: 3,
  columns: 47,
  constraints: 34,
  indexes: 13,
  triggers: 8,
  functions: 5,
  unvalidatedConstraints: 0,
  invalidIndexes: 0
} as const satisfies CatalogFingerprint;

const predecessorCatalog = {
  hash: "9bff670421add861ce546bba9de0d2137e84e55ebbe631516cc3d540a939d87f",
  relations: 2,
  columns: 18,
  constraints: 14,
  indexes: 7,
  triggers: 4,
  functions: 3,
  unvalidatedConstraints: 0,
  invalidIndexes: 0
} as const satisfies CatalogFingerprint;

export async function reconcileFlowWorkItemSafety(
  client: Client
): Promise<FlowWorkItemSafetyReconciliationResult> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('elevenhouse:flows:work-items:v1'))");
  const workItemsExist = await relationExists(client, "public.flow_work_items");
  await client.query(
    workItemsExist
      ? "LOCK TABLE flow_runtime_commands, flow_runtime_command_outcomes, flow_work_items, flow_run_events IN ACCESS EXCLUSIVE MODE"
      : "LOCK TABLE flow_runtime_commands, flow_runtime_command_outcomes, flow_run_events IN ACCESS EXCLUSIVE MODE"
  );

  const before = await readCatalog(client);
  if (matchesCatalog(before, currentCatalog)) {
    await assertCurrentData(client, true);
    return "already_current";
  }
  if (matchesCatalog(before, generatedCommandEventPredecessorCatalog)) {
    await assertRequiredCommandEvents(client);
    await installCurrentCommandEventIntegrity(client);
  } else if (matchesCatalog(before, bookingDeadlinePredecessorCatalog)) {
    await assertLosslesslyReconcilableBookingDeadlineData(client);
    await installCurrentCommandEventIntegrity(client);
    await client.query(flowWorkItemBookingDeadlineSafetyBaselineDdl);
  } else if (matchesCatalog(before, wakeCommandEventPredecessorCatalog)) {
    await assertRequiredCommandEvents(client);
    await installCurrentCommandEventIntegrity(client);
    await assertLosslesslyReconcilableBookingDeadlineData(client);
    await client.query(flowWorkItemBookingDeadlineSafetyBaselineDdl);
  } else if (matchesCatalog(before, wakePredecessorCatalog)) {
    await assertLosslesslyReconcilableWakeData(client);
    await client.query(flowWorkItemWakeSafetyBaselineDdl);
    await assertLosslesslyReconcilableBookingDeadlineData(client);
    await installCurrentCommandEventIntegrity(client);
    await client.query(flowWorkItemBookingDeadlineSafetyBaselineDdl);
  } else if (matchesCatalog(before, commandEventPredecessorCatalog)) {
    await assertRequiredCommandEvents(client);
    await installCurrentCommandEventIntegrity(client);
    await assertLosslesslyReconcilableWakeData(client);
    await client.query(flowWorkItemWakeSafetyBaselineDdl);
    await assertLosslesslyReconcilableBookingDeadlineData(client);
    await client.query(flowWorkItemBookingDeadlineSafetyBaselineDdl);
  } else if (matchesCatalog(before, predecessorCatalog)) {
    await assertLosslesslyReconcilablePredecessorData(client);
    await client.query(flowWorkItemSafetyBaselineDdl);
    await assertLosslesslyReconcilableBookingDeadlineData(client);
    await client.query(flowWorkItemBookingDeadlineSafetyBaselineDdl);
  } else {
    throw driftError(before);
  }

  const after = await readCatalog(client);
  if (!matchesCatalog(after, currentCatalog)) {
    throw new Error(
      `Flow work-item safety reconciliation produced a drifted catalog; expected=${formatCatalog(
        currentCatalog
      )} actual=${formatCatalog(after)}`
    );
  }
  await assertCurrentData(client, true);
  return "reconciled";
}

async function installCurrentCommandEventIntegrity(client: Client): Promise<void> {
  await client.query(
    "DROP TRIGGER IF EXISTS flow_runtime_command_event_consistency ON flow_runtime_commands"
  );
  await client.query(flowRuntimeCommandEventIntegritySql);
}

async function assertLosslesslyReconcilableBookingDeadlineData(client: Client): Promise<void> {
  const result = await client.query<{ existing_count: string }>(
    "SELECT count(*)::text AS existing_count FROM flow_work_items"
  );
  if (result.rows[0]?.existing_count !== "0") {
    throw new Error(
      `Pre-deadline Flow work-item data is not losslessly reconcilable; existing_count=${
        result.rows[0]?.existing_count ?? "unknown"
      }`
    );
  }
}

async function assertLosslesslyReconcilableWakeData(client: Client): Promise<void> {
  const result = await client.query<{ invalid_count: string }>(`
    SELECT count(*)::text AS invalid_count
      FROM flow_work_items
     WHERE NOT (
       (revision = 1 AND status = 'pending' AND last_command_id IS NULL)
       OR (revision > 1 AND last_command_id IS NOT NULL)
     )
  `);
  if (result.rows[0]?.invalid_count !== "0") {
    throw new Error(
      `Approved pre-wake Flow work-item data is not losslessly reconcilable; invalid_count=${
        result.rows[0]?.invalid_count ?? "unknown"
      }`
    );
  }
}

export async function assertFlowWorkItemSafety(client: Client): Promise<void> {
  const actual = await readCatalog(client);
  if (!matchesCatalog(actual, currentCatalog)) throw driftError(actual);
  await assertCurrentData(client);
}

async function assertLosslesslyReconcilablePredecessorData(client: Client): Promise<void> {
  const result = await client.query<{ invalid_count: string }>(`
    SELECT (
      (SELECT count(*)
         FROM flow_runtime_commands
        WHERE api_surface <> 'astrologer-api'
           OR route_template <> '/flow-runs/:runId/cancel'
           OR command_scope <> 'flows.runtime.cancel.v1')
      +
      (SELECT count(*)
         FROM flow_execution_tokens
        WHERE state = 'waiting_work_item')
      +
      (SELECT count(*)
         FROM flow_runtime_commands command
         LEFT JOIN flow_runtime_command_outcomes outcome ON outcome.command_id = command.id
        WHERE (command.state = 'processing' AND outcome.command_id IS NOT NULL)
           OR (command.state = 'succeeded' AND outcome.command_id IS NOT NULL
             AND outcome.response_status <> 200)
           OR (command.state = 'failed' AND outcome.command_id IS NOT NULL
             AND outcome.response_status NOT IN (404, 409))
           OR (outcome.command_id IS NOT NULL AND (
             outcome.created_at < command.created_at
             OR outcome.created_at > command.replay_until
             OR outcome.created_at IS DISTINCT FROM command.completed_at
           )))
      +
      (SELECT count(*)
         FROM flow_runtime_commands command
        WHERE command.state = 'succeeded'
          AND command.command_scope = 'flows.runtime.cancel.v1'
          AND (
            SELECT count(*)
              FROM flow_run_events event
             WHERE event.command_id = command.id
               AND event.owner_user_id = command.owner_user_id
               AND event.flow_run_id = command.resource_id
               AND event.event_type = 'run_canceled'
               AND event.summary->>'reasonCode' = 'FLOW_RUN_CANCELED_BY_OWNER'
          ) <> 1)
    )::text AS invalid_count
  `);
  if (result.rows[0]?.invalid_count !== "0") {
    throw new Error(
      `Approved predecessor Flow work-item data is not losslessly reconcilable; invalid_count=${
        result.rows[0]?.invalid_count ?? "unknown"
      }`
    );
  }
}

async function assertCurrentData(
  client: Client,
  allowMissingActivationIdentity = false
): Promise<void> {
  await assertRequiredCommandEvents(client);
  const hasActivationIdentity = await columnExists(
    client,
    "public",
    "flow_execution_tokens",
    "node_activation_sequence"
  );
  if (!hasActivationIdentity) {
    if (!allowMissingActivationIdentity) {
      throw new Error(
        "Current Flow work-item data cannot be attested because flow_execution_tokens.node_activation_sequence is missing"
      );
    }
    const transitional = await client.query<{ invalid_count: string }>(`
      SELECT (
        (SELECT count(*)
           FROM flow_runtime_commands
          WHERE command_scope = 'flows.runtime.cancel.v1'
            AND flow_run_id IS DISTINCT FROM resource_id)
        + (SELECT count(*) FROM flow_work_items)
        + (SELECT count(*) FROM flow_execution_tokens WHERE state = 'waiting_work_item')
        + (SELECT count(*)
             FROM flow_runtime_commands
            WHERE command_scope LIKE 'flows.work-items.%')
      )::text AS invalid_count
    `);
    if (transitional.rows[0]?.invalid_count !== "0") {
      throw new Error(
        `Transitional Flow work-item data is not losslessly reconcilable; invalid_count=${
          transitional.rows[0]?.invalid_count ?? "unknown"
        }`
      );
    }
    return;
  }

  const result = await client.query<{ invalid_count: string }>(`
    SELECT (
      (SELECT count(*)
         FROM flow_runtime_commands
        WHERE command_scope = 'flows.runtime.cancel.v1'
          AND flow_run_id IS DISTINCT FROM resource_id)
      +
      (SELECT count(*)
         FROM flow_work_items item
         LEFT JOIN flow_execution_tokens token
           ON token.id = item.token_id
          AND token.flow_run_id = item.flow_run_id
          AND token.owner_user_id = item.owner_user_id
        WHERE token.id IS NULL
           OR token.node_activation_sequence IS DISTINCT FROM item.node_activation_sequence)
      +
      (SELECT count(*)
         FROM flow_execution_tokens token
         LEFT JOIN flow_work_items item
           ON item.token_id = token.id
          AND item.node_activation_sequence = token.node_activation_sequence
        WHERE token.state = 'waiting_work_item'
          AND item.id IS NULL)
      +
      (SELECT count(*)
         FROM flow_work_items item
        WHERE NOT (
          (item.revision = 1 AND item.status = 'pending'
            AND item.last_command_id IS NULL AND item.last_run_event_id IS NULL)
          OR (item.revision > 1
            AND (item.last_command_id IS NULL) <> (item.last_run_event_id IS NULL))
        ))
      +
      (SELECT count(*)
         FROM flow_work_items item
         LEFT JOIN flow_run_events event ON event.id = item.last_run_event_id
        WHERE item.last_run_event_id IS NOT NULL
          AND (
            event.id IS NULL
            OR event.owner_user_id IS DISTINCT FROM item.owner_user_id
            OR event.flow_run_id IS DISTINCT FROM item.flow_run_id
            OR event.node_id IS DISTINCT FROM item.node_id
            OR event.event_type IS DISTINCT FROM 'work_item_available'
            OR event.attempt_id IS NOT NULL
            OR event.command_id IS NOT NULL
            OR event.occurred_at IS DISTINCT FROM item.updated_at
            OR item.status IS DISTINCT FROM 'pending'
            OR item.last_command_id IS NOT NULL
            OR event.summary->>'schemaVersion' IS DISTINCT FROM 'flow-runtime-trace.v1'
            OR event.summary->>'outcome' IS DISTINCT FROM 'available'
            OR event.summary->>'nodeKind' IS DISTINCT FROM 'astrologer_work_item'
            OR event.summary->>'reasonCode' IS DISTINCT FROM 'FLOW_WORK_ITEM_SNOOZE_ELAPSED'
            OR event.summary->>'resultCode' IS DISTINCT FROM 'FLOW_WORK_ITEM_AVAILABLE'
            OR event.summary->>'workItemId' IS DISTINCT FROM item.id::text
            OR (event.summary->>'fromRevision')::integer IS DISTINCT FROM item.revision - 1
            OR (event.summary->>'toRevision')::integer IS DISTINCT FROM item.revision
            OR (event.summary->>'scheduledFor')::timestamptz > event.occurred_at
          ))
      +
      (SELECT count(*)
         FROM flow_run_events event
         LEFT JOIN flow_work_items item ON item.last_run_event_id = event.id
        WHERE event.event_type = 'work_item_available'
          AND item.id IS NULL)
    )::text AS invalid_count
  `);
  if (result.rows[0]?.invalid_count !== "0") {
    throw new Error(
      `Current Flow work-item data drifted; invalid_count=${
        result.rows[0]?.invalid_count ?? "unknown"
      }`
    );
  }
}

async function assertRequiredCommandEvents(client: Client): Promise<void> {
  const result = await client.query<{ invalid_count: string }>(`
    SELECT count(*)::text AS invalid_count
      FROM flow_runtime_commands command
     WHERE command.state = 'succeeded'
       AND command.command_scope IN (
         'flows.runtime.cancel.v1', 'flows.work-items.complete.v1'
       )
       AND (
         SELECT count(*)
           FROM flow_run_events event
          WHERE event.command_id = command.id
            AND event.owner_user_id = command.owner_user_id
            AND event.flow_run_id = command.flow_run_id
            AND (
              (command.command_scope = 'flows.runtime.cancel.v1'
                AND event.event_type = 'run_canceled'
                AND event.summary->>'reasonCode' = 'FLOW_RUN_CANCELED_BY_OWNER')
              OR (command.command_scope = 'flows.work-items.complete.v1'
                AND event.event_type = 'token_advanced'
                AND event.summary->>'reasonCode' = 'FLOW_WORK_ITEM_COMPLETED')
            )
       ) <> 1
       AND NOT (
         command.command_scope = 'flows.runtime.cancel.v1'
         AND (
           SELECT count(*)
             FROM flow_run_events event
            WHERE event.command_id = command.id
              AND event.owner_user_id = command.owner_user_id
              AND event.flow_run_id = command.flow_run_id
         ) = 0
         AND (
           SELECT count(*)
             FROM flow_runs run
             JOIN flow_execution_tokens token
               ON token.flow_run_id = run.id
              AND token.owner_user_id = run.owner_user_id
             JOIN flow_run_events event
               ON event.flow_run_id = run.id
              AND event.owner_user_id = run.owner_user_id
              AND event.sequence = run.trace_sequence
             JOIN flow_runtime_commands source_command
               ON source_command.id = event.command_id
              AND source_command.flow_run_id = run.id
              AND source_command.owner_user_id = run.owner_user_id
             JOIN flow_runtime_command_outcomes current_outcome
               ON current_outcome.command_id = command.id
            WHERE run.id = command.flow_run_id
              AND run.owner_user_id = command.owner_user_id
              AND run.status = 'canceled'
              AND token.state = 'canceled'
              AND event.event_type = 'run_canceled'
              AND event.summary->>'reasonCode' = 'FLOW_RUN_CANCELED_BY_OWNER'
              AND source_command.api_surface = 'astrologer-api'
              AND source_command.route_template = '/flow-runs/:runId/cancel'
              AND source_command.resource_id = run.id
              AND source_command.command_scope = 'flows.runtime.cancel.v1'
              AND source_command.state = 'succeeded'
              AND current_outcome.response_status = 200
              AND current_outcome.response_body->'run'->>'id' = run.id::text
              AND current_outcome.response_body->'run'->>'status' = 'canceled'
         ) = 1
       )
  `);
  if (result.rows[0]?.invalid_count !== "0") {
    throw new Error(
      `Flow runtime command event provenance drifted; invalid_count=${
        result.rows[0]?.invalid_count ?? "unknown"
      }`
    );
  }
}

async function relationExists(client: Client, qualifiedName: string): Promise<boolean> {
  const result = await client.query<{ relation: string | null }>(
    "SELECT to_regclass($1)::text AS relation",
    [qualifiedName]
  );
  return result.rows[0]?.relation !== null;
}

async function columnExists(
  client: Client,
  schemaName: string,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
     ) AS present`,
    [schemaName, tableName, columnName]
  );
  return result.rows[0]?.present === true;
}

async function readCatalog(client: Client): Promise<CatalogFingerprint> {
  const relations = await client.query<{
    relation_name: string;
    relation_kind: string;
    persistence: string;
    row_security: boolean;
    force_row_security: boolean;
    access_method: string;
  }>(
    `SELECT relation.relname AS relation_name,
            relation.relkind AS relation_kind,
            relation.relpersistence AS persistence,
            relation.relrowsecurity AS row_security,
            relation.relforcerowsecurity AS force_row_security,
            COALESCE(access_method.amname, '') AS access_method
       FROM pg_class AS relation
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       LEFT JOIN pg_am AS access_method ON access_method.oid = relation.relam
      WHERE namespace.nspname = 'public'
        AND relation.relname = ANY($1::text[])`,
    [workItemSafetyRelations]
  );
  const columns = await client.query<{
    table_name: string;
    column_name: string;
    udt_name: string;
    is_nullable: string;
    column_default: string | null;
  }>(
    `SELECT table_name, column_name, udt_name, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])`,
    [workItemSafetyRelations]
  );
  const constraints = await client.query<{
    relation_name: string;
    object_name: string;
    constraint_type: string;
    definition: string;
    validated: boolean;
  }>(
    `SELECT relation.relname AS relation_name,
            constraint_record.conname AS object_name,
            constraint_record.contype AS constraint_type,
            pg_get_constraintdef(constraint_record.oid, false) AS definition,
            constraint_record.convalidated AS validated
       FROM pg_constraint AS constraint_record
       JOIN pg_class AS relation ON relation.oid = constraint_record.conrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = ANY($1::text[])
        AND constraint_record.contype <> 't'`,
    [workItemSafetyRelations]
  );
  const indexes = await client.query<{
    relation_name: string;
    object_name: string;
    definition: string;
    valid: boolean;
    ready: boolean;
  }>(
    `SELECT index_catalog.tablename AS relation_name,
            index_catalog.indexname AS object_name,
            index_catalog.indexdef AS definition,
            index_record.indisvalid AS valid,
            index_record.indisready AS ready
       FROM pg_indexes AS index_catalog
       JOIN pg_class AS relation ON relation.relname = index_catalog.tablename
       JOIN pg_namespace AS namespace
         ON namespace.oid = relation.relnamespace
        AND namespace.nspname = index_catalog.schemaname
       JOIN pg_class AS index_relation
         ON index_relation.relname = index_catalog.indexname
        AND index_relation.relnamespace = namespace.oid
       JOIN pg_index AS index_record
         ON index_record.indexrelid = index_relation.oid
        AND index_record.indrelid = relation.oid
      WHERE index_catalog.schemaname = 'public'
        AND index_catalog.tablename = ANY($1::text[])`,
    [workItemSafetyRelations]
  );
  const triggers = await client.query<{
    relation_name: string;
    object_name: string;
    definition: string;
    enabled: string;
  }>(
    `SELECT relation.relname AS relation_name,
            trigger_record.tgname AS object_name,
            pg_get_triggerdef(trigger_record.oid, false) AS definition,
            trigger_record.tgenabled AS enabled
       FROM pg_trigger AS trigger_record
       JOIN pg_class AS relation ON relation.oid = trigger_record.tgrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = ANY($1::text[])
        AND NOT trigger_record.tgisinternal`,
    [workItemSafetyRelations]
  );
  const functions = await client.query<{
    function_schema: string;
    function_name: string;
    identity_arguments: string;
    result_type: string;
    definition: string;
    language: string;
    owner_name: string;
    security_definer: boolean;
    volatility: string;
    configuration: string;
  }>(
    `SELECT DISTINCT namespace.nspname AS function_schema,
            procedure.proname AS function_name,
            pg_get_function_identity_arguments(procedure.oid) AS identity_arguments,
            pg_get_function_result(procedure.oid) AS result_type,
            pg_get_functiondef(procedure.oid) AS definition,
            language.lanname AS language,
            pg_get_userbyid(procedure.proowner) AS owner_name,
            procedure.prosecdef AS security_definer,
            procedure.provolatile AS volatility,
            COALESCE(array_to_string(procedure.proconfig, E'\n'), '') AS configuration
       FROM pg_trigger AS trigger_record
       JOIN pg_class AS relation ON relation.oid = trigger_record.tgrelid
       JOIN pg_namespace AS relation_namespace ON relation_namespace.oid = relation.relnamespace
       JOIN pg_proc AS procedure ON procedure.oid = trigger_record.tgfoid
       JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
       JOIN pg_language AS language ON language.oid = procedure.prolang
      WHERE relation_namespace.nspname = 'public'
        AND relation.relname = ANY($1::text[])
        AND NOT trigger_record.tgisinternal`,
    [workItemSafetyRelations]
  );

  const payload = {
    relations: relations.rows
      .map(
        (row) =>
          `${row.relation_name}|kind=${row.relation_kind}|persistence=${row.persistence}|rowSecurity=${row.row_security}|forceRowSecurity=${row.force_row_security}|accessMethod=${row.access_method}`
      )
      .sort(),
    columns: columns.rows
      .map(
        (row) =>
          `${row.table_name}|${row.column_name}|${row.udt_name}|${row.is_nullable}|${normalizeCatalogDefinition(
            row.column_default ?? ""
          )}`
      )
      .sort(),
    constraints: constraints.rows
      .map(
        (row) =>
          `${row.relation_name}|${row.object_name}|${row.constraint_type}|${normalizeCatalogDefinition(
            row.definition
          )}|validated=${row.validated}`
      )
      .sort(),
    indexes: indexes.rows
      .map(
        (row) =>
          `${row.relation_name}|${row.object_name}|${normalizeCatalogDefinition(
            row.definition
          )}|valid=${row.valid}|ready=${row.ready}`
      )
      .sort(),
    triggers: triggers.rows
      .map(
        (row) =>
          `${row.relation_name}|${row.object_name}|${normalizeCatalogDefinition(
            row.definition
          )}|enabled=${row.enabled}`
      )
      .sort(),
    functions: functions.rows
      .map(
        (row) =>
          `${row.function_schema}|${row.function_name}|${normalizeCatalogDefinition(
            row.identity_arguments
          )}|result=${normalizeCatalogDefinition(row.result_type)}|definition=${normalizeCatalogDefinition(
            row.definition
          )}|language=${row.language}|owner=${row.owner_name}|securityDefiner=${
            row.security_definer
          }|volatility=${row.volatility}|configuration=${normalizeCatalogDefinition(
            row.configuration
          )}`
      )
      .sort()
  };

  return {
    hash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    relations: payload.relations.length,
    columns: payload.columns.length,
    constraints: payload.constraints.length,
    indexes: payload.indexes.length,
    triggers: payload.triggers.length,
    functions: payload.functions.length,
    unvalidatedConstraints: constraints.rows.filter((row) => !row.validated).length,
    invalidIndexes: indexes.rows.filter((row) => !row.valid || !row.ready).length
  };
}

function matchesCatalog(actual: CatalogFingerprint, expected: CatalogFingerprint): boolean {
  return (
    actual.hash === expected.hash &&
    actual.relations === expected.relations &&
    actual.columns === expected.columns &&
    actual.constraints === expected.constraints &&
    actual.indexes === expected.indexes &&
    actual.triggers === expected.triggers &&
    actual.functions === expected.functions &&
    actual.unvalidatedConstraints === expected.unvalidatedConstraints &&
    actual.invalidIndexes === expected.invalidIndexes
  );
}

function driftError(actual: CatalogFingerprint): Error {
  return new Error(
    `Refusing to reconcile a partial or drifted Flow work-item safety catalog: ${formatCatalog(
      actual
    )}`
  );
}

function formatCatalog(value: CatalogFingerprint): string {
  return `${value.hash}[relations=${value.relations},columns=${value.columns},constraints=${
    value.constraints
  },indexes=${value.indexes},triggers=${value.triggers},functions=${
    value.functions
  },unvalidatedConstraints=${value.unvalidatedConstraints},invalidIndexes=${
    value.invalidIndexes
  }]`;
}

function normalizeCatalogDefinition(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
