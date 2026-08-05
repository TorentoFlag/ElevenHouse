import { createHash } from "node:crypto";

import type { Client } from "pg";

import { flowBookingLifecycleIntegritySql } from "../src/schema/flows/flow-booking-lifecycle.schema";
import { bookingLifecycleEventIntegritySql } from "../src/schema/scheduling/booking-lifecycle-events.schema";
import {
  configureBoundedReconciliationLockTimeout,
  lockExistingTablesForReconciliation
} from "./reconciliation-table-locks";

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

type ExtensionCatalogFingerprint = {
  readonly hash: string;
  readonly columns: number;
  readonly constraints: number;
  readonly indexes: number;
  readonly triggers: number;
  readonly unvalidatedConstraints: number;
  readonly invalidIndexes: number;
};

export type FlowBookingLifecycleSafetyReconciliationResult = "already_current" | "reconciled";

const lifecycleRelations = [
  "booking_lifecycle_events",
  "flow_booking_lifecycle_heads",
  "flow_booking_lifecycle_receipts"
] as const;

const lifecycleFunctions = [
  "elevenhouse_assert_booking_lifecycle_history",
  "elevenhouse_assert_flow_booking_lifecycle_source",
  "elevenhouse_guard_flow_booking_lifecycle_head_mutation",
  "elevenhouse_guard_flow_booking_lifecycle_receipt_mutation",
  "elevenhouse_reject_booking_lifecycle_event_mutation"
] as const;

const currentCatalog = {
  hash: "f3680857b26aad15576227c30099e7b1a30dfde0aebafc188e1800aab431a8ac",
  relations: 3,
  columns: 40,
  constraints: 33,
  indexes: 11,
  triggers: 9,
  functions: 5,
  unvalidatedConstraints: 0,
  invalidIndexes: 0
} as const satisfies CatalogFingerprint;

const currentExtensionCatalog = {
  hash: "0bb71e638e05b96a49cd2757b83c60fa5dabc784ebec79134903a4c31bbbcf14",
  columns: 2,
  constraints: 4,
  indexes: 1,
  triggers: 1,
  unvalidatedConstraints: 0,
  invalidIndexes: 0
} as const satisfies ExtensionCatalogFingerprint;

export async function reconcileFlowBookingLifecycleSafety(
  client: Client
): Promise<FlowBookingLifecycleSafetyReconciliationResult> {
  await client.query("SAVEPOINT flow_booking_lifecycle_safety_guard");
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('elevenhouse:flows:booking-lifecycle:v1'))"
  );

  let before = await readCatalog(client);
  let extensionBefore = await readExtensionCatalog(client);
  if (
    matchesCatalog(before, currentCatalog) &&
    matchesExtension(extensionBefore, currentExtensionCatalog)
  ) {
    await assertCurrentData(client);
    await client.query("RELEASE SAVEPOINT flow_booking_lifecycle_safety_guard");
    return "already_current";
  }

  if (!isAbsentCatalog(before) || !isAbsentExtension(extensionBefore)) {
    throw driftError(before, extensionBefore);
  }

  await assertPrerequisites(client);
  await configureBoundedReconciliationLockTimeout(client);
  await lockExistingTablesForReconciliation(client, [
    "booking_lifecycle_events",
    "bookings",
    "flow_booking_lifecycle_heads",
    "flow_booking_lifecycle_receipts",
    "flow_run_events"
  ]);
  before = await readCatalog(client);
  extensionBefore = await readExtensionCatalog(client);
  if (
    matchesCatalog(before, currentCatalog) &&
    matchesExtension(extensionBefore, currentExtensionCatalog)
  ) {
    await assertCurrentData(client);
    await client.query("RELEASE SAVEPOINT flow_booking_lifecycle_safety_guard");
    return "already_current";
  }
  if (!isAbsentCatalog(before) || !isAbsentExtension(extensionBefore)) {
    throw driftError(before, extensionBefore);
  }
  await assertLosslesslyReconcilableLegacyData(client);
  await client.query(flowBookingLifecycleSafetyBaselineDdl);

  const after = await readCatalog(client);
  const extensionAfter = await readExtensionCatalog(client);
  if (
    !matchesCatalog(after, currentCatalog) ||
    !matchesExtension(extensionAfter, currentExtensionCatalog)
  ) {
    throw new Error(
      `Flow Booking lifecycle reconciliation produced a drifted catalog; catalog=${formatCatalog(
        after
      )} extension=${formatExtension(extensionAfter)}`
    );
  }
  await assertCurrentData(client);
  await client.query("RELEASE SAVEPOINT flow_booking_lifecycle_safety_guard");
  return "reconciled";
}

export async function assertFlowBookingLifecycleSafety(client: Client): Promise<void> {
  const catalog = await readCatalog(client);
  const extension = await readExtensionCatalog(client);
  if (
    !matchesCatalog(catalog, currentCatalog) ||
    !matchesExtension(extension, currentExtensionCatalog)
  ) {
    throw driftError(catalog, extension);
  }
  await assertCurrentData(client);
}

export const flowBookingLifecycleSafetyBaselineDdl = `
ALTER TABLE bookings
  ADD COLUMN lifecycle_revision integer DEFAULT 0 NOT NULL,
  ADD CONSTRAINT bookings_lifecycle_revision_check
    CHECK (lifecycle_revision >= 0) NOT VALID,
  ADD CONSTRAINT bookings_lifecycle_state_revision_check CHECK (
    (state IN ('hold', 'pending_payment', 'expired') AND lifecycle_revision = 0)
    OR (state IN ('confirmed', 'completed', 'no_show') AND lifecycle_revision > 0)
    OR (state = 'cancelled' AND (lifecycle_revision = 0 OR lifecycle_revision > 1))
  ) NOT VALID;
ALTER TABLE bookings
  VALIDATE CONSTRAINT bookings_lifecycle_revision_check,
  VALIDATE CONSTRAINT bookings_lifecycle_state_revision_check;

CREATE TABLE booking_lifecycle_events (
  id uuid PRIMARY KEY NOT NULL,
  booking_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  revision integer NOT NULL,
  event_kind text NOT NULL,
  actor_kind text NOT NULL,
  actor_user_id uuid,
  reason_code text,
  before_start_at timestamp with time zone,
  before_end_at timestamp with time zone,
  before_time_zone text,
  after_start_at timestamp with time zone,
  after_end_at timestamp with time zone,
  after_time_zone text,
  canonical_digest varchar(71) NOT NULL,
  occurred_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT booking_lifecycle_events_booking_revision_unique UNIQUE (booking_id, revision),
  CONSTRAINT booking_lifecycle_events_id_owner_unique UNIQUE (id, owner_user_id),
  CONSTRAINT booking_lifecycle_events_id_booking_owner_unique
    UNIQUE (id, booking_id, owner_user_id),
  CONSTRAINT booking_lifecycle_events_booking_owner_fk
    FOREIGN KEY (booking_id, owner_user_id)
    REFERENCES bookings(id, owner_user_id) ON DELETE RESTRICT,
  CONSTRAINT booking_lifecycle_events_actor_fk
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT booking_lifecycle_events_revision_check CHECK (revision > 0),
  CONSTRAINT booking_lifecycle_events_event_kind_check
    CHECK (event_kind IN ('confirmed', 'rescheduled', 'cancelled')),
  CONSTRAINT booking_lifecycle_events_actor_check CHECK (
    (actor_kind = 'system' AND actor_user_id IS NULL)
    OR (actor_kind IN ('astrologer', 'client') AND actor_user_id IS NOT NULL)
  ),
  CONSTRAINT booking_lifecycle_events_reason_check CHECK (
    reason_code IS NULL
    OR reason_code IN ('astrologer_unavailable', 'client_request', 'mutual_agreement', 'other')
  ),
  CONSTRAINT booking_lifecycle_events_before_schedule_check CHECK (
    (before_start_at IS NULL AND before_end_at IS NULL AND before_time_zone IS NULL)
    OR (before_start_at < before_end_at AND length(trim(before_time_zone)) BETWEEN 1 AND 100)
  ),
  CONSTRAINT booking_lifecycle_events_after_schedule_check CHECK (
    (after_start_at IS NULL AND after_end_at IS NULL AND after_time_zone IS NULL)
    OR (after_start_at < after_end_at AND length(trim(after_time_zone)) BETWEEN 1 AND 100)
  ),
  CONSTRAINT booking_lifecycle_events_transition_check CHECK (
    (event_kind = 'confirmed'
      AND revision = 1
      AND reason_code IS NULL
      AND before_start_at IS NULL AND before_end_at IS NULL AND before_time_zone IS NULL
      AND after_start_at IS NOT NULL AND after_end_at IS NOT NULL AND after_time_zone IS NOT NULL)
    OR (event_kind = 'rescheduled'
      AND revision > 1
      AND reason_code IS NULL
      AND before_start_at IS NOT NULL AND before_end_at IS NOT NULL AND before_time_zone IS NOT NULL
      AND after_start_at IS NOT NULL AND after_end_at IS NOT NULL AND after_time_zone IS NOT NULL
      AND (before_start_at, before_end_at, before_time_zone)
        IS DISTINCT FROM (after_start_at, after_end_at, after_time_zone))
    OR (event_kind = 'cancelled'
      AND revision > 1
      AND reason_code IS NOT NULL
      AND before_start_at IS NOT NULL AND before_end_at IS NOT NULL AND before_time_zone IS NOT NULL
      AND after_start_at IS NULL AND after_end_at IS NULL AND after_time_zone IS NULL)
  ),
  CONSTRAINT booking_lifecycle_events_digest_check
    CHECK (canonical_digest ~ '^sha256:[a-f0-9]{64}$')
);
CREATE INDEX booking_lifecycle_events_owner_occurred_idx
  ON booking_lifecycle_events (owner_user_id, occurred_at, id);

${bookingLifecycleEventIntegritySql}

CREATE TABLE flow_booking_lifecycle_heads (
  booking_id uuid PRIMARY KEY NOT NULL,
  owner_user_id uuid NOT NULL,
  applied_revision integer NOT NULL,
  state text NOT NULL,
  current_start_at timestamp with time zone,
  current_end_at timestamp with time zone,
  current_time_zone text,
  last_lifecycle_event_id uuid NOT NULL,
  last_canonical_digest varchar(71) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT flow_booking_lifecycle_heads_booking_owner_fk
    FOREIGN KEY (booking_id, owner_user_id)
    REFERENCES bookings(id, owner_user_id) ON DELETE RESTRICT,
  CONSTRAINT flow_booking_lifecycle_heads_event_booking_owner_fk
    FOREIGN KEY (last_lifecycle_event_id, booking_id, owner_user_id)
    REFERENCES booking_lifecycle_events(id, booking_id, owner_user_id) ON DELETE RESTRICT,
  CONSTRAINT flow_booking_lifecycle_heads_booking_owner_unique UNIQUE (booking_id, owner_user_id),
  CONSTRAINT flow_booking_lifecycle_heads_revision_check CHECK (applied_revision > 0),
  CONSTRAINT flow_booking_lifecycle_heads_state_check CHECK (state IN ('confirmed', 'cancelled')),
  CONSTRAINT flow_booking_lifecycle_heads_state_schedule_check CHECK (
    (state = 'confirmed'
      AND current_start_at IS NOT NULL AND current_end_at IS NOT NULL
      AND current_start_at < current_end_at
      AND length(trim(current_time_zone)) BETWEEN 1 AND 100)
    OR (state = 'cancelled'
      AND current_start_at IS NULL AND current_end_at IS NULL AND current_time_zone IS NULL)
  ),
  CONSTRAINT flow_booking_lifecycle_heads_digest_check
    CHECK (last_canonical_digest ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT flow_booking_lifecycle_heads_time_order_check CHECK (updated_at >= created_at)
);
CREATE INDEX flow_booking_lifecycle_heads_owner_state_idx
  ON flow_booking_lifecycle_heads (owner_user_id, state, updated_at, booking_id);

CREATE TABLE flow_booking_lifecycle_receipts (
  lifecycle_event_id uuid PRIMARY KEY NOT NULL,
  booking_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  revision integer NOT NULL,
  event_kind text NOT NULL,
  canonical_digest varchar(71) NOT NULL,
  outcome text NOT NULL,
  flow_runtime_event_id uuid,
  affected_run_count integer DEFAULT 0 NOT NULL,
  affected_work_item_count integer DEFAULT 0 NOT NULL,
  preserved_completed_work_item_count integer DEFAULT 0 NOT NULL,
  processed_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT flow_booking_lifecycle_receipts_event_booking_owner_fk
    FOREIGN KEY (lifecycle_event_id, booking_id, owner_user_id)
    REFERENCES booking_lifecycle_events(id, booking_id, owner_user_id) ON DELETE RESTRICT,
  CONSTRAINT flow_booking_lifecycle_receipts_runtime_event_owner_fk
    FOREIGN KEY (flow_runtime_event_id, owner_user_id)
    REFERENCES flow_runtime_events(id, owner_user_id) ON DELETE RESTRICT,
  CONSTRAINT flow_booking_lifecycle_receipts_booking_revision_unique UNIQUE (booking_id, revision),
  CONSTRAINT flow_booking_lifecycle_receipts_revision_check CHECK (revision > 0),
  CONSTRAINT flow_booking_lifecycle_receipts_event_kind_check
    CHECK (event_kind IN ('confirmed', 'rescheduled', 'cancelled')),
  CONSTRAINT flow_booking_lifecycle_receipts_outcome_check CHECK (
    outcome IN ('enrolled', 'no_match', 'late_unmatched', 'subject_ineligible', 'suppressed', 'canceled', 'rescheduled')
  ),
  CONSTRAINT flow_booking_lifecycle_receipts_digest_check
    CHECK (canonical_digest ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT flow_booking_lifecycle_receipts_counts_check CHECK (
    affected_run_count >= 0
    AND affected_work_item_count >= 0
    AND preserved_completed_work_item_count >= 0
  ),
  CONSTRAINT flow_booking_lifecycle_receipts_shape_check CHECK (
    (event_kind = 'confirmed'
      AND outcome IN ('enrolled', 'no_match', 'late_unmatched', 'subject_ineligible', 'suppressed')
      AND flow_runtime_event_id IS NOT NULL
      AND affected_work_item_count = 0
      AND preserved_completed_work_item_count = 0)
    OR (event_kind = 'rescheduled' AND outcome = 'rescheduled' AND flow_runtime_event_id IS NULL)
    OR (event_kind = 'cancelled' AND outcome = 'canceled' AND flow_runtime_event_id IS NULL)
  )
);
CREATE INDEX flow_booking_lifecycle_receipts_owner_processed_idx
  ON flow_booking_lifecycle_receipts (owner_user_id, processed_at, lifecycle_event_id);

ALTER TABLE flow_run_events
  ADD COLUMN booking_lifecycle_event_id uuid,
  ADD CONSTRAINT flow_run_events_booking_lifecycle_event_owner_fk
    FOREIGN KEY (booking_lifecycle_event_id, owner_user_id)
    REFERENCES booking_lifecycle_events(id, owner_user_id) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT flow_run_events_booking_lifecycle_provenance_check CHECK (
    (event_type = 'run_canceled' AND (command_id IS NULL) <> (booking_lifecycle_event_id IS NULL))
    OR (event_type = 'booking_rescheduled'
      AND attempt_id IS NULL AND command_id IS NULL AND booking_lifecycle_event_id IS NOT NULL)
    OR (event_type NOT IN ('run_canceled', 'booking_rescheduled')
      AND booking_lifecycle_event_id IS NULL)
  ) NOT VALID;
ALTER TABLE flow_run_events
  VALIDATE CONSTRAINT flow_run_events_booking_lifecycle_event_owner_fk;
ALTER TABLE flow_run_events
  VALIDATE CONSTRAINT flow_run_events_booking_lifecycle_provenance_check;
CREATE UNIQUE INDEX flow_run_events_booking_lifecycle_run_unique
  ON flow_run_events (booking_lifecycle_event_id, flow_run_id)
  WHERE booking_lifecycle_event_id IS NOT NULL;

${flowBookingLifecycleIntegritySql}
`;

async function assertPrerequisites(client: Client): Promise<void> {
  for (const relation of ["users", "bookings", "flow_runtime_events", "flow_run_events"]) {
    const result = await client.query<{ relation: string | null }>(
      "SELECT to_regclass($1) AS relation",
      [`public.${relation}`]
    );
    if (result.rows[0]?.relation === null) {
      throw new Error(`Flow Booking lifecycle prerequisite is missing: public.${relation}`);
    }
  }
}

async function assertLosslesslyReconcilableLegacyData(client: Client): Promise<void> {
  const result = await client.query<{ booking_count: string }>(
    "SELECT count(*)::text AS booking_count FROM bookings"
  );
  if (result.rows[0]?.booking_count !== "0") {
    throw new Error(
      `Pre-lifecycle Booking data is not losslessly reconcilable; booking_count=${
        result.rows[0]?.booking_count ?? "unknown"
      }`
    );
  }
}

async function assertCurrentData(client: Client): Promise<void> {
  const result = await client.query<{ invalid_count: string }>(`
    SELECT (
      (SELECT count(*)
         FROM bookings booking
         LEFT JOIN LATERAL (
           SELECT count(*)::integer AS event_count,
                  min(event.revision) AS min_revision,
                  max(event.revision) AS max_revision
             FROM booking_lifecycle_events event
            WHERE event.booking_id = booking.id
              AND event.owner_user_id = booking.owner_user_id
         ) history ON true
        WHERE (booking.lifecycle_revision = 0 AND history.event_count <> 0)
           OR (booking.lifecycle_revision = 0
             AND booking.state IN ('confirmed', 'completed', 'no_show'))
           OR (booking.lifecycle_revision = 1 AND booking.state = 'cancelled')
           OR (booking.lifecycle_revision > 0 AND (
             history.event_count <> booking.lifecycle_revision
             OR history.min_revision <> 1
             OR history.max_revision <> booking.lifecycle_revision
             OR NOT EXISTS (
               SELECT 1
                 FROM booking_lifecycle_events first_event
                WHERE first_event.booking_id = booking.id
                  AND first_event.owner_user_id = booking.owner_user_id
                  AND first_event.revision = 1
                  AND first_event.event_kind = 'confirmed'
             )
           )))
      +
      (SELECT count(*)
         FROM flow_booking_lifecycle_heads head
         JOIN bookings booking
           ON booking.id = head.booking_id
          AND booking.owner_user_id = head.owner_user_id
        WHERE head.applied_revision > booking.lifecycle_revision)
      +
      (SELECT count(*)
         FROM flow_booking_lifecycle_receipts receipt
         JOIN bookings booking
           ON booking.id = receipt.booking_id
          AND booking.owner_user_id = receipt.owner_user_id
        WHERE receipt.revision > booking.lifecycle_revision)
    )::text AS invalid_count
  `);
  if (result.rows[0]?.invalid_count !== "0") {
    throw new Error(
      `Current Flow Booking lifecycle data violates revision continuity; invalid_count=${
        result.rows[0]?.invalid_count ?? "unknown"
      }`
    );
  }
}

async function readCatalog(client: Client): Promise<CatalogFingerprint> {
  const relationList = lifecycleRelations.map((name) => `'${name}'`).join(", ");
  const functionList = lifecycleFunctions.map((name) => `'${name}'`).join(", ");
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
           coalesce(access_method.amname, '') AS access_method
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      LEFT JOIN pg_am access_method ON access_method.oid = relation.relam
     WHERE namespace.nspname = 'public' AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
       AND relation.relname IN (${relationList})
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
     WHERE table_schema = 'public' AND table_name IN (${relationList})
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
     WHERE namespace.nspname = 'public' AND relation.relname IN (${relationList})
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
     WHERE catalog.schemaname = 'public' AND catalog.tablename IN (${relationList})
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
     WHERE namespace.nspname = 'public' AND relation.relname IN (${relationList})
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
           coalesce(array_to_string(procedure.proconfig, E'\\n'), '') AS configuration
      FROM pg_proc procedure
      JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
      JOIN pg_language language ON language.oid = procedure.prolang
     WHERE namespace.nspname = 'public' AND procedure.proname IN (${functionList})
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
          `${row.table_name}|${row.column_name}|${row.udt_name}|${row.is_nullable}|${normalize(
            row.column_default ?? ""
          )}`
      )
      .sort(),
    constraints: constraints.rows
      .map(
        (row) =>
          `${row.relation_name}|${row.object_name}|${row.constraint_type}|${normalize(
            row.definition
          )}|validated=${row.validated}`
      )
      .sort(),
    indexes: indexes.rows
      .map(
        (row) =>
          `${row.relation_name}|${row.object_name}|${normalize(row.definition)}|valid=${
            row.valid
          }|ready=${row.ready}`
      )
      .sort(),
    triggers: triggers.rows
      .map(
        (row) =>
          `${row.relation_name}|${row.object_name}|${normalize(row.definition)}|enabled=${
            row.enabled
          }`
      )
      .sort(),
    functions: functions.rows
      .map(
        (row) =>
          `${row.function_schema}|${row.function_name}|${normalize(
            row.identity_arguments
          )}|result=${normalize(row.result_type)}|definition=${normalize(
            row.definition
          )}|language=${row.language}|owner=${row.owner_name}|securityDefiner=${
            row.security_definer
          }|volatility=${row.volatility}|configuration=${normalize(row.configuration)}`
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

async function readExtensionCatalog(client: Client): Promise<ExtensionCatalogFingerprint> {
  const columns = await client.query<{
    table_name: string;
    column_name: string;
    udt_name: string;
    is_nullable: string;
    column_default: string | null;
  }>(`
    SELECT table_name, column_name, udt_name, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND (table_name, column_name) IN (
         ('bookings', 'lifecycle_revision'),
         ('flow_run_events', 'booking_lifecycle_event_id')
       )
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
     WHERE namespace.nspname = 'public'
       AND record.conname IN (
         'bookings_lifecycle_revision_check',
         'bookings_lifecycle_state_revision_check',
         'flow_run_events_booking_lifecycle_event_owner_fk',
         'flow_run_events_booking_lifecycle_provenance_check'
       )
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
     WHERE catalog.schemaname = 'public'
       AND catalog.indexname = 'flow_run_events_booking_lifecycle_run_unique'
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
     WHERE namespace.nspname = 'public'
       AND relation.relname = 'bookings'
       AND record.tgname = 'bookings_lifecycle_history_consistency'
       AND NOT record.tgisinternal
  `);
  const payload = {
    columns: columns.rows
      .map(
        (row) =>
          `${row.table_name}|${row.column_name}|${row.udt_name}|${row.is_nullable}|${normalize(
            row.column_default ?? ""
          )}`
      )
      .sort(),
    constraints: constraints.rows
      .map(
        (row) =>
          `${row.relation_name}|${row.object_name}|${row.constraint_type}|${normalize(
            row.definition
          )}|validated=${row.validated}`
      )
      .sort(),
    indexes: indexes.rows
      .map(
        (row) =>
          `${row.relation_name}|${row.object_name}|${normalize(row.definition)}|valid=${
            row.valid
          }|ready=${row.ready}`
      )
      .sort(),
    triggers: triggers.rows
      .map(
        (row) =>
          `${row.relation_name}|${row.object_name}|${normalize(row.definition)}|enabled=${
            row.enabled
          }`
      )
      .sort()
  };
  return {
    hash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    columns: payload.columns.length,
    constraints: payload.constraints.length,
    indexes: payload.indexes.length,
    triggers: payload.triggers.length,
    unvalidatedConstraints: constraints.rows.filter((row) => !row.validated).length,
    invalidIndexes: indexes.rows.filter((row) => !row.valid || !row.ready).length
  };
}

function matchesCatalog(actual: CatalogFingerprint, expected: CatalogFingerprint): boolean {
  return Object.entries(expected).every(
    ([key, value]) => actual[key as keyof CatalogFingerprint] === value
  );
}

function matchesExtension(
  actual: ExtensionCatalogFingerprint,
  expected: ExtensionCatalogFingerprint
): boolean {
  return Object.entries(expected).every(
    ([key, value]) => actual[key as keyof ExtensionCatalogFingerprint] === value
  );
}

function isAbsentCatalog(value: CatalogFingerprint): boolean {
  return (
    value.relations === 0 &&
    value.columns === 0 &&
    value.constraints === 0 &&
    value.indexes === 0 &&
    value.triggers === 0 &&
    value.functions === 0
  );
}

function isAbsentExtension(value: ExtensionCatalogFingerprint): boolean {
  return (
    value.columns === 0 && value.constraints === 0 && value.indexes === 0 && value.triggers === 0
  );
}

function driftError(catalog: CatalogFingerprint, extension: ExtensionCatalogFingerprint): Error {
  return new Error(
    `Refusing to reconcile a partial or drifted Flow Booking lifecycle catalog: catalog=${formatCatalog(
      catalog
    )} extension=${formatExtension(extension)}`
  );
}

function formatCatalog(value: CatalogFingerprint): string {
  return `${value.hash}[relations=${value.relations},columns=${value.columns},constraints=${value.constraints},indexes=${value.indexes},triggers=${value.triggers},functions=${value.functions},unvalidatedConstraints=${value.unvalidatedConstraints},invalidIndexes=${value.invalidIndexes}]`;
}

function formatExtension(value: ExtensionCatalogFingerprint): string {
  return `${value.hash}[columns=${value.columns},constraints=${value.constraints},indexes=${value.indexes},triggers=${value.triggers},unvalidatedConstraints=${value.unvalidatedConstraints},invalidIndexes=${value.invalidIndexes}]`;
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
