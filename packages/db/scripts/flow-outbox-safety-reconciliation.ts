import { createHash } from "node:crypto";

import type { Client } from "pg";

import { flowOutboxSafetyBaselineDdl } from "./production-baseline-plan";

type OutboxSafetyCatalogFingerprint = {
  readonly hash: string;
  readonly relations: number;
  readonly columns: number;
  readonly constraints: number;
  readonly indexes: number;
  readonly triggers: number;
  readonly unvalidatedConstraints: number;
  readonly invalidIndexes: number;
};

export type FlowOutboxSafetyReconciliationResult = "already_current" | "reconciled";

const predecessorOutboxSafetyCatalog = {
  hash: "526f772ea2685024db091b0b2b621ecd2c4ae97dcf7574a091e9caecf8934d42",
  relations: 1,
  columns: 12,
  constraints: 6,
  indexes: 4,
  triggers: 0,
  unvalidatedConstraints: 0,
  invalidIndexes: 0
} as const satisfies OutboxSafetyCatalogFingerprint;

const currentOutboxSafetyCatalog = {
  hash: "46f10ace3c834dc6a6c56595f0ebddda9faf98748f0f89e2f13af15cb2ed1546",
  relations: 1,
  columns: 15,
  constraints: 6,
  indexes: 5,
  triggers: 0,
  unvalidatedConstraints: 0,
  invalidIndexes: 0
} as const satisfies OutboxSafetyCatalogFingerprint;

export async function reconcileFlowOutboxSafety(
  client: Client
): Promise<FlowOutboxSafetyReconciliationResult> {
  await client.query("LOCK TABLE outbox_events IN ACCESS EXCLUSIVE MODE");
  const locked = await readOutboxSafetyCatalog(client);
  if (matchesOutboxSafetyCatalog(locked, currentOutboxSafetyCatalog)) {
    return "already_current";
  }
  if (!matchesOutboxSafetyCatalog(locked, predecessorOutboxSafetyCatalog)) {
    throw driftError(locked);
  }

  await assertPredecessorOutboxData(client);
  await client.query(flowOutboxSafetyBaselineDdl);
  await assertFlowOutboxSafety(client);
  return "reconciled";
}

export async function assertFlowOutboxSafety(client: Client): Promise<void> {
  const actual = await readOutboxSafetyCatalog(client);
  if (matchesOutboxSafetyCatalog(actual, currentOutboxSafetyCatalog)) return;
  throw new Error(
    `Current Flow outbox safety catalog drifted; expected=${formatOutboxSafetyCatalog(
      currentOutboxSafetyCatalog
    )} actual=${formatOutboxSafetyCatalog(actual)}`
  );
}

async function assertPredecessorOutboxData(client: Client): Promise<void> {
  const result = await client.query<{ invalid_count: string }>(`
    SELECT count(*)::text AS invalid_count
      FROM outbox_events
     WHERE attempts < 0
        OR status NOT IN ('pending', 'publishing', 'published')
        OR (
          status = 'pending'
          AND (locked_at IS NOT NULL OR published_at IS NOT NULL)
        )
        OR (
          status = 'publishing'
          AND (locked_at IS NULL OR published_at IS NOT NULL)
        )
        OR (
          status = 'published'
          AND (locked_at IS NOT NULL OR published_at IS NULL)
        )
  `);
  if (result.rows[0]?.invalid_count !== "0") {
    throw new Error(
      `Approved predecessor Flow outbox data is not losslessly reconcilable; invalid_count=${
        result.rows[0]?.invalid_count ?? "unknown"
      }`
    );
  }
}

async function readOutboxSafetyCatalog(client: Client): Promise<OutboxSafetyCatalogFingerprint> {
  const relations = await client.query<{
    relation_name: string;
    relation_kind: string;
    persistence: string;
    row_security: boolean;
    force_row_security: boolean;
    access_method: string;
  }>(`
    SELECT relation.relname AS relation_name,
           relation.relkind AS relation_kind,
           relation.relpersistence AS persistence,
           relation.relrowsecurity AS row_security,
           relation.relforcerowsecurity AS force_row_security,
           COALESCE(access_method.amname, '') AS access_method
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      LEFT JOIN pg_am AS access_method ON access_method.oid = relation.relam
     WHERE namespace.nspname = 'public'
       AND relation.relname = 'outbox_events'
  `);
  const columns = await client.query<{
    column_name: string;
    udt_name: string;
    is_nullable: string;
    column_default: string | null;
  }>(`
    SELECT column_name, udt_name, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'outbox_events'
  `);
  const constraints = await client.query<{
    object_name: string;
    constraint_type: string;
    definition: string;
    validated: boolean;
  }>(`
    SELECT
      constraint_record.conname AS object_name,
      constraint_record.contype AS constraint_type,
      pg_get_constraintdef(constraint_record.oid, false) AS definition,
      constraint_record.convalidated AS validated
    FROM pg_constraint AS constraint_record
    JOIN pg_class AS relation ON relation.oid = constraint_record.conrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'outbox_events'
      AND constraint_record.contype <> 't'
  `);
  const indexes = await client.query<{
    object_name: string;
    definition: string;
    valid: boolean;
    ready: boolean;
  }>(`
    SELECT
      index_catalog.indexname AS object_name,
      index_catalog.indexdef AS definition,
      index_record.indisvalid AS valid,
      index_record.indisready AS ready
    FROM pg_indexes AS index_catalog
    JOIN pg_class AS relation
      ON relation.relname = index_catalog.tablename
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
      AND index_catalog.tablename = 'outbox_events'
  `);
  const triggers = await client.query<{
    object_name: string;
    definition: string;
    enabled: string;
  }>(`
    SELECT
      trigger_record.tgname AS object_name,
      pg_get_triggerdef(trigger_record.oid, false) AS definition,
      trigger_record.tgenabled AS enabled
    FROM pg_trigger AS trigger_record
    JOIN pg_class AS relation ON relation.oid = trigger_record.tgrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'outbox_events'
      AND NOT trigger_record.tgisinternal
  `);

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
          `${row.column_name}|${row.udt_name}|${row.is_nullable}|${normalizeCatalogDefinition(
            row.column_default ?? ""
          )}`
      )
      .sort(),
    constraints: constraints.rows
      .map(
        (row) =>
          `${row.object_name}|${row.constraint_type}|${normalizeCatalogDefinition(
            row.definition
          )}|validated=${row.validated}`
      )
      .sort(),
    indexes: indexes.rows
      .map(
        (row) =>
          `${row.object_name}|${normalizeCatalogDefinition(row.definition)}|valid=${
            row.valid
          }|ready=${row.ready}`
      )
      .sort(),
    triggers: triggers.rows
      .map(
        (row) =>
          `${row.object_name}|${normalizeCatalogDefinition(row.definition)}|enabled=${row.enabled}`
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
    unvalidatedConstraints: constraints.rows.filter((row) => !row.validated).length,
    invalidIndexes: indexes.rows.filter((row) => !row.valid || !row.ready).length
  };
}

function matchesOutboxSafetyCatalog(
  actual: OutboxSafetyCatalogFingerprint,
  expected: OutboxSafetyCatalogFingerprint
): boolean {
  return (
    actual.hash === expected.hash &&
    actual.relations === expected.relations &&
    actual.columns === expected.columns &&
    actual.constraints === expected.constraints &&
    actual.indexes === expected.indexes &&
    actual.triggers === expected.triggers &&
    actual.unvalidatedConstraints === expected.unvalidatedConstraints &&
    actual.invalidIndexes === expected.invalidIndexes
  );
}

function driftError(actual: OutboxSafetyCatalogFingerprint): Error {
  return new Error(
    `Refusing to reconcile a partial or drifted Flow outbox safety catalog: ${formatOutboxSafetyCatalog(
      actual
    )}`
  );
}

function formatOutboxSafetyCatalog(value: OutboxSafetyCatalogFingerprint): string {
  return `${value.hash}[relations=${value.relations},columns=${value.columns},constraints=${
    value.constraints
  },indexes=${value.indexes},triggers=${value.triggers},unvalidatedConstraints=${
    value.unvalidatedConstraints
  },invalidIndexes=${value.invalidIndexes}]`;
}

function normalizeCatalogDefinition(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
