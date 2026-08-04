import { createHash } from "node:crypto";
import type { Client } from "pg";

export const consentAiRelations = [
  "client_data_consents",
  "ai_usage_records",
  "ai_usage_consent_records"
] as const;

const consentAiFunctionNames = [
  "elevenhouse_guard_client_data_consent_mutation",
  "elevenhouse_guard_ai_usage_record_mutation",
  "elevenhouse_guard_ai_usage_consent_record_mutation"
] as const;

export type ConsentAiCatalogFingerprint = {
  readonly hash: string;
  readonly columns: number;
  readonly constraints: number;
  readonly indexes: number;
  readonly triggers: number;
  readonly functions: number;
};

export type ConsentAiRelationshipIdentityCatalogFingerprint = {
  readonly hash: string;
  readonly relation: boolean;
  readonly constraints: number;
  readonly indexes: number;
};

const consentAiRelationshipIdentityConstraintName =
  "client_astrologer_relationships_identity_unique";

export const predecessorConsentAiRelationshipIdentityCatalog =
  fingerprintConsentAiRelationshipIdentityCatalog(true, [], []);

export const canonicalConsentAiRelationshipIdentityCatalog =
  fingerprintConsentAiRelationshipIdentityCatalog(
    true,
    [
      "client_astrologer_relationships.client_astrologer_relationships_identity_unique|u|validated=true|UNIQUE (id, client_user_id, astrologer_user_id)"
    ],
    [
      "client_astrologer_relationships.client_astrologer_relationships_identity_unique|CREATE UNIQUE INDEX client_astrologer_relationships_identity_unique ON public.client_astrologer_relationships USING btree (id, client_user_id, astrologer_user_id)"
    ]
  );

export const absentConsentAiCatalog = {
  hash: "a430e073276d1e2341d38558b83f6ada3160a1642256109440e193d82e2ce5c5",
  columns: 0,
  constraints: 0,
  indexes: 0,
  triggers: 0,
  functions: 0
} as const satisfies ConsentAiCatalogFingerprint;

export const predecessorConsentAiCatalog = {
  hash: "bda1927b4c09d0322d583501bac5524c87596395e68e9f30343db40c202ab9f6",
  columns: 33,
  constraints: 18,
  indexes: 10,
  triggers: 0,
  functions: 0
} as const satisfies ConsentAiCatalogFingerprint;

export const previousCanonicalConsentAiCatalog = {
  hash: "fc467ed9fb326cf8a4a371e91085b7931a55bf3b163eaa6409694dd3f455cd0b",
  columns: 33,
  constraints: 18,
  indexes: 10,
  triggers: 3,
  functions: 3
} as const satisfies ConsentAiCatalogFingerprint;

export const canonicalConsentAiCatalog = {
  hash: "d54ee3209b0aeaf45161a798e3789fac193c3b7e36300d1869b64f3eff5c0578",
  columns: 33,
  constraints: 18,
  indexes: 10,
  triggers: 3,
  functions: 3
} as const satisfies ConsentAiCatalogFingerprint;

export async function readConsentAiRelationshipIdentityCatalog(
  client: Pick<Client, "query">
): Promise<ConsentAiRelationshipIdentityCatalogFingerprint> {
  const relation = await client.query<{ relation: string | null }>(
    "SELECT to_regclass('public.client_astrologer_relationships')::text AS relation"
  );
  const constraints = await client.query<{
    relation_name: string;
    object_name: string;
    constraint_type: string;
    validated: boolean;
    definition: string;
  }>(
    `
      SELECT
        relation.relname AS relation_name,
        constraint_object.conname AS object_name,
        constraint_object.contype::text AS constraint_type,
        constraint_object.convalidated AS validated,
        pg_get_constraintdef(constraint_object.oid, false) AS definition
      FROM pg_constraint constraint_object
      JOIN pg_class relation ON relation.oid = constraint_object.conrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = 'client_astrologer_relationships'
        AND constraint_object.conname = $1
    `,
    [consentAiRelationshipIdentityConstraintName]
  );
  const indexes = await client.query<{
    relation_name: string;
    object_name: string;
    definition: string;
  }>(
    `
      SELECT tablename AS relation_name, indexname AS object_name, indexdef AS definition
        FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = 'client_astrologer_relationships'
         AND indexname = $1
    `,
    [consentAiRelationshipIdentityConstraintName]
  );

  return fingerprintConsentAiRelationshipIdentityCatalog(
    relation.rows[0]?.relation === "client_astrologer_relationships",
    constraints.rows.map(
      (row) =>
        `${row.relation_name}.${row.object_name}|${row.constraint_type}|validated=${row.validated}|${normalizeCatalogDefinition(row.definition)}`
    ),
    indexes.rows.map(
      (row) =>
        `${row.relation_name}.${row.object_name}|${normalizeCatalogDefinition(row.definition)}`
    )
  );
}

export async function reconcileConsentAiRelationshipIdentity(
  client: Pick<Client, "query">
): Promise<void> {
  const initial = await readConsentAiRelationshipIdentityCatalog(client);
  if (
    matchesConsentAiRelationshipIdentityCatalog(
      initial,
      canonicalConsentAiRelationshipIdentityCatalog
    )
  ) {
    return;
  }
  if (
    !matchesConsentAiRelationshipIdentityCatalog(
      initial,
      predecessorConsentAiRelationshipIdentityCatalog
    )
  ) {
    throw new Error(
      `Refusing to reconcile a partial or drifted client relationship identity catalog: ${formatConsentAiRelationshipIdentityCatalog(initial)}`
    );
  }

  await client.query("LOCK TABLE client_astrologer_relationships IN ACCESS EXCLUSIVE MODE");
  const locked = await readConsentAiRelationshipIdentityCatalog(client);
  if (
    !matchesConsentAiRelationshipIdentityCatalog(
      locked,
      predecessorConsentAiRelationshipIdentityCatalog
    )
  ) {
    throw new Error(
      `Client relationship identity catalog changed before reconciliation: ${formatConsentAiRelationshipIdentityCatalog(locked)}`
    );
  }

  await client.query(`
    ALTER TABLE client_astrologer_relationships
      ADD CONSTRAINT client_astrologer_relationships_identity_unique
      UNIQUE (id, client_user_id, astrologer_user_id)
  `);
  await assertConsentAiRelationshipIdentity(client);
}

export async function assertConsentAiRelationshipIdentity(
  client: Pick<Client, "query">
): Promise<void> {
  const actual = await readConsentAiRelationshipIdentityCatalog(client);
  if (
    matchesConsentAiRelationshipIdentityCatalog(
      actual,
      canonicalConsentAiRelationshipIdentityCatalog
    )
  ) {
    return;
  }
  throw new Error(
    `Current client relationship identity catalog drifted: ${formatConsentAiRelationshipIdentityCatalog(actual)}`
  );
}

export function matchesConsentAiRelationshipIdentityCatalog(
  actual: ConsentAiRelationshipIdentityCatalogFingerprint,
  expected: ConsentAiRelationshipIdentityCatalogFingerprint
): boolean {
  return (
    actual.hash === expected.hash &&
    actual.relation === expected.relation &&
    actual.constraints === expected.constraints &&
    actual.indexes === expected.indexes
  );
}

export function formatConsentAiRelationshipIdentityCatalog(
  value: ConsentAiRelationshipIdentityCatalogFingerprint
): string {
  return `${value.hash}[relation=${value.relation},constraints=${value.constraints},indexes=${value.indexes}]`;
}

export async function readConsentAiCatalog(
  client: Pick<Client, "query">
): Promise<ConsentAiCatalogFingerprint> {
  const columns = await client.query<{
    table_name: string;
    column_name: string;
    udt_name: string;
    is_nullable: string;
    column_default: string | null;
  }>(
    `
      SELECT table_name, column_name, udt_name, is_nullable, column_default
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])
    `,
    [consentAiRelations]
  );
  const constraints = await client.query<{
    relation_name: string;
    object_name: string;
    definition: string;
  }>(
    `
      SELECT
        relation.relname AS relation_name,
        constraint_object.conname AS object_name,
        pg_get_constraintdef(constraint_object.oid, false) AS definition
      FROM pg_constraint constraint_object
      JOIN pg_class relation ON relation.oid = constraint_object.conrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = ANY($1::text[])
        AND constraint_object.contype <> 't'
    `,
    [consentAiRelations]
  );
  const indexes = await client.query<{
    relation_name: string;
    object_name: string;
    definition: string;
  }>(
    `
      SELECT tablename AS relation_name, indexname AS object_name, indexdef AS definition
        FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = ANY($1::text[])
    `,
    [consentAiRelations]
  );
  const triggers = await client.query<{
    relation_name: string;
    object_name: string;
    definition: string;
    enabled: string;
  }>(
    `
      SELECT
        relation.relname AS relation_name,
        trigger_object.tgname AS object_name,
        pg_get_triggerdef(trigger_object.oid, false) AS definition,
        trigger_object.tgenabled AS enabled
      FROM pg_trigger trigger_object
      JOIN pg_class relation ON relation.oid = trigger_object.tgrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = ANY($1::text[])
        AND NOT trigger_object.tgisinternal
    `,
    [consentAiRelations]
  );
  const functions = await client.query<{
    object_name: string;
    definition: string;
  }>(
    `
      SELECT routine.proname AS object_name, pg_get_functiondef(routine.oid) AS definition
        FROM pg_proc routine
        JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
       WHERE namespace.nspname = 'public'
         AND routine.proname = ANY($1::text[])
    `,
    [consentAiFunctionNames]
  );

  const payload = {
    columns: columns.rows
      .map(
        (row) =>
          `${row.table_name}.${row.column_name}|${row.udt_name}|${row.is_nullable}|${row.column_default ?? ""}`
      )
      .sort(),
    constraints: constraints.rows
      .map(
        (row) =>
          `${row.relation_name}.${row.object_name}|${normalizeCatalogDefinition(row.definition)}`
      )
      .sort(),
    indexes: indexes.rows
      .map(
        (row) =>
          `${row.relation_name}.${row.object_name}|${normalizeCatalogDefinition(row.definition)}`
      )
      .sort(),
    triggers: triggers.rows
      .map(
        (row) =>
          `${row.relation_name}.${row.object_name}|${normalizeCatalogDefinition(row.definition)}|enabled=${row.enabled}`
      )
      .sort(),
    functions: functions.rows
      .map((row) => `${row.object_name}|${normalizeCatalogDefinition(row.definition)}`)
      .sort()
  };

  return {
    hash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    columns: payload.columns.length,
    constraints: payload.constraints.length,
    indexes: payload.indexes.length,
    triggers: payload.triggers.length,
    functions: payload.functions.length
  };
}

export function matchesConsentAiCatalog(
  actual: ConsentAiCatalogFingerprint,
  expected: ConsentAiCatalogFingerprint
): boolean {
  return (
    actual.hash === expected.hash &&
    actual.columns === expected.columns &&
    actual.constraints === expected.constraints &&
    actual.indexes === expected.indexes &&
    actual.triggers === expected.triggers &&
    actual.functions === expected.functions
  );
}

export function formatConsentAiCatalog(value: ConsentAiCatalogFingerprint): string {
  return `${value.hash}[columns=${value.columns},constraints=${value.constraints},indexes=${value.indexes},triggers=${value.triggers},functions=${value.functions}]`;
}

function normalizeCatalogDefinition(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function fingerprintConsentAiRelationshipIdentityCatalog(
  relation: boolean,
  constraints: readonly string[],
  indexes: readonly string[]
): ConsentAiRelationshipIdentityCatalogFingerprint {
  const payload = {
    relation,
    constraints: [...constraints].sort(),
    indexes: [...indexes].sort()
  };
  return {
    hash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    relation,
    constraints: payload.constraints.length,
    indexes: payload.indexes.length
  };
}
