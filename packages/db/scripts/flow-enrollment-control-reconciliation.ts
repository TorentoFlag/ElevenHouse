import { createHash } from "node:crypto";

import type { Client } from "pg";

import { flowEnrollmentControlIntegritySql } from "../src/schema/flows/flow-enrollment-control.schema";
import {
  flowRunIntegritySql,
  flowRuntimeEventIntegritySql
} from "../src/schema/flows/flow-runtime.schema";
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

type RuntimeExtensionCatalogFingerprint = {
  readonly hash: string;
  readonly columns: number;
  readonly constraints: number;
  readonly indexes: number;
  readonly unvalidatedConstraints: number;
  readonly invalidIndexes: number;
};

type RuntimeIntegrityCatalogFingerprint = {
  readonly hash: string;
  readonly triggers: number;
  readonly functions: number;
};

export type FlowEnrollmentControlReconciliationResult = "already_current" | "reconciled";

const currentCatalog = {
  hash: "d3ccd6860692e18186d14b9e8aeaf034bfbb29ffc823ba5278e2083c6f8b6caa",
  relations: 5,
  columns: 56,
  constraints: 32,
  indexes: 17,
  triggers: 22,
  functions: 13,
  unvalidatedConstraints: 0,
  invalidIndexes: 0
} as const satisfies CatalogFingerprint;

const previousCurrentCatalog = {
  hash: "fc6521049afcdf47f2bb071665dfd3d0505831988ab4c5f1d49e67993402d1c2",
  relations: 5,
  columns: 56,
  constraints: 32,
  indexes: 17,
  triggers: 21,
  functions: 13,
  unvalidatedConstraints: 0,
  invalidIndexes: 0
} as const satisfies CatalogFingerprint;

const terminalTransitionBugCatalog = {
  hash: "d7390af72401141ce8b84f95e8ef03cf9d46db1b334d0e1c183712140eb4304c",
  relations: 5,
  columns: 56,
  constraints: 32,
  indexes: 17,
  triggers: 21,
  functions: 13,
  unvalidatedConstraints: 0,
  invalidIndexes: 0
} as const satisfies CatalogFingerprint;

const generatedBaselineCatalog = {
  hash: "a5824e6caca934a990d85c092ccd48cd16022df1e8c30db51d409a835475945a",
  relations: 4,
  columns: 44,
  constraints: 27,
  indexes: 15,
  triggers: 0,
  functions: 0,
  unvalidatedConstraints: 0,
  invalidIndexes: 0
} as const satisfies CatalogFingerprint;

const currentRuntimeExtensionCatalog = {
  hash: "c261b45862c4d4bb941914fcd4ed3a6d1036a33c75f91966acf4e86abdb3ba35",
  columns: 16,
  constraints: 4,
  indexes: 2,
  unvalidatedConstraints: 0,
  invalidIndexes: 0
} as const satisfies RuntimeExtensionCatalogFingerprint;

const currentRuntimeIntegrityCatalog = {
  hash: "8398c8703ee5879ff5e5b46882acdb89470c837c72dcd3e101f7cf3d30c3aef4",
  triggers: 3,
  functions: 2
} as const satisfies RuntimeIntegrityCatalogFingerprint;

const enrollmentRelations = [
  "flow_activation_epochs",
  "flow_automation_quota_authorities",
  "flow_enrollment_command_outcomes",
  "flow_enrollment_commands",
  "flow_enrollment_controls"
] as const;

const enrollmentFunctions = [
  "flow_assert_activation_epoch_command_provenance",
  "flow_assert_automation_quota_consistency",
  "flow_assert_enrollment_command_outcome",
  "flow_assert_enrollment_control_provenance",
  "flow_guard_activation_epoch_close",
  "flow_guard_automation_quota_transition",
  "flow_guard_enrollment_command_transition",
  "flow_guard_enrollment_control_transition",
  "flow_guard_enrollment_outcome_mutation",
  "flow_prepare_enrollment_command",
  "flow_reject_activation_epoch_removal",
  "flow_reject_enrollment_authority_removal",
  "flow_reject_enrollment_command_removal"
] as const;

const runtimeIntegrityFunctions = [
  "elevenhouse_guard_flow_run_enrollment_mutation",
  "elevenhouse_guard_flow_runtime_event_mutation"
] as const;

export async function reconcileFlowEnrollmentControl(
  client: Client
): Promise<FlowEnrollmentControlReconciliationResult> {
  await client.query("SAVEPOINT flow_enrollment_control_reconciliation_guard");
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('elevenhouse:flows:enrollment-control:v1'))"
  );
  let state = await readReconciliationCatalogState(client);
  if (!isCurrentReconciliationCatalogState(state)) {
    await assertPrerequisites(client);
    await configureBoundedReconciliationLockTimeout(client);
    await lockExistingTablesForReconciliation(client, [
      "audit_actor_subjects",
      "flow_activation_epochs",
      "flow_automation_quota_authorities",
      "flow_enrollment_command_outcomes",
      "flow_enrollment_commands",
      "flow_enrollment_controls",
      "flow_runs",
      "flow_runtime_events",
      "flow_runtime_owner_subjects",
      "flow_versions",
      "flows"
    ]);
    state = await readReconciliationCatalogState(client);
  }

  const { catalog: before, runtimeExtensionIsAbsent, runtimeIntegrityIsAbsent } = state;

  let reconciled = false;
  if (matchesCatalog(before, currentCatalog)) {
    // The authority catalog can be current while a prior broken rollout omitted runtime provenance.
  } else if (matchesCatalog(before, previousCurrentCatalog)) {
    await client.query(flowEnrollmentControlPreviousCurrentUpgradeDdl);
    reconciled = true;
  } else if (matchesCatalog(before, terminalTransitionBugCatalog)) {
    await client.query(flowEnrollmentControlPreviousCurrentUpgradeDdl);
    reconciled = true;
  } else if (matchesCatalog(before, generatedBaselineCatalog)) {
    await assertGeneratedBaselineIsEmpty(client);
    await client.query(flowEnrollmentControlGeneratedBaselineUpgradeDdl);
    reconciled = true;
  } else if (isAbsentCatalog(before)) {
    await client.query(flowEnrollmentControlBaselineDdl);
    reconciled = true;
  } else {
    throw driftError(before);
  }

  if (runtimeExtensionIsAbsent) {
    await client.query(flowEnrollmentRuntimeExtensionBaselineDdl);
    reconciled = true;
  }
  if (runtimeIntegrityIsAbsent) {
    await client.query(flowEnrollmentRuntimeIntegrityBaselineDdl);
    reconciled = true;
  }

  const after = await readCatalog(client);
  if (!matchesCatalog(after, currentCatalog)) {
    throw new Error(
      `Flow enrollment control reconciliation produced a drifted catalog; expected=${formatCatalog(
        currentCatalog
      )} actual=${formatCatalog(after)}`
    );
  }
  const runtimeExtensionAfter = await readRuntimeExtensionCatalog(client);
  if (!matchesRuntimeExtensionCatalog(runtimeExtensionAfter, currentRuntimeExtensionCatalog)) {
    throw new Error(
      `Flow enrollment runtime extension reconciliation produced a drifted catalog; expected=${formatRuntimeExtensionCatalog(
        currentRuntimeExtensionCatalog
      )} actual=${formatRuntimeExtensionCatalog(runtimeExtensionAfter)}`
    );
  }
  const runtimeIntegrityAfter = await readRuntimeIntegrityCatalog(client);
  if (!matchesRuntimeIntegrityCatalog(runtimeIntegrityAfter, currentRuntimeIntegrityCatalog)) {
    throw new Error(
      `Flow enrollment runtime integrity reconciliation produced a drifted catalog; expected=${formatRuntimeIntegrityCatalog(
        currentRuntimeIntegrityCatalog
      )} actual=${formatRuntimeIntegrityCatalog(runtimeIntegrityAfter)}`
    );
  }
  await provisionFlowEnrollmentReadAuthorities(client);
  await assertFlowEnrollmentControlData(client);
  await client.query("RELEASE SAVEPOINT flow_enrollment_control_reconciliation_guard");
  return reconciled ? "reconciled" : "already_current";
}

type ReconciliationCatalogState = {
  readonly catalog: CatalogFingerprint;
  readonly runtimeExtensionIsCurrent: boolean;
  readonly runtimeExtensionIsAbsent: boolean;
  readonly runtimeIntegrityIsCurrent: boolean;
  readonly runtimeIntegrityIsAbsent: boolean;
};

async function readReconciliationCatalogState(client: Client): Promise<ReconciliationCatalogState> {
  const catalog = await readCatalog(client);
  const runtimeExtension = await readRuntimeExtensionCatalog(client);
  const runtimeExtensionIsCurrent = matchesRuntimeExtensionCatalog(
    runtimeExtension,
    currentRuntimeExtensionCatalog
  );
  const runtimeExtensionIsAbsent = isAbsentRuntimeExtensionCatalog(runtimeExtension);
  if (!runtimeExtensionIsCurrent && !runtimeExtensionIsAbsent) {
    throw runtimeExtensionDriftError(runtimeExtension);
  }

  const runtimeIntegrity = await readRuntimeIntegrityCatalog(client);
  const runtimeIntegrityIsCurrent = matchesRuntimeIntegrityCatalog(
    runtimeIntegrity,
    currentRuntimeIntegrityCatalog
  );
  const runtimeIntegrityIsAbsent = isAbsentRuntimeIntegrityCatalog(runtimeIntegrity);
  if (!runtimeIntegrityIsCurrent && !runtimeIntegrityIsAbsent) {
    throw runtimeIntegrityDriftError(runtimeIntegrity);
  }

  return {
    catalog,
    runtimeExtensionIsCurrent,
    runtimeExtensionIsAbsent,
    runtimeIntegrityIsCurrent,
    runtimeIntegrityIsAbsent
  };
}

function isCurrentReconciliationCatalogState(state: ReconciliationCatalogState): boolean {
  return (
    matchesCatalog(state.catalog, currentCatalog) &&
    state.runtimeExtensionIsCurrent &&
    state.runtimeIntegrityIsCurrent
  );
}

async function provisionFlowEnrollmentReadAuthorities(client: Client): Promise<void> {
  await client.query(`
    INSERT INTO flow_runtime_owner_subjects (owner_user_id)
    SELECT DISTINCT owner_user_id
      FROM flows
    ON CONFLICT (owner_user_id) WHERE owner_user_id IS NOT NULL DO NOTHING
  `);
  await client.query(`
    INSERT INTO flow_automation_quota_authorities (owner_subject_id)
    SELECT DISTINCT subject.owner_subject_id
      FROM flows flow
      JOIN flow_runtime_owner_subjects subject
        ON subject.owner_user_id = flow.owner_user_id
       AND subject.state = 'active'
    ON CONFLICT (owner_subject_id) DO NOTHING
  `);
}

export async function assertFlowEnrollmentControl(client: Client): Promise<void> {
  const actual = await readCatalog(client);
  if (!matchesCatalog(actual, currentCatalog)) throw driftError(actual);
  const runtimeExtension = await readRuntimeExtensionCatalog(client);
  if (!matchesRuntimeExtensionCatalog(runtimeExtension, currentRuntimeExtensionCatalog)) {
    throw runtimeExtensionDriftError(runtimeExtension);
  }
  const runtimeIntegrity = await readRuntimeIntegrityCatalog(client);
  if (!matchesRuntimeIntegrityCatalog(runtimeIntegrity, currentRuntimeIntegrityCatalog)) {
    throw runtimeIntegrityDriftError(runtimeIntegrity);
  }
  await assertFlowEnrollmentControlData(client);
}

const quotaTableDdl = `
CREATE TABLE flow_automation_quota_authorities (
  owner_subject_id uuid PRIMARY KEY NOT NULL,
  active_allocations integer DEFAULT 0 NOT NULL,
  revision integer DEFAULT 1 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT flow_automation_quota_authorities_owner_subject_fk
    FOREIGN KEY (owner_subject_id) REFERENCES flow_runtime_owner_subjects(owner_subject_id)
    ON DELETE RESTRICT,
  CONSTRAINT flow_automation_quota_authorities_shape_check CHECK (
    active_allocations >= 0 AND revision > 0 AND updated_at >= created_at
  )
);
CREATE INDEX flow_automation_quota_authorities_updated_idx
  ON flow_automation_quota_authorities (updated_at, owner_subject_id);
`;

export const flowEnrollmentControlBaselineDdl = `
CREATE TABLE flow_enrollment_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  api_surface text DEFAULT 'astrologer-api' NOT NULL,
  actor_subject_id uuid NOT NULL,
  owner_subject_id uuid NOT NULL,
  route_template text NOT NULL,
  resource_id uuid NOT NULL,
  command_scope text NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  request_hash varchar(71) NOT NULL,
  request_schema_version text NOT NULL,
  target_version_id uuid,
  expected_definition_revision integer,
  expected_enrollment_revision integer NOT NULL,
  expected_active_version_id uuid,
  expected_activation_epoch_id uuid,
  state text DEFAULT 'processing' NOT NULL,
  completed_at timestamp with time zone,
  replay_until timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT flow_enrollment_commands_actor_subject_fk
    FOREIGN KEY (actor_subject_id) REFERENCES audit_actor_subjects(actor_subject_id)
    ON DELETE RESTRICT,
  CONSTRAINT flow_enrollment_commands_owner_subject_fk
    FOREIGN KEY (owner_subject_id) REFERENCES flow_runtime_owner_subjects(owner_subject_id)
    ON DELETE RESTRICT,
  CONSTRAINT flow_enrollment_commands_identity_check CHECK (
    api_surface = 'astrologer-api' AND (
      (command_scope = 'flows.enrollment.activate.v1'
        AND route_template = '/flows/:flowId/activate')
      OR (command_scope = 'flows.enrollment.pause.v1'
        AND route_template = '/flows/:flowId/pause-enrollment')
    )
  ),
  CONSTRAINT flow_enrollment_commands_key_check CHECK (
    length(idempotency_key) BETWEEN 8 AND 128
    AND idempotency_key ~ '^[A-Za-z0-9._:-]+$'
  ),
  CONSTRAINT flow_enrollment_commands_request_hash_check CHECK (
    request_hash ~ '^sha256:[a-f0-9]{64}$'
  ),
  CONSTRAINT flow_enrollment_commands_request_shape_check CHECK (
    (command_scope = 'flows.enrollment.activate.v1'
      AND request_schema_version = 'flow-activation-command.v1'
      AND target_version_id IS NOT NULL
      AND expected_definition_revision IS NOT NULL
      AND expected_definition_revision > 0
      AND expected_enrollment_revision >= 0
      AND expected_activation_epoch_id IS NULL)
    OR (command_scope = 'flows.enrollment.pause.v1'
      AND request_schema_version = 'flow-enrollment-pause-command.v1'
      AND target_version_id IS NULL
      AND expected_definition_revision IS NULL
      AND expected_enrollment_revision >= 0
      AND expected_active_version_id IS NOT NULL
      AND expected_activation_epoch_id IS NOT NULL)
  ),
  CONSTRAINT flow_enrollment_commands_state_check CHECK (
    (state = 'processing' AND completed_at IS NULL)
    OR (state IN ('succeeded', 'failed') AND completed_at IS NOT NULL)
  ),
  CONSTRAINT flow_enrollment_commands_time_check CHECK (
    replay_until = created_at + interval '24 hours'
    AND updated_at >= created_at
    AND (completed_at IS NULL OR (
      completed_at >= created_at AND completed_at = updated_at
    ))
  )
);
CREATE UNIQUE INDEX flow_enrollment_commands_scope_actor_key_unique
  ON flow_enrollment_commands (command_scope, actor_subject_id, idempotency_key);
CREATE INDEX flow_enrollment_commands_replay_until_idx
  ON flow_enrollment_commands (replay_until, id);
CREATE INDEX flow_enrollment_commands_owner_resource_created_idx
  ON flow_enrollment_commands (owner_subject_id, resource_id, created_at, id);

CREATE TABLE flow_enrollment_command_outcomes (
  command_id uuid PRIMARY KEY NOT NULL,
  response_status integer NOT NULL,
  response_body jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT flow_enrollment_command_outcomes_command_fk
    FOREIGN KEY (command_id) REFERENCES flow_enrollment_commands(id) ON DELETE RESTRICT,
  CONSTRAINT flow_enrollment_command_outcomes_response_check CHECK (
    response_status IN (200, 400, 404, 409)
    AND jsonb_typeof(response_body) = 'object'
    AND octet_length(response_body::text) BETWEEN 2 AND 65536
  )
);
CREATE INDEX flow_enrollment_command_outcomes_created_idx
  ON flow_enrollment_command_outcomes (created_at, command_id);

CREATE TABLE flow_activation_epochs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  flow_id uuid NOT NULL,
  owner_subject_id uuid NOT NULL,
  flow_version_id uuid NOT NULL,
  sequence integer NOT NULL,
  effective_from timestamp with time zone NOT NULL,
  effective_to timestamp with time zone,
  manifest_digest varchar(71) NOT NULL,
  rollout_policy_revision integer NOT NULL,
  activated_by_actor_subject_id uuid NOT NULL,
  activate_command_id uuid NOT NULL,
  close_reason text,
  closed_by_actor_subject_id uuid,
  close_command_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT flow_activation_epochs_id_flow_version_unique
    UNIQUE (id, flow_id, flow_version_id),
  CONSTRAINT flow_activation_epochs_version_fk
    FOREIGN KEY (flow_id, flow_version_id) REFERENCES flow_versions(flow_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT flow_activation_epochs_owner_subject_fk
    FOREIGN KEY (owner_subject_id) REFERENCES flow_runtime_owner_subjects(owner_subject_id)
    ON DELETE RESTRICT,
  CONSTRAINT flow_activation_epochs_policy_fk
    FOREIGN KEY (rollout_policy_revision) REFERENCES flow_runtime_rollout_policy_versions(revision)
    ON DELETE RESTRICT,
  CONSTRAINT flow_activation_epochs_activated_actor_fk
    FOREIGN KEY (activated_by_actor_subject_id) REFERENCES audit_actor_subjects(actor_subject_id)
    ON DELETE RESTRICT,
  CONSTRAINT flow_activation_epochs_activate_command_fk
    FOREIGN KEY (activate_command_id) REFERENCES flow_enrollment_commands(id)
    ON DELETE RESTRICT,
  CONSTRAINT flow_activation_epochs_closed_actor_fk
    FOREIGN KEY (closed_by_actor_subject_id) REFERENCES audit_actor_subjects(actor_subject_id)
    ON DELETE RESTRICT,
  CONSTRAINT flow_activation_epochs_close_command_fk
    FOREIGN KEY (close_command_id) REFERENCES flow_enrollment_commands(id)
    ON DELETE RESTRICT,
  CONSTRAINT flow_activation_epochs_shape_check CHECK (
    sequence > 0
    AND manifest_digest ~ '^sha256:[a-f0-9]{64}$'
    AND rollout_policy_revision > 0
    AND created_at = effective_from
    AND ((effective_to IS NULL AND close_reason IS NULL
      AND closed_by_actor_subject_id IS NULL AND close_command_id IS NULL)
      OR (effective_to > effective_from
        AND close_reason IN ('pause_enrollment', 'version_switch')
        AND closed_by_actor_subject_id IS NOT NULL
        AND close_command_id IS NOT NULL
        AND close_command_id <> activate_command_id))
  )
);
CREATE UNIQUE INDEX flow_activation_epochs_flow_sequence_unique
  ON flow_activation_epochs (flow_id, sequence);
CREATE UNIQUE INDEX flow_activation_epochs_one_open_flow_unique
  ON flow_activation_epochs (flow_id) WHERE effective_to IS NULL;
CREATE UNIQUE INDEX flow_activation_epochs_activate_command_unique
  ON flow_activation_epochs (activate_command_id);
CREATE UNIQUE INDEX flow_activation_epochs_close_command_unique
  ON flow_activation_epochs (close_command_id) WHERE close_command_id IS NOT NULL;
CREATE INDEX flow_activation_epochs_flow_effective_idx
  ON flow_activation_epochs (flow_id, effective_from, id);

CREATE TABLE flow_enrollment_controls (
  flow_id uuid PRIMARY KEY NOT NULL,
  owner_user_id uuid NOT NULL,
  owner_subject_id uuid NOT NULL,
  state text DEFAULT 'inactive' NOT NULL,
  enrollment_revision integer DEFAULT 0 NOT NULL,
  active_version_id uuid,
  active_activation_epoch_id uuid,
  active_since timestamp with time zone,
  last_paused_at timestamp with time zone,
  last_command_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT flow_enrollment_controls_flow_owner_fk
    FOREIGN KEY (flow_id, owner_user_id) REFERENCES flows(id, owner_user_id)
    ON DELETE CASCADE,
  CONSTRAINT flow_enrollment_controls_owner_subject_fk
    FOREIGN KEY (owner_subject_id) REFERENCES flow_runtime_owner_subjects(owner_subject_id)
    ON DELETE RESTRICT,
  CONSTRAINT flow_enrollment_controls_active_epoch_fk
    FOREIGN KEY (active_activation_epoch_id, flow_id, active_version_id)
    REFERENCES flow_activation_epochs(id, flow_id, flow_version_id) ON DELETE RESTRICT,
  CONSTRAINT flow_enrollment_controls_last_command_fk
    FOREIGN KEY (last_command_id) REFERENCES flow_enrollment_commands(id) ON DELETE RESTRICT,
  CONSTRAINT flow_enrollment_controls_state_check CHECK (
    (state = 'inactive' AND enrollment_revision = 0
      AND active_version_id IS NULL AND active_activation_epoch_id IS NULL
      AND active_since IS NULL AND last_paused_at IS NULL AND last_command_id IS NULL)
    OR (state = 'active' AND enrollment_revision > 0
      AND active_version_id IS NOT NULL AND active_activation_epoch_id IS NOT NULL
      AND active_since IS NOT NULL AND last_command_id IS NOT NULL
      AND (last_paused_at IS NULL OR last_paused_at < active_since))
    OR (state = 'paused' AND enrollment_revision > 0
      AND active_version_id IS NULL AND active_activation_epoch_id IS NULL
      AND active_since IS NULL AND last_paused_at IS NOT NULL AND last_command_id IS NOT NULL)
  ),
  CONSTRAINT flow_enrollment_controls_time_check CHECK (updated_at >= created_at)
);
CREATE INDEX flow_enrollment_controls_owner_state_updated_idx
  ON flow_enrollment_controls (owner_user_id, state, updated_at, flow_id);

${quotaTableDdl}
${flowEnrollmentControlIntegritySql}
`;

export const flowEnrollmentRuntimeExtensionBaselineDdl = `
ALTER TABLE flow_runtime_events
  ADD COLUMN event_kind text,
  ADD COLUMN occurrence_key text,
  ADD COLUMN payload_schema_version integer,
  ADD COLUMN payload_digest varchar(71),
  ADD COLUMN classification text,
  ADD COLUMN redaction_version integer,
  ADD COLUMN retention_policy_id text,
  ADD COLUMN ingestion_outcome text,
  ADD COLUMN processed_at timestamp with time zone;

ALTER TABLE flow_runtime_events
  ADD CONSTRAINT flow_runtime_events_payload_digest_check CHECK (
    payload_digest IS NULL OR payload_digest ~ '^sha256:[a-f0-9]{64}$'
  ) NOT VALID,
  ADD CONSTRAINT flow_runtime_events_normalized_shape_check CHECK (
    (
      event_kind IS NULL
      AND occurrence_key IS NULL
      AND payload_schema_version IS NULL
      AND payload_digest IS NULL
      AND classification IS NULL
      AND redaction_version IS NULL
      AND retention_policy_id IS NULL
      AND ingestion_outcome IS NULL
      AND processed_at IS NULL
    ) OR (
      event_kind IN (
        'booking_confirmed',
        'manual_client',
        'new_lead',
        'free_product_received',
        'product_purchased',
        'first_inbound_message',
        'astro_event',
        'client_lifecycle_changed',
        'schedule_time',
        'review_first_published',
        'subscription_event'
      )
      AND length(trim(occurrence_key)) BETWEEN 1 AND 180
      AND payload_schema_version = 1
      AND payload_digest ~ '^sha256:[a-f0-9]{64}$'
      AND classification IN ('personal')
      AND redaction_version = 1
      AND length(trim(retention_policy_id)) BETWEEN 1 AND 180
      AND ingestion_outcome IN (
        'enrolled', 'no_match', 'late_unmatched', 'subject_ineligible', 'suppressed'
      )
      AND processed_at IS NOT NULL
    )
  ) NOT VALID;

CREATE UNIQUE INDEX flow_runtime_events_source_identity_unique
  ON flow_runtime_events (source, source_event_id) WHERE event_kind IS NOT NULL;

ALTER TABLE flow_runtime_events
  VALIDATE CONSTRAINT flow_runtime_events_payload_digest_check;
ALTER TABLE flow_runtime_events
  VALIDATE CONSTRAINT flow_runtime_events_normalized_shape_check;

ALTER TABLE flow_runs
  ADD COLUMN activation_epoch_id uuid,
  ADD COLUMN trigger_node_id text,
  ADD COLUMN occurrence_key text,
  ADD COLUMN enrollment_policy_key text,
  ADD COLUMN enrollment_policy_revision integer,
  ADD COLUMN execution_authority_basis text,
  ADD COLUMN execution_authority_ref_id text;

ALTER TABLE flow_runs
  ADD CONSTRAINT flow_runs_activation_epoch_fk
    FOREIGN KEY (activation_epoch_id, flow_id, flow_version_id)
    REFERENCES flow_activation_epochs(id, flow_id, flow_version_id)
    ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT flow_runs_enrollment_shape_check CHECK (
    (
      activation_epoch_id IS NULL
      AND trigger_node_id IS NULL
      AND occurrence_key IS NULL
      AND enrollment_policy_key IS NULL
      AND enrollment_policy_revision IS NULL
      AND execution_authority_basis IS NULL
      AND execution_authority_ref_id IS NULL
    ) OR (
      activation_epoch_id IS NOT NULL
      AND length(trim(trigger_node_id)) BETWEEN 1 AND 160
      AND trigger_node_id ~ '^[a-z0-9][a-z0-9_-]*$'
      AND length(trim(occurrence_key)) BETWEEN 1 AND 180
      AND enrollment_policy_key IN ('once_per_occurrence')
      AND enrollment_policy_revision = 1
      AND execution_authority_basis IN ('current_entitlement', 'paid_order_obligation')
      AND length(trim(execution_authority_ref_id)) BETWEEN 1 AND 180
    )
  ) NOT VALID;

CREATE UNIQUE INDEX flow_runs_owner_stable_enrollment_unique
  ON flow_runs (
    owner_user_id, flow_id, trigger_node_id, enrollment_policy_key, occurrence_key
  ) WHERE activation_epoch_id IS NOT NULL;

ALTER TABLE flow_runs VALIDATE CONSTRAINT flow_runs_activation_epoch_fk;
ALTER TABLE flow_runs VALIDATE CONSTRAINT flow_runs_enrollment_shape_check;
`;

export const flowEnrollmentRuntimeIntegrityBaselineDdl = `
${flowRunIntegritySql}
${flowRuntimeEventIntegritySql}
`;

export const flowEnrollmentControlGeneratedBaselineUpgradeDdl = `
ALTER TABLE flow_enrollment_commands
  ADD COLUMN request_schema_version text NOT NULL,
  ADD COLUMN target_version_id uuid,
  ADD COLUMN expected_definition_revision integer,
  ADD COLUMN expected_enrollment_revision integer NOT NULL,
  ADD COLUMN expected_active_version_id uuid,
  ADD COLUMN expected_activation_epoch_id uuid,
  ADD CONSTRAINT flow_enrollment_commands_request_shape_check CHECK (
    (command_scope = 'flows.enrollment.activate.v1'
      AND request_schema_version = 'flow-activation-command.v1'
      AND target_version_id IS NOT NULL
      AND expected_definition_revision IS NOT NULL
      AND expected_definition_revision > 0
      AND expected_enrollment_revision >= 0
      AND expected_activation_epoch_id IS NULL)
    OR (command_scope = 'flows.enrollment.pause.v1'
      AND request_schema_version = 'flow-enrollment-pause-command.v1'
      AND target_version_id IS NULL
      AND expected_definition_revision IS NULL
      AND expected_enrollment_revision >= 0
      AND expected_active_version_id IS NOT NULL
      AND expected_activation_epoch_id IS NOT NULL)
  );
ALTER TABLE flow_enrollment_controls
  ADD COLUMN owner_subject_id uuid NOT NULL,
  ADD CONSTRAINT flow_enrollment_controls_owner_subject_fk
    FOREIGN KEY (owner_subject_id) REFERENCES flow_runtime_owner_subjects(owner_subject_id)
    ON DELETE RESTRICT;
${quotaTableDdl}
${flowEnrollmentControlIntegritySql}
`;

export const flowEnrollmentControlPreviousCurrentUpgradeDdl = `
ALTER TABLE flow_enrollment_commands
  DROP CONSTRAINT flow_enrollment_commands_request_shape_check,
  ADD CONSTRAINT flow_enrollment_commands_request_shape_check CHECK (
    (command_scope = 'flows.enrollment.activate.v1'
      AND request_schema_version = 'flow-activation-command.v1'
      AND target_version_id IS NOT NULL
      AND expected_definition_revision IS NOT NULL
      AND expected_definition_revision > 0
      AND expected_enrollment_revision >= 0
      AND expected_activation_epoch_id IS NULL)
    OR (command_scope = 'flows.enrollment.pause.v1'
      AND request_schema_version = 'flow-enrollment-pause-command.v1'
      AND target_version_id IS NULL
      AND expected_definition_revision IS NULL
      AND expected_enrollment_revision >= 0
      AND expected_active_version_id IS NOT NULL
      AND expected_activation_epoch_id IS NOT NULL)
  );

DROP TRIGGER flow_enrollment_commands_prepare ON flow_enrollment_commands;
DROP TRIGGER flow_enrollment_commands_transition_guard ON flow_enrollment_commands;
DROP TRIGGER flow_enrollment_commands_reject_delete ON flow_enrollment_commands;
DROP TRIGGER flow_enrollment_commands_reject_truncate ON flow_enrollment_commands;
DROP TRIGGER flow_enrollment_command_outcomes_guard ON flow_enrollment_command_outcomes;
DROP TRIGGER flow_enrollment_command_outcomes_reject_truncate
  ON flow_enrollment_command_outcomes;
DROP TRIGGER flow_enrollment_commands_outcome_consistency ON flow_enrollment_commands;
DROP TRIGGER flow_enrollment_outcomes_command_consistency
  ON flow_enrollment_command_outcomes;
DROP TRIGGER flow_activation_epochs_close_guard ON flow_activation_epochs;
DROP TRIGGER flow_activation_epochs_reject_delete ON flow_activation_epochs;
DROP TRIGGER flow_activation_epochs_reject_truncate ON flow_activation_epochs;
DROP TRIGGER flow_activation_epochs_command_provenance ON flow_activation_epochs;
DROP TRIGGER flow_enrollment_controls_transition_guard ON flow_enrollment_controls;
DROP TRIGGER flow_enrollment_controls_provenance ON flow_enrollment_controls;
DROP TRIGGER flow_activation_epochs_control_provenance ON flow_activation_epochs;
DROP TRIGGER flow_automation_quota_authorities_transition_guard
  ON flow_automation_quota_authorities;
DROP TRIGGER flow_automation_quota_authorities_reject_delete
  ON flow_automation_quota_authorities;
DROP TRIGGER flow_automation_quota_authorities_reject_truncate
  ON flow_automation_quota_authorities;
DROP TRIGGER flow_enrollment_controls_reject_truncate ON flow_enrollment_controls;
DROP TRIGGER flow_enrollment_controls_quota_consistency ON flow_enrollment_controls;
DROP TRIGGER flow_automation_quota_authorities_consistency
  ON flow_automation_quota_authorities;

${flowEnrollmentControlIntegritySql}
`;

async function assertPrerequisites(client: Client): Promise<void> {
  const result = await client.query<{ relation_name: string | null }>(`
    SELECT prerequisite::text AS relation_name
      FROM unnest(ARRAY[
        to_regclass('public.audit_actor_subjects'),
        to_regclass('public.flows'),
        to_regclass('public.flow_versions'),
        to_regclass('public.flow_runtime_owner_subjects'),
        to_regclass('public.flow_runtime_rollout_policy_versions')
      ]) prerequisite
  `);
  if (result.rows.length !== 5 || result.rows.some((row) => row.relation_name === null)) {
    throw new Error("Flow enrollment control reconciliation prerequisite is missing");
  }
}

async function assertGeneratedBaselineIsEmpty(client: Client): Promise<void> {
  const result = await client.query<{ populated: boolean }>(`
    SELECT EXISTS (SELECT 1 FROM flow_enrollment_commands)
        OR EXISTS (SELECT 1 FROM flow_enrollment_command_outcomes)
        OR EXISTS (SELECT 1 FROM flow_activation_epochs)
        OR EXISTS (SELECT 1 FROM flow_enrollment_controls) AS populated
  `);
  if (result.rows[0]?.populated) {
    throw new Error(
      "Refusing to upgrade the generated Flow enrollment baseline after enrollment data was written"
    );
  }
}

async function assertFlowEnrollmentControlData(client: Client): Promise<void> {
  const checks = await client.query<{ check_name: string; invalid_count: string }>(`
    SELECT 'quota' AS check_name, count(*)::text AS invalid_count
      FROM (
        SELECT coalesce(control.owner_subject_id, quota.owner_subject_id) AS owner_subject_id,
               coalesce(control.active_allocations, 0) AS expected_allocations,
               quota.active_allocations AS recorded_allocations
          FROM (
            SELECT owner_subject_id,
                   count(*) FILTER (WHERE state = 'active')::integer AS active_allocations
              FROM flow_enrollment_controls GROUP BY owner_subject_id
          ) control
          FULL JOIN flow_automation_quota_authorities quota USING (owner_subject_id)
         WHERE quota.active_allocations IS NULL
            OR quota.active_allocations <> coalesce(control.active_allocations, 0)
      ) invalid
    UNION ALL
    SELECT 'commands', count(*)::text
      FROM flow_enrollment_commands command
      LEFT JOIN flow_enrollment_command_outcomes outcome ON outcome.command_id = command.id
     WHERE command.state = 'processing'
        OR (command.replay_until > clock_timestamp() AND outcome.command_id IS NULL)
        OR (outcome.command_id IS NOT NULL AND (
          outcome.created_at IS DISTINCT FROM command.completed_at
          OR (command.state = 'succeeded' AND outcome.response_status <> 200)
          OR (command.state = 'failed' AND outcome.response_status NOT IN (400, 404, 409))
        ))
    UNION ALL
    SELECT 'epochs', count(*)::text
      FROM flow_activation_epochs epoch
      LEFT JOIN flow_enrollment_commands activation ON activation.id = epoch.activate_command_id
      LEFT JOIN flow_enrollment_commands closing ON closing.id = epoch.close_command_id
     WHERE activation.id IS NULL OR activation.state <> 'succeeded'
        OR activation.command_scope <> 'flows.enrollment.activate.v1'
        OR activation.resource_id <> epoch.flow_id
        OR activation.owner_subject_id <> epoch.owner_subject_id
        OR activation.actor_subject_id <> epoch.activated_by_actor_subject_id
        OR activation.target_version_id IS DISTINCT FROM epoch.flow_version_id
        OR (epoch.effective_to IS NOT NULL AND (
          closing.id IS NULL OR closing.state <> 'succeeded'
          OR closing.resource_id <> epoch.flow_id
          OR closing.owner_subject_id <> epoch.owner_subject_id
          OR closing.actor_subject_id <> epoch.closed_by_actor_subject_id
          OR closing.expected_active_version_id IS DISTINCT FROM epoch.flow_version_id
        ))
    UNION ALL
    SELECT 'subjects', count(*)::text
      FROM flow_enrollment_controls control
      LEFT JOIN flow_runtime_owner_subjects subject
        ON subject.owner_subject_id = control.owner_subject_id
     WHERE subject.owner_subject_id IS NULL
        OR subject.owner_user_id IS DISTINCT FROM control.owner_user_id
        OR subject.state <> 'active'
    UNION ALL
    SELECT 'control_commands', count(*)::text
      FROM flow_enrollment_controls control
      LEFT JOIN flow_enrollment_commands command ON command.id = control.last_command_id
      LEFT JOIN flow_activation_epochs active_epoch
        ON active_epoch.id = control.active_activation_epoch_id
      LEFT JOIN flow_activation_epochs closed_epoch
        ON closed_epoch.close_command_id = command.id
     WHERE control.state <> 'inactive' AND (
          command.id IS NULL OR command.state <> 'succeeded'
          OR command.resource_id <> control.flow_id
          OR command.owner_subject_id <> control.owner_subject_id
          OR command.expected_enrollment_revision <> control.enrollment_revision - 1
          OR (control.state = 'active' AND (
            command.command_scope <> 'flows.enrollment.activate.v1'
            OR command.target_version_id IS DISTINCT FROM control.active_version_id
            OR (command.expected_active_version_id IS NULL AND closed_epoch.id IS NOT NULL)
            OR (command.expected_active_version_id IS NOT NULL AND (
              closed_epoch.id IS NULL
              OR closed_epoch.flow_version_id IS DISTINCT FROM command.expected_active_version_id
              OR closed_epoch.close_reason <> 'version_switch'
              OR closed_epoch.effective_to IS DISTINCT FROM active_epoch.effective_from
            ))
          ))
          OR (control.state = 'paused' AND (
            command.command_scope <> 'flows.enrollment.pause.v1'
            OR closed_epoch.id IS NULL
            OR closed_epoch.close_reason <> 'pause_enrollment'
            OR command.expected_active_version_id IS DISTINCT FROM closed_epoch.flow_version_id
            OR command.expected_activation_epoch_id IS DISTINCT FROM closed_epoch.id
          ))
        )
    UNION ALL
    SELECT 'controls', count(*)::text
      FROM flow_enrollment_controls control
      LEFT JOIN flow_activation_epochs epoch ON epoch.id = control.active_activation_epoch_id
     WHERE (control.state = 'active' AND (
          epoch.id IS NULL OR epoch.flow_id <> control.flow_id
          OR epoch.owner_subject_id <> control.owner_subject_id
          OR epoch.flow_version_id <> control.active_version_id
          OR epoch.effective_from <> control.active_since
          OR epoch.effective_to IS NOT NULL
          OR epoch.activate_command_id <> control.last_command_id
        ))
        OR (control.state <> 'active' AND EXISTS (
          SELECT 1 FROM flow_activation_epochs open_epoch
           WHERE open_epoch.flow_id = control.flow_id AND open_epoch.effective_to IS NULL
        ))
  `);
  const invalid = checks.rows.find((row) => row.invalid_count !== "0");
  if (invalid) {
    throw new Error(`Flow enrollment control ${invalid.check_name} data is inconsistent`);
  }
}

async function readRuntimeExtensionCatalog(
  client: Client
): Promise<RuntimeExtensionCatalogFingerprint> {
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
         ('flow_runtime_events', 'event_kind'),
         ('flow_runtime_events', 'occurrence_key'),
         ('flow_runtime_events', 'payload_schema_version'),
         ('flow_runtime_events', 'payload_digest'),
         ('flow_runtime_events', 'classification'),
         ('flow_runtime_events', 'redaction_version'),
         ('flow_runtime_events', 'retention_policy_id'),
         ('flow_runtime_events', 'ingestion_outcome'),
         ('flow_runtime_events', 'processed_at'),
         ('flow_runs', 'activation_epoch_id'),
         ('flow_runs', 'trigger_node_id'),
         ('flow_runs', 'occurrence_key'),
         ('flow_runs', 'enrollment_policy_key'),
         ('flow_runs', 'enrollment_policy_revision'),
         ('flow_runs', 'execution_authority_basis'),
         ('flow_runs', 'execution_authority_ref_id')
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
         'flow_runtime_events_normalized_shape_check',
         'flow_runtime_events_payload_digest_check',
         'flow_runs_activation_epoch_fk',
         'flow_runs_enrollment_shape_check'
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
       AND catalog.indexname IN (
         'flow_runtime_events_source_identity_unique',
         'flow_runs_owner_stable_enrollment_unique'
       )
  `);

  const payload = {
    columns: columns.rows
      .map(
        (row) =>
          `${row.table_name}|${row.column_name}|${row.udt_name}|${row.is_nullable}|${normalize(row.column_default ?? "")}`
      )
      .sort(),
    constraints: constraints.rows
      .map(
        (row) =>
          `${row.relation_name}|${row.object_name}|${row.constraint_type}|${normalize(row.definition)}|validated=${row.validated}`
      )
      .sort(),
    indexes: indexes.rows
      .map(
        (row) =>
          `${row.relation_name}|${row.object_name}|${normalize(row.definition)}|valid=${row.valid}|ready=${row.ready}`
      )
      .sort()
  };
  return {
    hash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    columns: payload.columns.length,
    constraints: payload.constraints.length,
    indexes: payload.indexes.length,
    unvalidatedConstraints: constraints.rows.filter((row) => !row.validated).length,
    invalidIndexes: indexes.rows.filter((row) => !row.valid || !row.ready).length
  };
}

async function readRuntimeIntegrityCatalog(
  client: Client
): Promise<RuntimeIntegrityCatalogFingerprint> {
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
       AND NOT record.tgisinternal
       AND (
         (relation.relname = 'flow_runs'
           AND record.tgname = 'flow_runs_enrollment_immutable')
         OR (relation.relname = 'flow_runtime_events'
           AND record.tgname IN (
             'flow_runtime_events_immutable',
             'flow_runtime_events_truncate_guard'
           ))
       )
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
  }>(
    `
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
     WHERE namespace.nspname = 'public'
       AND procedure.proname = ANY($1::text[])
  `,
    [runtimeIntegrityFunctions]
  );
  const payload = {
    triggers: triggers.rows
      .map(
        (row) =>
          `${row.relation_name}|${row.object_name}|${normalize(row.definition)}|enabled=${row.enabled}`
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
    triggers: payload.triggers.length,
    functions: payload.functions.length
  };
}

async function readCatalog(client: Client): Promise<CatalogFingerprint> {
  const relationList = enrollmentRelations.map((name) => `'${name}'`).join(", ");
  const functionList = enrollmentFunctions.map((name) => `'${name}'`).join(", ");
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
          `${row.table_name}|${row.column_name}|${row.udt_name}|${row.is_nullable}|${normalize(row.column_default ?? "")}`
      )
      .sort(),
    constraints: constraints.rows
      .map(
        (row) =>
          `${row.relation_name}|${row.object_name}|${row.constraint_type}|${normalize(row.definition)}|validated=${row.validated}`
      )
      .sort(),
    indexes: indexes.rows
      .map(
        (row) =>
          `${row.relation_name}|${row.object_name}|${normalize(row.definition)}|valid=${row.valid}|ready=${row.ready}`
      )
      .sort(),
    triggers: triggers.rows
      .map(
        (row) =>
          `${row.relation_name}|${row.object_name}|${normalize(row.definition)}|enabled=${row.enabled}`
      )
      .sort(),
    functions: functions.rows
      .map(
        (row) =>
          `${row.function_schema}|${row.function_name}|${normalize(row.identity_arguments)}|result=${normalize(row.result_type)}|definition=${normalize(row.definition)}|language=${row.language}|owner=${row.owner_name}|securityDefiner=${row.security_definer}|volatility=${row.volatility}|configuration=${normalize(row.configuration)}`
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
  return Object.entries(expected).every(
    ([key, value]) => actual[key as keyof CatalogFingerprint] === value
  );
}

function matchesRuntimeExtensionCatalog(
  actual: RuntimeExtensionCatalogFingerprint,
  expected: RuntimeExtensionCatalogFingerprint
): boolean {
  return Object.entries(expected).every(
    ([key, value]) => actual[key as keyof RuntimeExtensionCatalogFingerprint] === value
  );
}

function matchesRuntimeIntegrityCatalog(
  actual: RuntimeIntegrityCatalogFingerprint,
  expected: RuntimeIntegrityCatalogFingerprint
): boolean {
  return Object.entries(expected).every(
    ([key, value]) => actual[key as keyof RuntimeIntegrityCatalogFingerprint] === value
  );
}

function isAbsentRuntimeExtensionCatalog(value: RuntimeExtensionCatalogFingerprint): boolean {
  return value.columns === 0 && value.constraints === 0 && value.indexes === 0;
}

function isAbsentRuntimeIntegrityCatalog(value: RuntimeIntegrityCatalogFingerprint): boolean {
  return value.triggers === 0 && value.functions === 0;
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

function driftError(actual: CatalogFingerprint): Error {
  return new Error(
    `Refusing to reconcile a partial or drifted Flow enrollment control catalog: ${formatCatalog(
      actual
    )}`
  );
}

function runtimeExtensionDriftError(actual: RuntimeExtensionCatalogFingerprint): Error {
  return new Error(
    `Refusing to reconcile a partial or drifted Flow enrollment runtime extension catalog: ${formatRuntimeExtensionCatalog(
      actual
    )}`
  );
}

function runtimeIntegrityDriftError(actual: RuntimeIntegrityCatalogFingerprint): Error {
  return new Error(
    `Refusing to reconcile a partial or drifted Flow enrollment runtime integrity catalog: ${formatRuntimeIntegrityCatalog(
      actual
    )}`
  );
}

function formatCatalog(value: CatalogFingerprint): string {
  return `${value.hash}[relations=${value.relations},columns=${value.columns},constraints=${value.constraints},indexes=${value.indexes},triggers=${value.triggers},functions=${value.functions},unvalidatedConstraints=${value.unvalidatedConstraints},invalidIndexes=${value.invalidIndexes}]`;
}

function formatRuntimeExtensionCatalog(value: RuntimeExtensionCatalogFingerprint): string {
  return `${value.hash}[columns=${value.columns},constraints=${value.constraints},indexes=${value.indexes},unvalidatedConstraints=${value.unvalidatedConstraints},invalidIndexes=${value.invalidIndexes}]`;
}

function formatRuntimeIntegrityCatalog(value: RuntimeIntegrityCatalogFingerprint): string {
  return `${value.hash}[triggers=${value.triggers},functions=${value.functions}]`;
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
