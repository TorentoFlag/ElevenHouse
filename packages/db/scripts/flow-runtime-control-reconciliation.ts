import { createHash } from "node:crypto";

import type { Client } from "pg";

import { flowRuntimeControlIntegritySql } from "../src/schema/flows/flow-runtime-control.schema";
import { flowRuntimeOwnerSubjectIntegritySql } from "../src/schema/flows/flow-runtime-subjects.schema";

type FlowRuntimeControlCatalogFingerprint = {
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

export type FlowRuntimeControlReconciliationResult = "already_current" | "reconciled";

const runtimeControlRelations = [
  "flow_runtime_control_authority",
  "flow_runtime_control_command_outcomes",
  "flow_runtime_control_commands",
  "flow_runtime_owner_subjects",
  "flow_runtime_rollout_policy_versions",
  "flow_worker_readiness_leases",
  "flow_worker_registrations",
  "flow_worker_registration_tombstones"
] as const;

const runtimeControlRelationPrefixes = [
  "flow_runtime_control_%",
  "flow_runtime_owner_%",
  "flow_runtime_rollout_policy_%",
  "flow_worker_readiness_%",
  "flow_worker_registration%"
] as const;

const runtimeControlFunctions = [
  "flow_canonical_runtime_control_jsonb_v1",
  "flow_enforce_runtime_control_command_transition",
  "flow_enforce_runtime_control_command_outcome_retention",
  "flow_enforce_runtime_control_authority_transition",
  "flow_enforce_runtime_owner_subject_erasure",
  "flow_prepare_runtime_control_command",
  "flow_prepare_runtime_control_command_outcome",
  "flow_prepare_runtime_owner_subject",
  "flow_prepare_worker_readiness_lease",
  "flow_prepare_worker_registration",
  "flow_prepare_worker_registration_tombstone",
  "flow_reject_runtime_control_command_truncate",
  "flow_reject_runtime_control_policy_mutation",
  "flow_reject_runtime_owner_subject_removal",
  "flow_reject_worker_registration_mutation",
  "flow_reject_worker_registration_tombstone_mutation",
  "flow_require_erased_runtime_owner_subject_not_current",
  "flow_require_runtime_control_policy_activation",
  "flow_require_runtime_control_command_outcome",
  "flow_runtime_rollout_policy_preimage_v1",
  "flow_validate_runtime_control_arrays",
  "flow_worker_registration_preimage_v1"
] as const;

const runtimeControlFunctionPrefixes = [
  "flow_canonical_runtime_control_%",
  "flow_enforce_runtime_control_%",
  "flow_prepare_runtime_control_%",
  "flow_prepare_runtime_owner_%",
  "flow_prepare_worker_readiness_%",
  "flow_prepare_worker_registration%",
  "flow_reject_runtime_control_%",
  "flow_reject_runtime_owner_%",
  "flow_reject_worker_registration%",
  "flow_require_runtime_control_%",
  "flow_runtime_control_%",
  "flow_runtime_owner_%",
  "flow_runtime_rollout_policy_%",
  "flow_validate_runtime_control_%"
] as const;

const currentRuntimeControlCatalog = {
  hash: "c4787c4a73bd415e52c651cdcfeda6d2596d6dce79ce3d2618b2bf6dc6b120c6",
  relations: 8,
  columns: 84,
  constraints: 46,
  indexes: 20,
  triggers: 23,
  functions: 22,
  unvalidatedConstraints: 0,
  invalidIndexes: 0
} as const satisfies FlowRuntimeControlCatalogFingerprint;

const generatedBaselineRuntimeControlCatalog = {
  hash: "c88103ddfc82d82ee548a766d1b308b621a50b8aa888a1eba1c29e7d9d536f3a",
  relations: 7,
  columns: 77,
  constraints: 43,
  indexes: 20,
  triggers: 0,
  functions: 0,
  unvalidatedConstraints: 0,
  invalidIndexes: 0
} as const satisfies FlowRuntimeControlCatalogFingerprint;

const generatedNamedRuntimeControlCatalog = {
  hash: "ae58f3b09beb1a32826e8f0e813063ec37296bbc3f291f242798d6a1129ef755",
  relations: 8,
  columns: 84,
  constraints: 46,
  indexes: 20,
  triggers: 0,
  functions: 0,
  unvalidatedConstraints: 0,
  invalidIndexes: 0
} as const satisfies FlowRuntimeControlCatalogFingerprint;

export async function reconcileFlowRuntimeControlAuthority(
  client: Client
): Promise<FlowRuntimeControlReconciliationResult> {
  await client.query("SAVEPOINT flow_runtime_control_reconciliation_guard");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('elevenhouse:flows:runtime-control:v2'))");
  const before = await readRuntimeControlCatalog(client);
  if (matchesRuntimeControlCatalog(before, currentRuntimeControlCatalog)) {
    if (await isRuntimeControlDataEmpty(client)) {
      await client.query(flowRuntimeControlBootstrapDataSql);
      await assertFlowRuntimeControlAuthorityData(client);
      await client.query("RELEASE SAVEPOINT flow_runtime_control_reconciliation_guard");
      return "reconciled";
    }
    await assertFlowRuntimeControlAuthorityData(client);
    await client.query("RELEASE SAVEPOINT flow_runtime_control_reconciliation_guard");
    return "already_current";
  }
  if (matchesRuntimeControlCatalog(before, generatedBaselineRuntimeControlCatalog)) {
    await assertGeneratedBaselineRuntimeControlIsEmpty(client);
    await client.query(flowRuntimeControlGeneratedBaselineUpgradeDdl);
  } else if (matchesRuntimeControlCatalog(before, generatedNamedRuntimeControlCatalog)) {
    await assertGeneratedBaselineRuntimeControlIsEmpty(client);
    await client.query(flowRuntimeControlGeneratedNamedBaselineUpgradeDdl);
  } else if (isAbsentRuntimeControlCatalog(before)) {
    await client.query(flowRuntimeControlAuthorityBaselineDdl);
  } else {
    throw driftError(before);
  }
  const after = await readRuntimeControlCatalog(client);
  if (!matchesRuntimeControlCatalog(after, currentRuntimeControlCatalog)) {
    throw new Error(
      `Flow runtime control reconciliation produced a drifted catalog; expected=${formatCatalog(
        currentRuntimeControlCatalog
      )} actual=${formatCatalog(after)}`
    );
  }
  await assertFlowRuntimeControlAuthorityData(client);
  await client.query("RELEASE SAVEPOINT flow_runtime_control_reconciliation_guard");
  return "reconciled";
}

export async function assertFlowRuntimeControlAuthority(client: Client): Promise<void> {
  const actual = await readRuntimeControlCatalog(client);
  if (!matchesRuntimeControlCatalog(actual, currentRuntimeControlCatalog)) {
    throw driftError(actual);
  }
  await assertFlowRuntimeControlAuthorityData(client);
}

const flowRuntimeControlBootstrapDataSql = `
INSERT INTO flow_runtime_rollout_policy_versions (
  revision, supersedes_revision, schema_version, mode, canary_owner_subject_ids,
  allowed_requirement_keys, enrollment_global_kill_switch,
  claim_global_kill_switch, external_dispatch_global_kill_switch,
  enrollment_killed_owner_subject_ids, claim_killed_owner_subject_ids,
  external_dispatch_killed_owner_subject_ids, enrollment_killed_capability_keys,
  claim_killed_capability_keys, external_dispatch_killed_capability_keys,
  readiness_lease_ttl_ms, token_lease_duration_ms, canonical_preimage,
  policy_digest, change_source, created_by_actor_subject_id, reason, created_at
) VALUES (
  1,
  null,
  'flow-runtime-rollout-policy.v2',
  'definition_only',
  array[]::uuid[],
  array[]::text[],
  true,
  true,
  true,
  array[]::uuid[],
  array[]::uuid[],
  array[]::uuid[],
  array[]::text[],
  array[]::text[],
  array[]::text[],
  30000,
  30000,
  '{"allowedRequirementKeys":[],"canaryOwnerSubjectIds":[],"killSwitches":{"claim":{"capabilityKeys":[],"global":true,"ownerSubjectIds":[]},"enrollment":{"capabilityKeys":[],"global":true,"ownerSubjectIds":[]},"externalDispatch":{"capabilityKeys":[],"global":true,"ownerSubjectIds":[]}},"mode":"definition_only","readinessLeaseTtlMs":30000,"schemaVersion":"flow-runtime-rollout-policy.v2","tokenLeaseDurationMs":30000}',
  'sha256:8f179908494865d038955f31b1adfc69b1448e36d69a1f4eda3bfee8201f9f4c',
  'bootstrap',
  null,
  'Initial fail-closed Flow runtime authority',
  clock_timestamp()
);

INSERT INTO flow_runtime_control_authority (
  authority_key, current_policy_revision, control_revision, change_source,
  updated_by_actor_subject_id, reason, updated_at
) VALUES (
  'primary',
  1,
  1,
  'bootstrap',
  null,
  'Initial fail-closed Flow runtime authority',
  clock_timestamp()
);
`;

async function isRuntimeControlDataEmpty(client: Client): Promise<boolean> {
  const result = await client.query<{ populated_relation_count: string }>(`
    SELECT (
      (CASE WHEN EXISTS (SELECT 1 FROM flow_runtime_owner_subjects) THEN 1 ELSE 0 END)
      + (CASE WHEN EXISTS (SELECT 1 FROM flow_runtime_control_commands) THEN 1 ELSE 0 END)
      + (CASE WHEN EXISTS (SELECT 1 FROM flow_runtime_control_command_outcomes) THEN 1 ELSE 0 END)
      + (CASE WHEN EXISTS (SELECT 1 FROM flow_runtime_rollout_policy_versions) THEN 1 ELSE 0 END)
      + (CASE WHEN EXISTS (SELECT 1 FROM flow_runtime_control_authority) THEN 1 ELSE 0 END)
      + (CASE WHEN EXISTS (SELECT 1 FROM flow_worker_registrations) THEN 1 ELSE 0 END)
      + (CASE WHEN EXISTS (SELECT 1 FROM flow_worker_readiness_leases) THEN 1 ELSE 0 END)
      + (CASE WHEN EXISTS (SELECT 1 FROM flow_worker_registration_tombstones) THEN 1 ELSE 0 END)
    )::text AS populated_relation_count
  `);
  return result.rows[0]?.populated_relation_count === "0";
}

export const flowRuntimeControlAuthorityBaselineDdl = `
CREATE TABLE flow_runtime_owner_subjects (
  owner_subject_id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  owner_user_id uuid,
  state text DEFAULT 'active' NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  erased_at timestamp with time zone,
  CONSTRAINT flow_runtime_owner_subjects_user_fk
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT flow_runtime_owner_subjects_shape_check CHECK (
    (state = 'active' AND owner_user_id IS NOT NULL AND erased_at IS NULL)
    OR (state = 'erased' AND owner_user_id IS NULL AND erased_at IS NOT NULL
      AND erased_at >= created_at)
  )
);

CREATE TABLE flow_runtime_control_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  schema_version text DEFAULT 'flow-runtime-control-replace-policy-command.v1' NOT NULL,
  actor_subject_id uuid NOT NULL,
  command_scope text DEFAULT 'flows.runtime-control.replace-policy.v1' NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  request_hash varchar(71) NOT NULL,
  expected_revision integer NOT NULL,
  target_revision integer NOT NULL,
  requested_policy_digest varchar(71) NOT NULL,
  reason text NOT NULL,
  state text DEFAULT 'processing' NOT NULL,
  completed_at timestamp with time zone,
  replay_until timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT flow_runtime_control_commands_identity_check CHECK (
    schema_version = 'flow-runtime-control-replace-policy-command.v1'
    AND command_scope = 'flows.runtime-control.replace-policy.v1'
    AND length(idempotency_key) BETWEEN 8 AND 128
    AND idempotency_key ~ '^[A-Za-z0-9._:-]+$'
  ),
  CONSTRAINT flow_runtime_control_commands_revision_check CHECK (
    expected_revision > 0 AND target_revision = expected_revision + 1
  ),
  CONSTRAINT flow_runtime_control_commands_evidence_check CHECK (
    request_hash ~ '^sha256:[a-f0-9]{64}$'
    AND requested_policy_digest ~ '^sha256:[a-f0-9]{64}$'
  ),
  CONSTRAINT flow_runtime_control_commands_reason_check CHECK (
    length(trim(reason)) BETWEEN 1 AND 500
    AND reason = trim(reason)
    AND reason !~ '[[:cntrl:]]'
  ),
  CONSTRAINT flow_runtime_control_commands_state_check CHECK (
    (state = 'processing' AND completed_at IS NULL)
    OR (state IN ('succeeded', 'failed') AND completed_at IS NOT NULL)
  ),
  CONSTRAINT flow_runtime_control_commands_time_check CHECK (
    replay_until = created_at + interval '24 hours'
    AND updated_at >= created_at
    AND (completed_at IS NULL OR (completed_at >= created_at AND completed_at = updated_at))
  )
);

CREATE TABLE flow_runtime_control_command_outcomes (
  command_id uuid PRIMARY KEY NOT NULL,
  result_kind text NOT NULL,
  current_revision integer NOT NULL,
  policy_revision integer,
  requested_policy_canonical_preimage text NOT NULL,
  requested_policy_digest varchar(71) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT flow_runtime_control_command_outcomes_shape_check CHECK (
    current_revision > 0
    AND length(requested_policy_canonical_preimage) BETWEEN 1 AND 300000
    AND requested_policy_digest ~ '^sha256:[a-f0-9]{64}$'
    AND (
      (result_kind = 'applied'
        AND policy_revision = current_revision)
      OR (result_kind = 'revision_conflict'
        AND policy_revision IS NULL)
    )
  )
);

CREATE TABLE flow_runtime_rollout_policy_versions (
  revision integer PRIMARY KEY NOT NULL,
  supersedes_revision integer,
  command_id uuid,
  schema_version text DEFAULT 'flow-runtime-rollout-policy.v2' NOT NULL,
  mode text NOT NULL,
  canary_owner_subject_ids uuid[] DEFAULT array[]::uuid[] NOT NULL,
  allowed_requirement_keys text[] DEFAULT array[]::text[] NOT NULL,
  enrollment_global_kill_switch boolean DEFAULT true NOT NULL,
  claim_global_kill_switch boolean DEFAULT true NOT NULL,
  external_dispatch_global_kill_switch boolean DEFAULT true NOT NULL,
  enrollment_killed_owner_subject_ids uuid[] DEFAULT array[]::uuid[] NOT NULL,
  claim_killed_owner_subject_ids uuid[] DEFAULT array[]::uuid[] NOT NULL,
  external_dispatch_killed_owner_subject_ids uuid[] DEFAULT array[]::uuid[] NOT NULL,
  enrollment_killed_capability_keys text[] DEFAULT array[]::text[] NOT NULL,
  claim_killed_capability_keys text[] DEFAULT array[]::text[] NOT NULL,
  external_dispatch_killed_capability_keys text[] DEFAULT array[]::text[] NOT NULL,
  readiness_lease_ttl_ms integer DEFAULT 30000 NOT NULL,
  token_lease_duration_ms integer DEFAULT 30000 NOT NULL,
  canonical_preimage text NOT NULL,
  policy_digest varchar(71) NOT NULL,
  change_source text NOT NULL,
  created_by_actor_subject_id uuid,
  reason text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT flow_runtime_rollout_policy_versions_schema_check CHECK (
    schema_version = 'flow-runtime-rollout-policy.v2' AND revision > 0
  ),
  CONSTRAINT flow_runtime_rollout_policy_versions_history_check CHECK (
    (revision = 1 AND supersedes_revision IS NULL)
    OR (revision > 1 AND supersedes_revision = revision - 1)
  ),
  CONSTRAINT flow_runtime_rollout_policy_versions_shape_check CHECK (
    mode IN ('definition_only', 'canary', 'enabled')
    AND cardinality(canary_owner_subject_ids) BETWEEN 0 AND 100
    AND array_position(canary_owner_subject_ids, null) IS NULL
    AND ((mode = 'canary' AND cardinality(canary_owner_subject_ids) BETWEEN 1 AND 100)
      OR (mode IN ('definition_only', 'enabled') AND cardinality(canary_owner_subject_ids) = 0))
  ),
  CONSTRAINT flow_runtime_rollout_policy_versions_requirements_check CHECK (
    cardinality(allowed_requirement_keys) BETWEEN 0 AND 256
    AND array_position(allowed_requirement_keys, null) IS NULL
    AND (cardinality(allowed_requirement_keys) = 0
      OR array_to_string(allowed_requirement_keys, E'\n')
        ~ '^[a-z0-9][a-z0-9._:-]*(\n[a-z0-9][a-z0-9._:-]*)*$')
    AND (mode = 'definition_only' OR cardinality(allowed_requirement_keys) BETWEEN 1 AND 256)
  ),
  CONSTRAINT flow_runtime_rollout_policy_versions_kill_scope_check CHECK (
    cardinality(enrollment_killed_owner_subject_ids) BETWEEN 0 AND 100
    AND cardinality(claim_killed_owner_subject_ids) BETWEEN 0 AND 100
    AND cardinality(external_dispatch_killed_owner_subject_ids) BETWEEN 0 AND 100
    AND array_position(enrollment_killed_owner_subject_ids, null) IS NULL
    AND array_position(claim_killed_owner_subject_ids, null) IS NULL
    AND array_position(external_dispatch_killed_owner_subject_ids, null) IS NULL
    AND cardinality(enrollment_killed_capability_keys) BETWEEN 0 AND 256
    AND cardinality(claim_killed_capability_keys) BETWEEN 0 AND 256
    AND cardinality(external_dispatch_killed_capability_keys) BETWEEN 0 AND 256
    AND array_position(enrollment_killed_capability_keys, null) IS NULL
    AND array_position(claim_killed_capability_keys, null) IS NULL
    AND array_position(external_dispatch_killed_capability_keys, null) IS NULL
    AND (cardinality(enrollment_killed_capability_keys) = 0
      OR array_to_string(enrollment_killed_capability_keys, E'\n')
        ~ '^[a-z0-9][a-z0-9._:-]*(\n[a-z0-9][a-z0-9._:-]*)*$')
    AND (cardinality(claim_killed_capability_keys) = 0
      OR array_to_string(claim_killed_capability_keys, E'\n')
        ~ '^[a-z0-9][a-z0-9._:-]*(\n[a-z0-9][a-z0-9._:-]*)*$')
    AND (cardinality(external_dispatch_killed_capability_keys) = 0
      OR array_to_string(external_dispatch_killed_capability_keys, E'\n')
        ~ '^[a-z0-9][a-z0-9._:-]*(\n[a-z0-9][a-z0-9._:-]*)*$')
  ),
  CONSTRAINT flow_runtime_rollout_policy_versions_lease_check CHECK (
    readiness_lease_ttl_ms BETWEEN 5000 AND 60000
    AND token_lease_duration_ms BETWEEN 5000 AND 300000
  ),
  CONSTRAINT flow_runtime_rollout_policy_versions_digest_check CHECK (
    length(canonical_preimage) BETWEEN 1 AND 300000
    AND policy_digest ~ '^sha256:[a-f0-9]{64}$'
  ),
  CONSTRAINT flow_runtime_rollout_policy_versions_source_check CHECK (
    (revision = 1 AND change_source = 'bootstrap'
      AND created_by_actor_subject_id IS NULL AND command_id IS NULL)
    OR (revision > 1 AND change_source = 'admin'
      AND created_by_actor_subject_id IS NOT NULL AND command_id IS NOT NULL)
  ),
  CONSTRAINT flow_runtime_rollout_policy_versions_reason_check CHECK (
    length(trim(reason)) BETWEEN 1 AND 500
    AND reason = trim(reason)
    AND reason !~ '[[:cntrl:]]'
  )
);

CREATE TABLE flow_runtime_control_authority (
  authority_key varchar(32) PRIMARY KEY NOT NULL,
  current_policy_revision integer NOT NULL,
  control_revision integer NOT NULL,
  last_command_id uuid,
  change_source text NOT NULL,
  updated_by_actor_subject_id uuid,
  reason text NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT flow_runtime_control_authority_shape_check CHECK (
    authority_key = 'primary'
    AND current_policy_revision > 0
    AND control_revision = current_policy_revision
    AND length(trim(reason)) BETWEEN 1 AND 500
    AND reason = trim(reason)
    AND reason !~ '[[:cntrl:]]'
  ),
  CONSTRAINT flow_runtime_control_authority_source_check CHECK (
    (control_revision = 1 AND change_source = 'bootstrap'
      AND updated_by_actor_subject_id IS NULL AND last_command_id IS NULL)
    OR (control_revision > 1 AND change_source = 'admin'
      AND updated_by_actor_subject_id IS NOT NULL AND last_command_id IS NOT NULL)
  )
);

CREATE TABLE flow_worker_registrations (
  session_id uuid PRIMARY KEY NOT NULL,
  instance_id varchar(180) NOT NULL,
  roles text[] NOT NULL,
  max_runtime_mode text NOT NULL,
  max_canary_owner_subject_ids uuid[] DEFAULT array[]::uuid[] NOT NULL,
  requirement_keys text[] NOT NULL,
  deployment_id varchar(180) NOT NULL,
  build_id varchar(180) NOT NULL,
  protocol_version varchar(80) DEFAULT 'flow-worker-runtime.v2' NOT NULL,
  registration_digest varchar(71) NOT NULL,
  started_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT flow_worker_registrations_identity_check CHECK (
    length(trim(instance_id)) BETWEEN 1 AND 180
    AND instance_id = trim(instance_id)
    AND instance_id ~ '^[A-Za-z0-9._:-]+$'
    AND length(trim(deployment_id)) BETWEEN 1 AND 180
    AND deployment_id = trim(deployment_id)
    AND deployment_id ~ '^[A-Za-z0-9._:-]+$'
    AND length(trim(build_id)) BETWEEN 1 AND 180
    AND build_id = trim(build_id)
    AND build_id ~ '^[A-Za-z0-9._:-]+$'
    AND protocol_version = 'flow-worker-runtime.v2'
  ),
  CONSTRAINT flow_worker_registrations_roles_check CHECK (
    cardinality(roles) BETWEEN 1 AND 3
    AND array_position(roles, null) IS NULL
    AND roles <@ array['enrollment', 'executor', 'external_dispatcher']::text[]
  ),
  CONSTRAINT flow_worker_registrations_scope_check CHECK (
    max_runtime_mode IN ('definition_only', 'canary', 'enabled')
    AND cardinality(max_canary_owner_subject_ids) BETWEEN 0 AND 100
    AND array_position(max_canary_owner_subject_ids, null) IS NULL
    AND ((max_runtime_mode = 'canary'
        AND cardinality(max_canary_owner_subject_ids) BETWEEN 1 AND 100)
      OR (max_runtime_mode IN ('definition_only', 'enabled')
        AND cardinality(max_canary_owner_subject_ids) = 0))
  ),
  CONSTRAINT flow_worker_registrations_requirements_check CHECK (
    cardinality(requirement_keys) BETWEEN 1 AND 256
    AND array_position(requirement_keys, null) IS NULL
    AND array_to_string(requirement_keys, E'\n')
      ~ '^[a-z0-9][a-z0-9._:-]*(\n[a-z0-9][a-z0-9._:-]*)*$'
  ),
  CONSTRAINT flow_worker_registrations_digest_check CHECK (
    registration_digest ~ '^sha256:[a-f0-9]{64}$'
  )
);

CREATE TABLE flow_worker_registration_tombstones (
  session_id uuid PRIMARY KEY NOT NULL,
  schema_version text DEFAULT 'flow-worker-registration-tombstone.v1' NOT NULL,
  registration_digest varchar(71) NOT NULL,
  retirement_reason text NOT NULL,
  retired_at timestamp with time zone DEFAULT now() NOT NULL,
  purge_after timestamp with time zone NOT NULL,
  CONSTRAINT flow_worker_registration_tombstones_shape_check CHECK (
    schema_version = 'flow-worker-registration-tombstone.v1'
    AND registration_digest ~ '^sha256:[a-f0-9]{64}$'
    AND retirement_reason IN ('explicit_drain', 'replaced', 'stale_expired')
    AND purge_after = retired_at + interval '30 days'
  )
);

CREATE TABLE flow_worker_readiness_leases (
  instance_id varchar(180) PRIMARY KEY NOT NULL,
  session_id uuid NOT NULL,
  state text DEFAULT 'ready' NOT NULL,
  policy_revision integer NOT NULL,
  heartbeat_sequence integer DEFAULT 1 NOT NULL,
  heartbeat_at timestamp with time zone DEFAULT now() NOT NULL,
  ready_until timestamp with time zone NOT NULL,
  draining_at timestamp with time zone,
  CONSTRAINT flow_worker_readiness_leases_identity_check CHECK (
    length(trim(instance_id)) BETWEEN 1 AND 180
    AND instance_id = trim(instance_id)
    AND instance_id ~ '^[A-Za-z0-9._:-]+$'
    AND policy_revision > 0
    AND heartbeat_sequence > 0
  ),
  CONSTRAINT flow_worker_readiness_leases_time_check CHECK (
    state IN ('ready', 'draining')
    AND ((state = 'ready'
        AND draining_at IS NULL
        AND ready_until > heartbeat_at
        AND ready_until <= heartbeat_at + interval '60 seconds')
      OR (state = 'draining'
        AND draining_at IS NOT NULL
        AND ready_until = draining_at
        AND heartbeat_at = draining_at))
  )
);

ALTER TABLE flow_runtime_control_commands
  ADD CONSTRAINT flow_runtime_control_commands_actor_fk
  FOREIGN KEY (actor_subject_id) REFERENCES audit_actor_subjects(actor_subject_id)
  ON DELETE RESTRICT;
ALTER TABLE flow_runtime_control_command_outcomes
  ADD CONSTRAINT flow_runtime_control_command_outcomes_command_fk
  FOREIGN KEY (command_id) REFERENCES flow_runtime_control_commands(id) ON DELETE RESTRICT;
ALTER TABLE flow_runtime_rollout_policy_versions
  ADD CONSTRAINT flow_runtime_rollout_policy_versions_supersedes_fk
  FOREIGN KEY (supersedes_revision)
  REFERENCES flow_runtime_rollout_policy_versions(revision) ON DELETE RESTRICT;
ALTER TABLE flow_runtime_rollout_policy_versions
  ADD CONSTRAINT flow_runtime_rollout_policy_versions_actor_fk
  FOREIGN KEY (created_by_actor_subject_id) REFERENCES audit_actor_subjects(actor_subject_id)
  ON DELETE RESTRICT;
ALTER TABLE flow_runtime_rollout_policy_versions
  ADD CONSTRAINT flow_runtime_rollout_policy_versions_command_fk
  FOREIGN KEY (command_id) REFERENCES flow_runtime_control_commands(id) ON DELETE RESTRICT;
ALTER TABLE flow_runtime_control_authority
  ADD CONSTRAINT flow_runtime_control_authority_policy_fk
  FOREIGN KEY (current_policy_revision)
  REFERENCES flow_runtime_rollout_policy_versions(revision) ON DELETE RESTRICT;
ALTER TABLE flow_runtime_control_authority
  ADD CONSTRAINT flow_runtime_control_authority_actor_fk
  FOREIGN KEY (updated_by_actor_subject_id) REFERENCES audit_actor_subjects(actor_subject_id)
  ON DELETE RESTRICT;
ALTER TABLE flow_runtime_control_authority
  ADD CONSTRAINT flow_runtime_control_authority_command_fk
  FOREIGN KEY (last_command_id) REFERENCES flow_runtime_control_commands(id) ON DELETE RESTRICT;
ALTER TABLE flow_worker_readiness_leases
  ADD CONSTRAINT flow_worker_readiness_leases_registration_fk
  FOREIGN KEY (session_id)
  REFERENCES flow_worker_registrations(session_id) ON DELETE RESTRICT;
ALTER TABLE flow_worker_readiness_leases
  ADD CONSTRAINT flow_worker_readiness_leases_policy_fk
  FOREIGN KEY (policy_revision)
  REFERENCES flow_runtime_rollout_policy_versions(revision) ON DELETE RESTRICT;

CREATE UNIQUE INDEX flow_runtime_control_commands_scope_key_unique
  ON flow_runtime_control_commands (command_scope, actor_subject_id, idempotency_key);
CREATE INDEX flow_runtime_control_commands_replay_until_idx
  ON flow_runtime_control_commands (replay_until);
CREATE INDEX flow_runtime_control_commands_target_created_idx
  ON flow_runtime_control_commands (target_revision, created_at, id);
CREATE INDEX flow_runtime_control_command_outcomes_created_idx
  ON flow_runtime_control_command_outcomes (created_at);
CREATE UNIQUE INDEX flow_runtime_rollout_policy_versions_command_unique
  ON flow_runtime_rollout_policy_versions (command_id);
CREATE INDEX flow_runtime_rollout_policy_versions_mode_created_idx
  ON flow_runtime_rollout_policy_versions (mode, created_at, revision);
CREATE UNIQUE INDEX flow_worker_readiness_leases_session_unique
  ON flow_worker_readiness_leases (session_id);
CREATE INDEX flow_worker_readiness_leases_ready_idx
  ON flow_worker_readiness_leases (state, policy_revision, ready_until, instance_id);
CREATE INDEX flow_worker_registrations_instance_started_idx
  ON flow_worker_registrations (instance_id, started_at);
CREATE INDEX flow_worker_registration_tombstones_purge_idx
  ON flow_worker_registration_tombstones (purge_after, session_id);
CREATE UNIQUE INDEX flow_runtime_owner_subjects_user_unique
  ON flow_runtime_owner_subjects (owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE INDEX flow_runtime_owner_subjects_state_created_idx
  ON flow_runtime_owner_subjects (state, created_at, owner_subject_id);

${flowRuntimeOwnerSubjectIntegritySql}
${flowRuntimeControlIntegritySql}

INSERT INTO flow_runtime_rollout_policy_versions (
  revision, supersedes_revision, schema_version, mode, canary_owner_subject_ids,
  allowed_requirement_keys, enrollment_global_kill_switch,
  claim_global_kill_switch, external_dispatch_global_kill_switch,
  enrollment_killed_owner_subject_ids, claim_killed_owner_subject_ids,
  external_dispatch_killed_owner_subject_ids, enrollment_killed_capability_keys,
  claim_killed_capability_keys, external_dispatch_killed_capability_keys,
  readiness_lease_ttl_ms, token_lease_duration_ms, canonical_preimage,
  policy_digest, change_source, created_by_actor_subject_id, reason, created_at
) VALUES (
  1,
  null,
  'flow-runtime-rollout-policy.v2',
  'definition_only',
  array[]::uuid[],
  array[]::text[],
  true,
  true,
  true,
  array[]::uuid[],
  array[]::uuid[],
  array[]::uuid[],
  array[]::text[],
  array[]::text[],
  array[]::text[],
  30000,
  30000,
  '{"allowedRequirementKeys":[],"canaryOwnerSubjectIds":[],"killSwitches":{"claim":{"capabilityKeys":[],"global":true,"ownerSubjectIds":[]},"enrollment":{"capabilityKeys":[],"global":true,"ownerSubjectIds":[]},"externalDispatch":{"capabilityKeys":[],"global":true,"ownerSubjectIds":[]}},"mode":"definition_only","readinessLeaseTtlMs":30000,"schemaVersion":"flow-runtime-rollout-policy.v2","tokenLeaseDurationMs":30000}',
  'sha256:8f179908494865d038955f31b1adfc69b1448e36d69a1f4eda3bfee8201f9f4c',
  'bootstrap',
  null,
  'Initial fail-closed Flow runtime authority',
  clock_timestamp()
);

INSERT INTO flow_runtime_control_authority (
  authority_key, current_policy_revision, control_revision, change_source,
  updated_by_actor_subject_id, reason, updated_at
) VALUES (
  'primary',
  1,
  1,
  'bootstrap',
  null,
  'Initial fail-closed Flow runtime authority',
  clock_timestamp()
);
`;

const flowRuntimeControlGeneratedBaselineUpgradeDdl = `
ALTER TABLE flow_runtime_owner_subjects
  RENAME CONSTRAINT flow_runtime_owner_subjects_owner_user_id_users_id_fk
  TO flow_runtime_owner_subjects_user_fk;
ALTER TABLE flow_runtime_control_commands
  RENAME CONSTRAINT flow_runtime_control_commands_actor_subject_id_audit_actor_subjects_actor_subject_id_fk
  TO flow_runtime_control_commands_actor_fk;

DROP INDEX flow_worker_registrations_roles_gin_idx;
DROP INDEX flow_worker_registrations_requirements_gin_idx;

ALTER TABLE flow_worker_registrations
  ADD COLUMN registration_digest varchar(71) NOT NULL;
ALTER TABLE flow_worker_registrations
  ADD CONSTRAINT flow_worker_registrations_digest_check
  CHECK (registration_digest ~ '^sha256:[a-f0-9]{64}$');

CREATE TABLE flow_worker_registration_tombstones (
  session_id uuid PRIMARY KEY NOT NULL,
  schema_version text DEFAULT 'flow-worker-registration-tombstone.v1' NOT NULL,
  registration_digest varchar(71) NOT NULL,
  retirement_reason text NOT NULL,
  retired_at timestamp with time zone DEFAULT now() NOT NULL,
  purge_after timestamp with time zone NOT NULL,
  CONSTRAINT flow_worker_registration_tombstones_shape_check CHECK (
    schema_version = 'flow-worker-registration-tombstone.v1'
    AND registration_digest ~ '^sha256:[a-f0-9]{64}$'
    AND retirement_reason IN ('explicit_drain', 'replaced', 'stale_expired')
    AND purge_after = retired_at + interval '30 days'
  )
);
CREATE INDEX flow_worker_registration_tombstones_purge_idx
  ON flow_worker_registration_tombstones (purge_after, session_id);

${flowRuntimeOwnerSubjectIntegritySql}
${flowRuntimeControlIntegritySql}

INSERT INTO flow_runtime_rollout_policy_versions (
  revision, supersedes_revision, schema_version, mode, canary_owner_subject_ids,
  allowed_requirement_keys, enrollment_global_kill_switch,
  claim_global_kill_switch, external_dispatch_global_kill_switch,
  enrollment_killed_owner_subject_ids, claim_killed_owner_subject_ids,
  external_dispatch_killed_owner_subject_ids, enrollment_killed_capability_keys,
  claim_killed_capability_keys, external_dispatch_killed_capability_keys,
  readiness_lease_ttl_ms, token_lease_duration_ms, canonical_preimage,
  policy_digest, change_source, created_by_actor_subject_id, reason, created_at
) VALUES (
  1,
  null,
  'flow-runtime-rollout-policy.v2',
  'definition_only',
  array[]::uuid[],
  array[]::text[],
  true,
  true,
  true,
  array[]::uuid[],
  array[]::uuid[],
  array[]::uuid[],
  array[]::text[],
  array[]::text[],
  array[]::text[],
  30000,
  30000,
  '{"allowedRequirementKeys":[],"canaryOwnerSubjectIds":[],"killSwitches":{"claim":{"capabilityKeys":[],"global":true,"ownerSubjectIds":[]},"enrollment":{"capabilityKeys":[],"global":true,"ownerSubjectIds":[]},"externalDispatch":{"capabilityKeys":[],"global":true,"ownerSubjectIds":[]}},"mode":"definition_only","readinessLeaseTtlMs":30000,"schemaVersion":"flow-runtime-rollout-policy.v2","tokenLeaseDurationMs":30000}',
  'sha256:8f179908494865d038955f31b1adfc69b1448e36d69a1f4eda3bfee8201f9f4c',
  'bootstrap',
  null,
  'Initial fail-closed Flow runtime authority',
  clock_timestamp()
);

INSERT INTO flow_runtime_control_authority (
  authority_key, current_policy_revision, control_revision, change_source,
  updated_by_actor_subject_id, reason, updated_at
) VALUES (
  'primary',
  1,
  1,
  'bootstrap',
  null,
  'Initial fail-closed Flow runtime authority',
  clock_timestamp()
);
`;

const flowRuntimeControlGeneratedNamedBaselineUpgradeDdl = `
${flowRuntimeOwnerSubjectIntegritySql}
${flowRuntimeControlIntegritySql}

INSERT INTO flow_runtime_rollout_policy_versions (
  revision, supersedes_revision, schema_version, mode, canary_owner_subject_ids,
  allowed_requirement_keys, enrollment_global_kill_switch,
  claim_global_kill_switch, external_dispatch_global_kill_switch,
  enrollment_killed_owner_subject_ids, claim_killed_owner_subject_ids,
  external_dispatch_killed_owner_subject_ids, enrollment_killed_capability_keys,
  claim_killed_capability_keys, external_dispatch_killed_capability_keys,
  readiness_lease_ttl_ms, token_lease_duration_ms, canonical_preimage,
  policy_digest, change_source, created_by_actor_subject_id, reason, created_at
) VALUES (
  1,
  null,
  'flow-runtime-rollout-policy.v2',
  'definition_only',
  array[]::uuid[],
  array[]::text[],
  true,
  true,
  true,
  array[]::uuid[],
  array[]::uuid[],
  array[]::uuid[],
  array[]::text[],
  array[]::text[],
  array[]::text[],
  30000,
  30000,
  '{"allowedRequirementKeys":[],"canaryOwnerSubjectIds":[],"killSwitches":{"claim":{"capabilityKeys":[],"global":true,"ownerSubjectIds":[]},"enrollment":{"capabilityKeys":[],"global":true,"ownerSubjectIds":[]},"externalDispatch":{"capabilityKeys":[],"global":true,"ownerSubjectIds":[]}},"mode":"definition_only","readinessLeaseTtlMs":30000,"schemaVersion":"flow-runtime-rollout-policy.v2","tokenLeaseDurationMs":30000}',
  'sha256:8f179908494865d038955f31b1adfc69b1448e36d69a1f4eda3bfee8201f9f4c',
  'bootstrap',
  null,
  'Initial fail-closed Flow runtime authority',
  clock_timestamp()
);

INSERT INTO flow_runtime_control_authority (
  authority_key, current_policy_revision, control_revision, change_source,
  updated_by_actor_subject_id, reason, updated_at
) VALUES (
  'primary',
  1,
  1,
  'bootstrap',
  null,
  'Initial fail-closed Flow runtime authority',
  clock_timestamp()
);
`;

async function assertGeneratedBaselineRuntimeControlIsEmpty(client: Client): Promise<void> {
  const result = await client.query<{ populated_relation_count: string }>(`
    SELECT (
      (CASE WHEN EXISTS (SELECT 1 FROM flow_runtime_owner_subjects) THEN 1 ELSE 0 END)
      + (CASE WHEN EXISTS (SELECT 1 FROM flow_runtime_control_commands) THEN 1 ELSE 0 END)
      + (CASE WHEN EXISTS (SELECT 1 FROM flow_runtime_control_command_outcomes) THEN 1 ELSE 0 END)
      + (CASE WHEN EXISTS (SELECT 1 FROM flow_runtime_rollout_policy_versions) THEN 1 ELSE 0 END)
      + (CASE WHEN EXISTS (SELECT 1 FROM flow_runtime_control_authority) THEN 1 ELSE 0 END)
      + (CASE WHEN EXISTS (SELECT 1 FROM flow_worker_registrations) THEN 1 ELSE 0 END)
      + (CASE WHEN EXISTS (SELECT 1 FROM flow_worker_readiness_leases) THEN 1 ELSE 0 END)
      + (CASE WHEN EXISTS (SELECT 1 FROM flow_worker_registration_tombstones) THEN 1 ELSE 0 END)
    )::text AS populated_relation_count
  `);
  if (result.rows[0]?.populated_relation_count !== "0") {
    throw new Error(
      "Refusing to upgrade a generated Flow runtime control baseline after runtime data was written"
    );
  }
}

async function assertFlowRuntimeControlAuthorityData(client: Client): Promise<void> {
  const result = await client.query<{
    authority_count: string;
    target_count: string;
    current_revision: number | null;
    maximum_revision: number | null;
    bootstrap_count: string;
    invalid_policy_evidence_count: string;
    invalid_command_count: string;
    invalid_registration_count: string;
    invalid_current_subject_count: string;
    invalid_readiness_count: string;
  }>(`
    SELECT
      (SELECT count(*)::text
         FROM flow_runtime_control_authority
        WHERE authority_key = 'primary') AS authority_count,
      (SELECT count(*)::text
         FROM flow_runtime_control_authority authority
         JOIN flow_runtime_rollout_policy_versions policy
           ON policy.revision = authority.current_policy_revision
        WHERE authority.authority_key = 'primary') AS target_count
      ,(SELECT current_policy_revision
          FROM flow_runtime_control_authority
         WHERE authority_key = 'primary') AS current_revision
      ,(SELECT max(revision) FROM flow_runtime_rollout_policy_versions) AS maximum_revision
      ,(SELECT count(*)::text
          FROM flow_runtime_rollout_policy_versions
         WHERE revision = 1
           AND supersedes_revision IS NULL
           AND mode = 'definition_only'
           AND cardinality(canary_owner_subject_ids) = 0
           AND cardinality(allowed_requirement_keys) = 0
           AND enrollment_global_kill_switch
           AND claim_global_kill_switch
           AND external_dispatch_global_kill_switch
           AND policy_digest = 'sha256:8f179908494865d038955f31b1adfc69b1448e36d69a1f4eda3bfee8201f9f4c'
           AND change_source = 'bootstrap'
           AND created_by_actor_subject_id IS NULL) AS bootstrap_count
      ,(SELECT count(*)::text
          FROM flow_runtime_rollout_policy_versions policy
         WHERE policy.canonical_preimage <> flow_runtime_rollout_policy_preimage_v1(policy)
            OR policy.policy_digest <>
              'sha256:' || encode(digest(policy.canonical_preimage, 'sha256'), 'hex'))
        AS invalid_policy_evidence_count
      ,(SELECT count(*)::text
          FROM flow_runtime_control_commands command
          LEFT JOIN flow_runtime_control_command_outcomes outcome
            ON outcome.command_id = command.id
         WHERE command.state = 'processing'
            OR NOT EXISTS (
              SELECT 1 FROM audit_actor_subjects actor
               WHERE actor.actor_subject_id = command.actor_subject_id
            )
            OR (clock_timestamp() < command.replay_until AND outcome.command_id IS NULL)
            OR (command.state = 'succeeded' AND NOT EXISTS (
              SELECT 1
                FROM flow_runtime_rollout_policy_versions policy
               WHERE policy.command_id = command.id
                 AND policy.revision = command.target_revision
                 AND policy.supersedes_revision = command.expected_revision
                 AND policy.policy_digest = command.requested_policy_digest
            ))
            OR (command.state = 'failed' AND EXISTS (
              SELECT 1 FROM flow_runtime_rollout_policy_versions policy
               WHERE policy.command_id = command.id
            ))
            OR (outcome.command_id IS NOT NULL AND (
              outcome.created_at < command.created_at
              OR outcome.created_at > command.completed_at
              OR outcome.requested_policy_canonical_preimage <>
                   flow_canonical_runtime_control_jsonb_v1(
                     outcome.requested_policy_canonical_preimage::jsonb
                   )
              OR outcome.requested_policy_digest <>
                   'sha256:' || encode(
                     digest(outcome.requested_policy_canonical_preimage, 'sha256'),
                     'hex'
                   )
              OR outcome.requested_policy_digest <> command.requested_policy_digest
              OR command.request_hash <>
                   'sha256:' || encode(digest(
                     flow_canonical_runtime_control_jsonb_v1(jsonb_build_object(
                       'schemaVersion', command.schema_version,
                       'actorSubjectId', command.actor_subject_id::text,
                       'expectedRevision', command.expected_revision,
                       'targetRevision', command.target_revision,
                       'policy', outcome.requested_policy_canonical_preimage::jsonb,
                       'reason', command.reason
                     )),
                     'sha256'
                   ), 'hex')
              OR (command.state = 'succeeded' AND (
                outcome.result_kind <> 'applied'
                OR outcome.current_revision <> command.target_revision
                OR outcome.policy_revision <> command.target_revision
              ))
              OR (command.state = 'failed' AND (
                outcome.result_kind <> 'revision_conflict'
                OR outcome.current_revision = command.expected_revision
                OR outcome.policy_revision IS NOT NULL
              ))
            ))) AS invalid_command_count
      ,(SELECT count(*)::text
          FROM flow_worker_registrations registration
          LEFT JOIN flow_worker_registration_tombstones tombstone
            ON tombstone.session_id = registration.session_id
         WHERE registration.registration_digest <>
                 'sha256:' || encode(
                   digest(flow_worker_registration_preimage_v1(registration), 'sha256'),
                   'hex'
                 )
            OR (tombstone.session_id IS NOT NULL
              AND tombstone.registration_digest <> registration.registration_digest)
            OR EXISTS (
              SELECT 1
                FROM unnest(registration.max_canary_owner_subject_ids) subject_id
                LEFT JOIN flow_runtime_owner_subjects subject
                  ON subject.owner_subject_id = subject_id
               WHERE subject.owner_subject_id IS NULL
            )) AS invalid_registration_count
      ,(SELECT count(*)::text
          FROM flow_runtime_control_authority authority
          JOIN flow_runtime_rollout_policy_versions policy
            ON policy.revision = authority.current_policy_revision
          CROSS JOIN LATERAL unnest(
            policy.canary_owner_subject_ids
            || policy.enrollment_killed_owner_subject_ids
            || policy.claim_killed_owner_subject_ids
            || policy.external_dispatch_killed_owner_subject_ids
          ) subject_id
          LEFT JOIN flow_runtime_owner_subjects subject
            ON subject.owner_subject_id = subject_id AND subject.state = 'active'
         WHERE subject.owner_subject_id IS NULL) AS invalid_current_subject_count
      ,(SELECT count(*)::text
          FROM flow_worker_readiness_leases readiness
         WHERE EXISTS (
           SELECT 1 FROM flow_worker_registration_tombstones tombstone
            WHERE tombstone.session_id = readiness.session_id
         )) AS invalid_readiness_count
  `);
  const row = result.rows[0];
  if (
    row?.authority_count !== "1" ||
    row.target_count !== "1" ||
    row.bootstrap_count !== "1" ||
    row.invalid_policy_evidence_count !== "0" ||
    row.invalid_command_count !== "0" ||
    row.invalid_registration_count !== "0" ||
    row.invalid_current_subject_count !== "0" ||
    row.invalid_readiness_count !== "0" ||
    row.current_revision !== row.maximum_revision
  ) {
    throw new Error(
      row?.invalid_policy_evidence_count !== "0"
        ? "Flow runtime control policy evidence is invalid"
        : "Flow runtime control authority data is missing, ambiguous or inconsistent"
    );
  }
}

async function readRuntimeControlCatalog(
  client: Client
): Promise<FlowRuntimeControlCatalogFingerprint> {
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
        AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
        AND (
          relation.relname = ANY($1::text[])
          OR relation.relname LIKE ANY($2::text[])
        )`,
    [runtimeControlRelations, runtimeControlRelationPrefixes]
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
    [runtimeControlRelations]
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
    [runtimeControlRelations]
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
    [runtimeControlRelations]
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
    [runtimeControlRelations]
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
    `SELECT namespace.nspname AS function_schema,
            procedure.proname AS function_name,
            pg_get_function_identity_arguments(procedure.oid) AS identity_arguments,
            pg_get_function_result(procedure.oid) AS result_type,
            pg_get_functiondef(procedure.oid) AS definition,
            language.lanname AS language,
            pg_get_userbyid(procedure.proowner) AS owner_name,
            procedure.prosecdef AS security_definer,
            procedure.provolatile AS volatility,
            COALESCE(array_to_string(procedure.proconfig, E'\n'), '') AS configuration
       FROM pg_proc AS procedure
       JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
       JOIN pg_language AS language ON language.oid = procedure.prolang
      WHERE namespace.nspname = 'public'
        AND (
          procedure.proname = ANY($1::text[])
          OR procedure.proname LIKE ANY($2::text[])
        )`,
    [runtimeControlFunctions, runtimeControlFunctionPrefixes]
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

function matchesRuntimeControlCatalog(
  actual: FlowRuntimeControlCatalogFingerprint,
  expected: FlowRuntimeControlCatalogFingerprint
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

function isAbsentRuntimeControlCatalog(value: FlowRuntimeControlCatalogFingerprint): boolean {
  return (
    value.relations === 0 &&
    value.columns === 0 &&
    value.constraints === 0 &&
    value.indexes === 0 &&
    value.triggers === 0 &&
    value.functions === 0
  );
}

function driftError(actual: FlowRuntimeControlCatalogFingerprint): Error {
  return new Error(
    `Refusing to reconcile a partial or drifted Flow runtime control catalog: ${formatCatalog(
      actual
    )}`
  );
}

function formatCatalog(value: FlowRuntimeControlCatalogFingerprint): string {
  return `${value.hash}[relations=${value.relations},columns=${value.columns},constraints=${
    value.constraints
  },indexes=${value.indexes},triggers=${value.triggers},functions=${
    value.functions
  },unvalidatedConstraints=${value.unvalidatedConstraints},invalidIndexes=${value.invalidIndexes}]`;
}

function normalizeCatalogDefinition(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
