import { createHash } from "node:crypto";

import type { Client } from "pg";

import { auditActorSubjectIntegritySql } from "../src/schema/audit-log/audit-actor-subjects.schema";

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

export type AuditActorSubjectReconciliationResult = "already_current" | "reconciled";

const currentCatalog = {
  hash: "ff72f97eca151a49fa67109e165f7f1b427aa930126e2d6fb77a5944673148ea",
  relations: 1,
  columns: 7,
  constraints: 3,
  indexes: 4,
  triggers: 4,
  functions: 3,
  unvalidatedConstraints: 0,
  invalidIndexes: 0
} as const satisfies CatalogFingerprint;

const generatedBaselineCatalog = {
  hash: "0d9c371aec48a7d15a4e7d05ad09be862f8b5430d5e03a2070d7c8d8733b4dee",
  relations: 1,
  columns: 7,
  constraints: 3,
  indexes: 4,
  triggers: 0,
  functions: 0,
  unvalidatedConstraints: 0,
  invalidIndexes: 0
} as const satisfies CatalogFingerprint;

const generatedNamedBaselineCatalog = {
  hash: "572ff82d7572e0688ef62c563621048d054efea6aad1842815a4a03b89d0be98",
  relations: 1,
  columns: 7,
  constraints: 3,
  indexes: 4,
  triggers: 0,
  functions: 0,
  unvalidatedConstraints: 0,
  invalidIndexes: 0
} as const satisfies CatalogFingerprint;

export async function reconcileAuditActorSubjects(
  client: Client
): Promise<AuditActorSubjectReconciliationResult> {
  await client.query("SAVEPOINT audit_actor_subject_reconciliation_guard");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('elevenhouse:audit:actor-subject:v1'))");
  const before = await readCatalog(client);
  if (matchesCatalog(before, currentCatalog)) {
    await assertAuditActorSubjectData(client);
    await client.query("RELEASE SAVEPOINT audit_actor_subject_reconciliation_guard");
    return "already_current";
  }
  if (matchesCatalog(before, generatedBaselineCatalog)) {
    await assertGeneratedBaselineIsEmpty(client);
    await client.query(`
      ALTER TABLE audit_actor_subjects
        RENAME CONSTRAINT audit_actor_subjects_user_id_users_id_fk
        TO audit_actor_subjects_user_fk
    `);
    await client.query(auditActorSubjectIntegritySql);
  } else if (matchesCatalog(before, generatedNamedBaselineCatalog)) {
    await assertGeneratedBaselineIsEmpty(client);
    await client.query(auditActorSubjectIntegritySql);
  } else if (isAbsentCatalog(before)) {
    await client.query(auditActorSubjectBaselineDdl);
  } else {
    throw driftError(before);
  }
  const after = await readCatalog(client);
  if (!matchesCatalog(after, currentCatalog)) {
    throw new Error(
      `Audit actor subject reconciliation produced a drifted catalog; expected=${formatCatalog(
        currentCatalog
      )} actual=${formatCatalog(after)}`
    );
  }
  await assertAuditActorSubjectData(client);
  await client.query("RELEASE SAVEPOINT audit_actor_subject_reconciliation_guard");
  return "reconciled";
}

export async function assertAuditActorSubjects(client: Client): Promise<void> {
  const actual = await readCatalog(client);
  if (!matchesCatalog(actual, currentCatalog)) throw driftError(actual);
  await assertAuditActorSubjectData(client);
}

export const auditActorSubjectBaselineDdl = `
CREATE TABLE audit_actor_subjects (
  actor_subject_id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  kind text NOT NULL,
  user_id uuid,
  service_key varchar(180),
  state text DEFAULT 'active' NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  erased_at timestamp with time zone,
  CONSTRAINT audit_actor_subjects_user_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT audit_actor_subjects_shape_check CHECK (
    (state = 'active' AND erased_at IS NULL AND (
      (kind = 'user' AND user_id IS NOT NULL AND service_key IS NULL)
      OR (kind = 'service' AND user_id IS NULL
        AND length(trim(service_key)) BETWEEN 1 AND 180
        AND service_key = trim(service_key)
        AND service_key ~ '^[A-Za-z0-9._:-]+$')
    )) OR (
      state = 'erased' AND user_id IS NULL AND service_key IS NULL
      AND erased_at IS NOT NULL AND erased_at >= created_at
    )
  )
);

CREATE UNIQUE INDEX audit_actor_subjects_user_unique
  ON audit_actor_subjects (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX audit_actor_subjects_service_unique
  ON audit_actor_subjects (service_key) WHERE service_key IS NOT NULL;
CREATE INDEX audit_actor_subjects_state_created_idx
  ON audit_actor_subjects (state, created_at, actor_subject_id);

${auditActorSubjectIntegritySql}
`;

async function assertGeneratedBaselineIsEmpty(client: Client): Promise<void> {
  const result = await client.query<{ populated: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM audit_actor_subjects) AS populated"
  );
  if (result.rows[0]?.populated) {
    throw new Error(
      "Refusing to upgrade a generated audit actor subject baseline after subject data was written"
    );
  }
}

async function assertAuditActorSubjectData(client: Client): Promise<void> {
  const result = await client.query<{ invalid_count: string }>(`
    SELECT count(*)::text AS invalid_count
      FROM audit_actor_subjects
     WHERE (state = 'active' AND (
              erased_at IS NOT NULL
              OR (kind = 'user' AND (user_id IS NULL OR service_key IS NOT NULL))
              OR (kind = 'service' AND (user_id IS NOT NULL OR service_key IS NULL))
           ))
        OR (state = 'erased' AND (user_id IS NOT NULL OR service_key IS NOT NULL OR erased_at IS NULL))
  `);
  if (result.rows[0]?.invalid_count !== "0") {
    throw new Error("Audit actor subject data is inconsistent");
  }
}

async function readCatalog(client: Client): Promise<CatalogFingerprint> {
  const relations = await client.query<{
    relation_name: string;
    relation_kind: string;
    persistence: string;
    row_security: boolean;
    force_row_security: boolean;
    access_method: string;
  }>(`
    SELECT relation.relname AS relation_name, relation.relkind AS relation_kind,
           relation.relpersistence AS persistence, relation.relrowsecurity AS row_security,
           relation.relforcerowsecurity AS force_row_security,
           COALESCE(access_method.amname, '') AS access_method
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      LEFT JOIN pg_am access_method ON access_method.oid = relation.relam
     WHERE namespace.nspname = 'public'
       AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
       AND relation.relname LIKE 'audit_actor_subject%'
  `);
  const columns = await client.query<{
    table_name: string;
    column_name: string;
    udt_name: string;
    is_nullable: string;
    column_default: string | null;
  }>(`
    SELECT table_name, column_name, udt_name, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'audit_actor_subjects'
  `);
  const constraints = await client.query<{
    relation_name: string;
    object_name: string;
    constraint_type: string;
    definition: string;
    validated: boolean;
  }>(`
    SELECT relation.relname AS relation_name, record.conname AS object_name,
           record.contype AS constraint_type, pg_get_constraintdef(record.oid, false) AS definition,
           record.convalidated AS validated
      FROM pg_constraint record
      JOIN pg_class relation ON relation.oid = record.conrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'public' AND relation.relname = 'audit_actor_subjects'
       AND record.contype <> 't'
  `);
  const indexes = await client.query<{
    relation_name: string;
    object_name: string;
    definition: string;
    valid: boolean;
    ready: boolean;
  }>(`
    SELECT catalog.tablename AS relation_name, catalog.indexname AS object_name,
           catalog.indexdef AS definition, record.indisvalid AS valid, record.indisready AS ready
      FROM pg_indexes catalog
      JOIN pg_class relation ON relation.relname = catalog.tablename
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        AND namespace.nspname = catalog.schemaname
      JOIN pg_class index_relation ON index_relation.relname = catalog.indexname
        AND index_relation.relnamespace = namespace.oid
      JOIN pg_index record ON record.indexrelid = index_relation.oid
        AND record.indrelid = relation.oid
     WHERE catalog.schemaname = 'public' AND catalog.tablename = 'audit_actor_subjects'
  `);
  const triggers = await client.query<{
    relation_name: string;
    object_name: string;
    definition: string;
    enabled: string;
  }>(`
    SELECT relation.relname AS relation_name, record.tgname AS object_name,
           pg_get_triggerdef(record.oid, false) AS definition, record.tgenabled AS enabled
      FROM pg_trigger record
      JOIN pg_class relation ON relation.oid = record.tgrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'public' AND relation.relname = 'audit_actor_subjects'
       AND NOT record.tgisinternal
  `);
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
  }>(`
    SELECT namespace.nspname AS function_schema, procedure.proname AS function_name,
           pg_get_function_identity_arguments(procedure.oid) AS identity_arguments,
           pg_get_function_result(procedure.oid) AS result_type,
           pg_get_functiondef(procedure.oid) AS definition, language.lanname AS language,
           pg_get_userbyid(procedure.proowner) AS owner_name,
           procedure.prosecdef AS security_definer, procedure.provolatile AS volatility,
           COALESCE(array_to_string(procedure.proconfig, E'\\n'), '') AS configuration
      FROM pg_proc procedure
      JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
      JOIN pg_language language ON language.oid = procedure.prolang
     WHERE namespace.nspname = 'public'
       AND procedure.proname IN (
         'audit_prepare_actor_subject',
         'audit_enforce_actor_subject_erasure',
         'audit_reject_actor_subject_removal'
       )
  `);

  const payload = {
    relations: relations.rows.map((row) => `${row.relation_name}|kind=${row.relation_kind}|persistence=${row.persistence}|rowSecurity=${row.row_security}|forceRowSecurity=${row.force_row_security}|accessMethod=${row.access_method}`).sort(),
    columns: columns.rows.map((row) => `${row.table_name}|${row.column_name}|${row.udt_name}|${row.is_nullable}|${normalize(row.column_default ?? "")}`).sort(),
    constraints: constraints.rows.map((row) => `${row.relation_name}|${row.object_name}|${row.constraint_type}|${normalize(row.definition)}|validated=${row.validated}`).sort(),
    indexes: indexes.rows.map((row) => `${row.relation_name}|${row.object_name}|${normalize(row.definition)}|valid=${row.valid}|ready=${row.ready}`).sort(),
    triggers: triggers.rows.map((row) => `${row.relation_name}|${row.object_name}|${normalize(row.definition)}|enabled=${row.enabled}`).sort(),
    functions: functions.rows.map((row) => `${row.function_schema}|${row.function_name}|${normalize(row.identity_arguments)}|result=${normalize(row.result_type)}|definition=${normalize(row.definition)}|language=${row.language}|owner=${row.owner_name}|securityDefiner=${row.security_definer}|volatility=${row.volatility}|configuration=${normalize(row.configuration)}`).sort()
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
  return Object.entries(expected).every(([key, value]) => actual[key as keyof CatalogFingerprint] === value);
}

function isAbsentCatalog(value: CatalogFingerprint): boolean {
  return value.relations === 0 && value.columns === 0 && value.constraints === 0 &&
    value.indexes === 0 && value.triggers === 0 && value.functions === 0;
}

function driftError(actual: CatalogFingerprint): Error {
  return new Error(`Refusing to reconcile a partial or drifted audit actor subject catalog: ${formatCatalog(actual)}`);
}

function formatCatalog(value: CatalogFingerprint): string {
  return `${value.hash}[relations=${value.relations},columns=${value.columns},constraints=${value.constraints},indexes=${value.indexes},triggers=${value.triggers},functions=${value.functions},unvalidatedConstraints=${value.unvalidatedConstraints},invalidIndexes=${value.invalidIndexes}]`;
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
