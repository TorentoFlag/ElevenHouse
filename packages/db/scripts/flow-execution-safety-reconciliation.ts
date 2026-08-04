import { createHash } from "node:crypto";

import type { Client } from "pg";

import {
  flowExecutionAtomicAdvanceBaselineDdl,
  flowExecutionManifestV2SafetyBaselineDdl,
  flowExecutionRetrySafetyBaselineDdl
} from "./production-baseline-plan";

type FlowExecutionSafetyCatalogFingerprint = {
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

export type FlowExecutionSafetyReconciliationResult = "already_current" | "reconciled";

const executionSafetyRelations = [
  "flow_execution_tokens",
  "flow_execution_attempts",
  "flow_run_events"
] as const;

const predecessorExecutionSafetyCatalog = {
  hash: "44c71eab17fca7a598255bcb9c7e1a7f9e158f881e0f746ec7a5ade27f476bd3",
  relations: 3,
  columns: 45,
  constraints: 38,
  indexes: 14,
  triggers: 5,
  functions: 2,
  unvalidatedConstraints: 0,
  invalidIndexes: 0
} as const satisfies FlowExecutionSafetyCatalogFingerprint;

const retrySafetyExecutionSafetyCatalog = {
  hash: "4a601ef8e68f0e38538a7f624727c8a0afb499e40160e2eb4914659fd64ee65a",
  relations: 3,
  columns: 52,
  constraints: 44,
  indexes: 15,
  triggers: 5,
  functions: 2,
  unvalidatedConstraints: 0,
  invalidIndexes: 0
} as const satisfies FlowExecutionSafetyCatalogFingerprint;

const atomicAdvanceExecutionSafetyCatalog = {
  hash: "7d3359409f1494e5af82f82e7076df75ec6c98a13af0ea711c2cf84475284439",
  relations: 3,
  columns: 54,
  constraints: 46,
  indexes: 16,
  triggers: 5,
  functions: 2,
  unvalidatedConstraints: 0,
  invalidIndexes: 0
} as const satisfies FlowExecutionSafetyCatalogFingerprint;

const currentExecutionSafetyCatalog = {
  hash: "e93c1ae9afd9ed5df156584856ba98928c9d2714dae0cae2db99e9903d246d28",
  relations: 3,
  columns: 54,
  constraints: 47,
  indexes: 16,
  triggers: 5,
  functions: 2,
  unvalidatedConstraints: 0,
  invalidIndexes: 0
} as const satisfies FlowExecutionSafetyCatalogFingerprint;

export async function reconcileFlowExecutionSafety(
  client: Client
): Promise<FlowExecutionSafetyReconciliationResult> {
  await client.query(
    "LOCK TABLE flow_execution_tokens, flow_execution_attempts, flow_run_events IN ACCESS EXCLUSIVE MODE"
  );
  const locked = await readExecutionSafetyCatalog(client);
  if (matchesExecutionSafetyCatalog(locked, currentExecutionSafetyCatalog)) {
    return "already_current";
  }
  if (matchesExecutionSafetyCatalog(locked, atomicAdvanceExecutionSafetyCatalog)) {
    await assertLosslesslyReconcilableAtomicAdvanceData(client);
    await client.query(flowExecutionManifestV2SafetyBaselineDdl);
  } else if (matchesExecutionSafetyCatalog(locked, retrySafetyExecutionSafetyCatalog)) {
    await assertLosslesslyReconcilableAtomicAdvanceData(client);
    await client.query(flowExecutionAtomicAdvanceBaselineDdl);
  } else if (matchesExecutionSafetyCatalog(locked, predecessorExecutionSafetyCatalog)) {
    await assertLosslesslyReconcilablePredecessorData(client);
    await client.query(flowExecutionRetrySafetyBaselineDdl);
    const retrySafetyCatalog = await readExecutionSafetyCatalog(client);
    if (!matchesExecutionSafetyCatalog(retrySafetyCatalog, retrySafetyExecutionSafetyCatalog)) {
      throw new Error(
        `Flow execution retry-safety transition produced a drifted catalog; expected=${formatExecutionSafetyCatalog(
          retrySafetyExecutionSafetyCatalog
        )} actual=${formatExecutionSafetyCatalog(retrySafetyCatalog)}`
      );
    }
    await assertLosslesslyReconcilableAtomicAdvanceData(client);
    await client.query(flowExecutionAtomicAdvanceBaselineDdl);
  } else {
    throw driftError(locked);
  }
  await assertFlowExecutionSafety(client);
  return "reconciled";
}

export async function assertFlowExecutionSafety(client: Client): Promise<void> {
  const actual = await readExecutionSafetyCatalog(client);
  if (matchesExecutionSafetyCatalog(actual, currentExecutionSafetyCatalog)) return;
  throw new Error(
    `Current Flow execution safety catalog drifted; expected=${formatExecutionSafetyCatalog(
      currentExecutionSafetyCatalog
    )} actual=${formatExecutionSafetyCatalog(actual)}`
  );
}

async function assertLosslesslyReconcilablePredecessorData(client: Client): Promise<void> {
  const result = await client.query<{ invalid_count: string }>(`
    SELECT (
      (SELECT count(*)
         FROM flow_execution_tokens
        WHERE state IN ('retry_scheduled', 'failed')
           OR attempt_counter < 0
           OR attempt_counter > 3
           OR fencing_token < attempt_counter
           OR (state IN ('claimed', 'retry_scheduled') AND attempt_counter = 0)
           OR (state IN ('runnable', 'retry_scheduled') AND attempt_counter >= 3)
           OR (state = 'claimed' AND claimed_at > lease_expires_at)
           OR (state = 'claimed' AND claimed_at > updated_at)
           OR (state = 'claimed' AND claimed_at > statement_timestamp())
           OR node_kind NOT IN (
             'booking_confirmed', 'manual_client', 'birth_data_available', 'astrologer_work_item',
             'astrologer_approval', 'completed', 'suppressed', 'failed'
           ))
      +
      (SELECT count(*)
         FROM flow_execution_tokens
        WHERE state = 'completed'
          AND node_kind <> 'completed')
      +
      (SELECT count(*)
         FROM flow_execution_attempts
        WHERE attempt_number NOT BETWEEN 1 AND 3
           OR fencing_token < attempt_number)
    )::text AS invalid_count
  `);
  if (result.rows[0]?.invalid_count !== "0") {
    throw new Error(
      `Approved predecessor Flow execution data is not losslessly reconcilable; invalid_count=${
        result.rows[0]?.invalid_count ?? "unknown"
      }`
    );
  }
}

async function assertLosslesslyReconcilableAtomicAdvanceData(client: Client): Promise<void> {
  const result = await client.query<{ invalid_count: string }>(`
    SELECT (
      (SELECT count(*)
         FROM flow_execution_tokens
        WHERE node_kind NOT IN (
          'birth_data_available', 'astrologer_work_item', 'astrologer_approval',
          'completed', 'suppressed', 'failed'
        ))
      +
      (SELECT count(*)
         FROM flow_execution_tokens
        WHERE state = 'completed'
          AND node_kind <> 'completed')
      +
      (SELECT count(*)
         FROM flow_execution_attempts
        WHERE trace_summary->>'nodeKind' IS NULL
           OR trace_summary->>'nodeKind' NOT IN (
             'birth_data_available', 'astrologer_work_item', 'astrologer_approval',
             'completed', 'suppressed', 'failed'
           )
           OR (
             outcome = 'advanced'
             AND (
               trace_summary->>'targetNodeKind' IS NULL
               OR trace_summary->>'targetNodeKind' NOT IN (
                 'birth_data_available', 'astrologer_work_item', 'astrologer_approval',
                 'completed', 'suppressed', 'failed'
               )
             )
           ))
      +
      (SELECT count(*)
         FROM flow_run_events
        WHERE summary->>'nodeKind' IS NULL
           OR summary->>'nodeKind' NOT IN (
             'birth_data_available', 'astrologer_work_item', 'astrologer_approval',
             'completed', 'suppressed', 'failed'
           )
           OR (
             event_type = 'token_advanced'
             AND (
               summary->>'targetNodeKind' IS NULL
               OR summary->>'targetNodeKind' NOT IN (
                 'birth_data_available', 'astrologer_work_item', 'astrologer_approval',
                 'completed', 'suppressed', 'failed'
               )
             )
           ))
      +
      (SELECT count(*)
         FROM (
           SELECT attempt.id
             FROM flow_execution_attempts AS attempt
             LEFT JOIN flow_run_events AS event ON event.attempt_id = attempt.id
            GROUP BY attempt.id
           HAVING count(event.id) <> 1
         ) AS invalid_attempt_history)
      +
      (SELECT count(*)
         FROM flow_execution_attempts
        WHERE outcome = 'completed'
          AND trace_summary->>'nodeKind' <> 'completed')
      +
      (SELECT count(*)
         FROM flow_run_events
        WHERE event_type = 'run_completed'
          AND summary->>'nodeKind' <> 'completed')
    )::text AS invalid_count
  `);
  if (result.rows[0]?.invalid_count !== "0") {
    throw new Error(
      `Approved retry-safety Flow execution data is not losslessly reconcilable to atomic advance; invalid_count=${
        result.rows[0]?.invalid_count ?? "unknown"
      }`
    );
  }
}

async function readExecutionSafetyCatalog(
  client: Client
): Promise<FlowExecutionSafetyCatalogFingerprint> {
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
    [executionSafetyRelations]
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
    [executionSafetyRelations]
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
    [executionSafetyRelations]
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
    [executionSafetyRelations]
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
    [executionSafetyRelations]
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
            COALESCE(array_to_string(procedure.proconfig, E'\\n'), '') AS configuration
       FROM pg_trigger AS trigger_record
       JOIN pg_class AS relation ON relation.oid = trigger_record.tgrelid
       JOIN pg_namespace AS relation_namespace
         ON relation_namespace.oid = relation.relnamespace
       JOIN pg_proc AS procedure ON procedure.oid = trigger_record.tgfoid
       JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
       JOIN pg_language AS language ON language.oid = procedure.prolang
      WHERE relation_namespace.nspname = 'public'
        AND relation.relname = ANY($1::text[])
        AND NOT trigger_record.tgisinternal`,
    [executionSafetyRelations]
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

function matchesExecutionSafetyCatalog(
  actual: FlowExecutionSafetyCatalogFingerprint,
  expected: FlowExecutionSafetyCatalogFingerprint
): boolean {
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

function driftError(actual: FlowExecutionSafetyCatalogFingerprint): Error {
  return new Error(
    `Refusing to reconcile a partial or drifted Flow execution safety catalog: ${formatExecutionSafetyCatalog(
      actual
    )}`
  );
}

function formatExecutionSafetyCatalog(value: FlowExecutionSafetyCatalogFingerprint): string {
  return `${value.hash}[relations=${value.relations},columns=${value.columns},constraints=${
    value.constraints
  },indexes=${value.indexes},triggers=${value.triggers},functions=${
    value.functions
  },unvalidatedConstraints=${value.unvalidatedConstraints},invalidIndexes=${value.invalidIndexes}]`;
}

function normalizeCatalogDefinition(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
