import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { auditActorSubjects } from "../audit-log/audit-actor-subjects.schema";
import { flowRuntimeControlCommands } from "./flow-runtime-control-commands.schema";

export const flowRuntimeRolloutPolicyVersions = pgTable(
  "flow_runtime_rollout_policy_versions",
  {
    revision: integer("revision").primaryKey(),
    supersedesRevision: integer("supersedes_revision"),
    commandId: uuid("command_id"),
    schemaVersion: text("schema_version")
      .notNull()
      .default(sql`'flow-runtime-rollout-policy.v2'`),
    mode: text("mode").notNull(),
    canaryOwnerSubjectIds: uuid("canary_owner_subject_ids")
      .array()
      .notNull()
      .default(sql`array[]::uuid[]`),
    allowedRequirementKeys: text("allowed_requirement_keys")
      .array()
      .notNull()
      .default(sql`array[]::text[]`),
    enrollmentGlobalKillSwitch: boolean("enrollment_global_kill_switch")
      .notNull()
      .default(true),
    claimGlobalKillSwitch: boolean("claim_global_kill_switch").notNull().default(true),
    externalDispatchGlobalKillSwitch: boolean("external_dispatch_global_kill_switch")
      .notNull()
      .default(true),
    enrollmentKilledOwnerSubjectIds: uuid("enrollment_killed_owner_subject_ids")
      .array()
      .notNull()
      .default(sql`array[]::uuid[]`),
    claimKilledOwnerSubjectIds: uuid("claim_killed_owner_subject_ids")
      .array()
      .notNull()
      .default(sql`array[]::uuid[]`),
    externalDispatchKilledOwnerSubjectIds: uuid("external_dispatch_killed_owner_subject_ids")
      .array()
      .notNull()
      .default(sql`array[]::uuid[]`),
    enrollmentKilledCapabilityKeys: text("enrollment_killed_capability_keys")
      .array()
      .notNull()
      .default(sql`array[]::text[]`),
    claimKilledCapabilityKeys: text("claim_killed_capability_keys")
      .array()
      .notNull()
      .default(sql`array[]::text[]`),
    externalDispatchKilledCapabilityKeys: text("external_dispatch_killed_capability_keys")
      .array()
      .notNull()
      .default(sql`array[]::text[]`),
    readinessLeaseTtlMs: integer("readiness_lease_ttl_ms").notNull().default(30_000),
    tokenLeaseDurationMs: integer("token_lease_duration_ms").notNull().default(30_000),
    canonicalPreimage: text("canonical_preimage").notNull(),
    policyDigest: varchar("policy_digest", { length: 71 }).notNull(),
    changeSource: text("change_source").notNull(),
    createdByActorSubjectId: uuid("created_by_actor_subject_id"),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.supersedesRevision],
      foreignColumns: [table.revision],
      name: "flow_runtime_rollout_policy_versions_supersedes_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.createdByActorSubjectId],
      foreignColumns: [auditActorSubjects.actorSubjectId],
      name: "flow_runtime_rollout_policy_versions_actor_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.commandId],
      foreignColumns: [flowRuntimeControlCommands.id],
      name: "flow_runtime_rollout_policy_versions_command_fk"
    }).onDelete("restrict"),
    uniqueIndex("flow_runtime_rollout_policy_versions_command_unique").on(table.commandId),
    index("flow_runtime_rollout_policy_versions_mode_created_idx").on(
      table.mode,
      table.createdAt,
      table.revision
    ),
    check(
      "flow_runtime_rollout_policy_versions_schema_check",
      sql`${table.schemaVersion} = 'flow-runtime-rollout-policy.v2' and ${table.revision} > 0`
    ),
    check(
      "flow_runtime_rollout_policy_versions_history_check",
      sql`(${table.revision} = 1 and ${table.supersedesRevision} is null)
        or (${table.revision} > 1 and ${table.supersedesRevision} = ${table.revision} - 1)`
    ),
    check(
      "flow_runtime_rollout_policy_versions_shape_check",
      sql`${table.mode} in ('definition_only', 'canary', 'enabled')
        and cardinality(${table.canaryOwnerSubjectIds}) between 0 and 100
        and array_position(${table.canaryOwnerSubjectIds}, null) is null
        and ((${table.mode} = 'canary' and cardinality(${table.canaryOwnerSubjectIds}) between 1 and 100)
          or (${table.mode} in ('definition_only', 'enabled')
            and cardinality(${table.canaryOwnerSubjectIds}) = 0))`
    ),
    check(
      "flow_runtime_rollout_policy_versions_requirements_check",
      sql`cardinality(${table.allowedRequirementKeys}) between 0 and 256
        and array_position(${table.allowedRequirementKeys}, null) is null
        and (cardinality(${table.allowedRequirementKeys}) = 0
          or array_to_string(${table.allowedRequirementKeys}, E'\n')
            ~ '^[a-z0-9][a-z0-9._:-]*(\n[a-z0-9][a-z0-9._:-]*)*$')
        and (${table.mode} = 'definition_only'
          or cardinality(${table.allowedRequirementKeys}) between 1 and 256)`
    ),
    check(
      "flow_runtime_rollout_policy_versions_kill_scope_check",
      sql`cardinality(${table.enrollmentKilledOwnerSubjectIds}) between 0 and 100
        and cardinality(${table.claimKilledOwnerSubjectIds}) between 0 and 100
        and cardinality(${table.externalDispatchKilledOwnerSubjectIds}) between 0 and 100
        and array_position(${table.enrollmentKilledOwnerSubjectIds}, null) is null
        and array_position(${table.claimKilledOwnerSubjectIds}, null) is null
        and array_position(${table.externalDispatchKilledOwnerSubjectIds}, null) is null
        and cardinality(${table.enrollmentKilledCapabilityKeys}) between 0 and 256
        and cardinality(${table.claimKilledCapabilityKeys}) between 0 and 256
        and cardinality(${table.externalDispatchKilledCapabilityKeys}) between 0 and 256
        and array_position(${table.enrollmentKilledCapabilityKeys}, null) is null
        and array_position(${table.claimKilledCapabilityKeys}, null) is null
        and array_position(${table.externalDispatchKilledCapabilityKeys}, null) is null
        and (cardinality(${table.enrollmentKilledCapabilityKeys}) = 0
          or array_to_string(${table.enrollmentKilledCapabilityKeys}, E'\n')
            ~ '^[a-z0-9][a-z0-9._:-]*(\n[a-z0-9][a-z0-9._:-]*)*$')
        and (cardinality(${table.claimKilledCapabilityKeys}) = 0
          or array_to_string(${table.claimKilledCapabilityKeys}, E'\n')
            ~ '^[a-z0-9][a-z0-9._:-]*(\n[a-z0-9][a-z0-9._:-]*)*$')
        and (cardinality(${table.externalDispatchKilledCapabilityKeys}) = 0
          or array_to_string(${table.externalDispatchKilledCapabilityKeys}, E'\n')
            ~ '^[a-z0-9][a-z0-9._:-]*(\n[a-z0-9][a-z0-9._:-]*)*$')`
    ),
    check(
      "flow_runtime_rollout_policy_versions_lease_check",
      sql`${table.readinessLeaseTtlMs} between 5000 and 60000
        and ${table.tokenLeaseDurationMs} between 5000 and 300000`
    ),
    check(
      "flow_runtime_rollout_policy_versions_digest_check",
      sql`length(${table.canonicalPreimage}) between 1 and 300000
        and ${table.policyDigest} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "flow_runtime_rollout_policy_versions_source_check",
      sql`(${table.revision} = 1 and ${table.changeSource} = 'bootstrap'
          and ${table.createdByActorSubjectId} is null and ${table.commandId} is null)
        or (${table.revision} > 1 and ${table.changeSource} = 'admin'
          and ${table.createdByActorSubjectId} is not null and ${table.commandId} is not null)`
    ),
    check(
      "flow_runtime_rollout_policy_versions_reason_check",
      sql`length(trim(${table.reason})) between 1 and 500
        and ${table.reason} = trim(${table.reason})
        and ${table.reason} !~ '[[:cntrl:]]'`
    )
  ]
);

export const flowRuntimeControlAuthority = pgTable(
  "flow_runtime_control_authority",
  {
    authorityKey: varchar("authority_key", { length: 32 }).primaryKey(),
    currentPolicyRevision: integer("current_policy_revision").notNull(),
    controlRevision: integer("control_revision").notNull(),
    lastCommandId: uuid("last_command_id"),
    changeSource: text("change_source").notNull(),
    updatedByActorSubjectId: uuid("updated_by_actor_subject_id"),
    reason: text("reason").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.currentPolicyRevision],
      foreignColumns: [flowRuntimeRolloutPolicyVersions.revision],
      name: "flow_runtime_control_authority_policy_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.updatedByActorSubjectId],
      foreignColumns: [auditActorSubjects.actorSubjectId],
      name: "flow_runtime_control_authority_actor_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.lastCommandId],
      foreignColumns: [flowRuntimeControlCommands.id],
      name: "flow_runtime_control_authority_command_fk"
    }).onDelete("restrict"),
    check(
      "flow_runtime_control_authority_shape_check",
      sql`${table.authorityKey} = 'primary'
        and ${table.currentPolicyRevision} > 0
        and ${table.controlRevision} = ${table.currentPolicyRevision}
        and length(trim(${table.reason})) between 1 and 500
        and ${table.reason} = trim(${table.reason})
        and ${table.reason} !~ '[[:cntrl:]]'`
    ),
    check(
      "flow_runtime_control_authority_source_check",
      sql`(${table.controlRevision} = 1 and ${table.changeSource} = 'bootstrap'
          and ${table.updatedByActorSubjectId} is null and ${table.lastCommandId} is null)
        or (${table.controlRevision} > 1 and ${table.changeSource} = 'admin'
          and ${table.updatedByActorSubjectId} is not null and ${table.lastCommandId} is not null)`
    )
  ]
);

export const flowWorkerRegistrations = pgTable(
  "flow_worker_registrations",
  {
    sessionId: uuid("session_id").primaryKey(),
    instanceId: varchar("instance_id", { length: 180 }).notNull(),
    roles: text("roles").array().notNull(),
    maxRuntimeMode: text("max_runtime_mode").notNull(),
    maxCanaryOwnerSubjectIds: uuid("max_canary_owner_subject_ids")
      .array()
      .notNull()
      .default(sql`array[]::uuid[]`),
    requirementKeys: text("requirement_keys").array().notNull(),
    deploymentId: varchar("deployment_id", { length: 180 }).notNull(),
    buildId: varchar("build_id", { length: 180 }).notNull(),
    protocolVersion: varchar("protocol_version", { length: 80 })
      .notNull()
      .default(sql`'flow-worker-runtime.v2'`),
    registrationDigest: varchar("registration_digest", { length: 71 }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("flow_worker_registrations_instance_started_idx").on(table.instanceId, table.startedAt),
    check(
      "flow_worker_registrations_identity_check",
      sql`length(trim(${table.instanceId})) between 1 and 180
        and ${table.instanceId} = trim(${table.instanceId})
        and ${table.instanceId} ~ '^[A-Za-z0-9._:-]+$'
        and length(trim(${table.deploymentId})) between 1 and 180
        and ${table.deploymentId} = trim(${table.deploymentId})
        and ${table.deploymentId} ~ '^[A-Za-z0-9._:-]+$'
        and length(trim(${table.buildId})) between 1 and 180
        and ${table.buildId} = trim(${table.buildId})
        and ${table.buildId} ~ '^[A-Za-z0-9._:-]+$'
        and ${table.protocolVersion} = 'flow-worker-runtime.v2'`
    ),
    check(
      "flow_worker_registrations_roles_check",
      sql`cardinality(${table.roles}) between 1 and 3
        and array_position(${table.roles}, null) is null
        and ${table.roles} <@ array['enrollment', 'executor', 'external_dispatcher']::text[]`
    ),
    check(
      "flow_worker_registrations_scope_check",
      sql`${table.maxRuntimeMode} in ('definition_only', 'canary', 'enabled')
        and cardinality(${table.maxCanaryOwnerSubjectIds}) between 0 and 100
        and array_position(${table.maxCanaryOwnerSubjectIds}, null) is null
        and ((${table.maxRuntimeMode} = 'canary'
            and cardinality(${table.maxCanaryOwnerSubjectIds}) between 1 and 100)
          or (${table.maxRuntimeMode} in ('definition_only', 'enabled')
            and cardinality(${table.maxCanaryOwnerSubjectIds}) = 0))`
    ),
    check(
      "flow_worker_registrations_requirements_check",
      sql`cardinality(${table.requirementKeys}) between 1 and 256
        and array_position(${table.requirementKeys}, null) is null
        and array_to_string(${table.requirementKeys}, E'\n')
          ~ '^[a-z0-9][a-z0-9._:-]*(\n[a-z0-9][a-z0-9._:-]*)*$'`
    ),
    check(
      "flow_worker_registrations_digest_check",
      sql`${table.registrationDigest} ~ '^sha256:[a-f0-9]{64}$'`
    )
  ]
);

export const flowWorkerRegistrationTombstones = pgTable(
  "flow_worker_registration_tombstones",
  {
    sessionId: uuid("session_id").primaryKey(),
    schemaVersion: text("schema_version")
      .notNull()
      .default(sql`'flow-worker-registration-tombstone.v1'`),
    registrationDigest: varchar("registration_digest", { length: 71 }).notNull(),
    retirementReason: text("retirement_reason").notNull(),
    retiredAt: timestamp("retired_at", { withTimezone: true }).notNull().defaultNow(),
    purgeAfter: timestamp("purge_after", { withTimezone: true }).notNull()
  },
  (table) => [
    index("flow_worker_registration_tombstones_purge_idx").on(
      table.purgeAfter,
      table.sessionId
    ),
    check(
      "flow_worker_registration_tombstones_shape_check",
      sql`${table.schemaVersion} = 'flow-worker-registration-tombstone.v1'
        and ${table.registrationDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.retirementReason} in ('explicit_drain', 'replaced', 'stale_expired')
        and ${table.purgeAfter} = ${table.retiredAt} + interval '30 days'`
    )
  ]
);

export const flowWorkerReadinessLeases = pgTable(
  "flow_worker_readiness_leases",
  {
    instanceId: varchar("instance_id", { length: 180 }).primaryKey(),
    sessionId: uuid("session_id").notNull(),
    state: text("state").notNull().default("ready"),
    policyRevision: integer("policy_revision").notNull(),
    heartbeatSequence: integer("heartbeat_sequence").notNull().default(1),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }).notNull().defaultNow(),
    readyUntil: timestamp("ready_until", { withTimezone: true }).notNull(),
    drainingAt: timestamp("draining_at", { withTimezone: true })
  },
  (table) => [
    foreignKey({
      columns: [table.sessionId],
      foreignColumns: [flowWorkerRegistrations.sessionId],
      name: "flow_worker_readiness_leases_registration_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.policyRevision],
      foreignColumns: [flowRuntimeRolloutPolicyVersions.revision],
      name: "flow_worker_readiness_leases_policy_fk"
    }).onDelete("restrict"),
    uniqueIndex("flow_worker_readiness_leases_session_unique").on(table.sessionId),
    index("flow_worker_readiness_leases_ready_idx").on(
      table.state,
      table.policyRevision,
      table.readyUntil,
      table.instanceId
    ),
    check(
      "flow_worker_readiness_leases_identity_check",
      sql`length(trim(${table.instanceId})) between 1 and 180
        and ${table.instanceId} = trim(${table.instanceId})
        and ${table.instanceId} ~ '^[A-Za-z0-9._:-]+$'
        and ${table.policyRevision} > 0
        and ${table.heartbeatSequence} > 0`
    ),
    check(
      "flow_worker_readiness_leases_time_check",
      sql`${table.state} in ('ready', 'draining')
        and ((${table.state} = 'ready'
            and ${table.drainingAt} is null
            and ${table.readyUntil} > ${table.heartbeatAt}
            and ${table.readyUntil} <= ${table.heartbeatAt} + interval '60 seconds')
          or (${table.state} = 'draining'
            and ${table.drainingAt} is not null
            and ${table.readyUntil} = ${table.drainingAt}
            and ${table.heartbeatAt} = ${table.drainingAt}))`
    )
  ]
);

export const flowRuntimeControlIntegritySql = `
create extension if not exists pgcrypto;

create or replace function flow_canonical_runtime_control_jsonb_v1(input_value jsonb)
returns text
language plpgsql
immutable
strict
parallel safe
set search_path = pg_catalog, public
as $$
declare
  value_kind text := jsonb_typeof(input_value);
  rendered text;
begin
  if value_kind = 'null' then
    return 'null';
  elsif value_kind = 'boolean' or value_kind = 'string' then
    return input_value::text;
  elsif value_kind = 'number' then
    rendered := input_value::text;
    if rendered !~ '^-?(0|[1-9][0-9]*)$'
       or rendered::numeric < -9007199254740991
       or rendered::numeric > 9007199254740991 then
      raise exception 'flow runtime control canonical JSON numbers must be safe integers'
        using errcode = '22023';
    end if;
    if rendered = '-0' then
      return '0';
    end if;
    return rendered;
  elsif value_kind = 'array' then
    select '[' || coalesce(
      string_agg(
        flow_canonical_runtime_control_jsonb_v1(entry.value),
        ',' order by entry.ordinality
      ),
      ''
    ) || ']'
      into rendered
      from jsonb_array_elements(input_value) with ordinality as entry(value, ordinality);
    return rendered;
  elsif value_kind = 'object' then
    select '{' || coalesce(
      string_agg(
        flow_canonical_runtime_control_jsonb_v1(to_jsonb(entry.key)) || ':' ||
          flow_canonical_runtime_control_jsonb_v1(entry.value),
        ',' order by entry.key collate "C"
      ),
      ''
    ) || '}'
      into rendered
      from jsonb_each(input_value) as entry(key, value);
    return rendered;
  end if;

  raise exception 'unsupported flow runtime control canonical JSON value'
    using errcode = '22023';
end;
$$;

create or replace function flow_prepare_runtime_control_command()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare authority_now timestamp with time zone := clock_timestamp();
begin
  if not exists (
    select 1 from audit_actor_subjects
     where actor_subject_id = new.actor_subject_id and state = 'active'
  ) then
    raise exception 'flow runtime control actor subject is unavailable' using errcode = '23503';
  end if;
  new.state := 'processing';
  new.completed_at := null;
  new.created_at := authority_now;
  new.updated_at := authority_now;
  new.replay_until := authority_now + interval '24 hours';
  return new;
end;
$$;

create trigger flow_runtime_control_commands_prepare
before insert on flow_runtime_control_commands
for each row execute function flow_prepare_runtime_control_command();

create or replace function flow_enforce_runtime_control_command_transition()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare authority_now timestamp with time zone := clock_timestamp();
begin
  if tg_op = 'DELETE' then
    raise exception 'flow runtime control commands cannot be deleted' using errcode = '55000';
  end if;
  if old.state <> 'processing'
     or new.state not in ('succeeded', 'failed')
     or new.id <> old.id
     or new.schema_version <> old.schema_version
     or new.actor_subject_id <> old.actor_subject_id
     or new.command_scope <> old.command_scope
     or new.idempotency_key <> old.idempotency_key
     or new.request_hash <> old.request_hash
     or new.expected_revision <> old.expected_revision
     or new.target_revision <> old.target_revision
     or new.requested_policy_digest <> old.requested_policy_digest
     or new.reason <> old.reason
     or new.replay_until <> old.replay_until
     or new.created_at <> old.created_at then
    raise exception 'flow runtime control command transition is invalid' using errcode = '55000';
  end if;
  new.completed_at := authority_now;
  new.updated_at := authority_now;
  return new;
end;
$$;

create trigger flow_runtime_control_commands_transition_guard
before update or delete on flow_runtime_control_commands
for each row execute function flow_enforce_runtime_control_command_transition();

create or replace function flow_reject_runtime_control_command_truncate()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'flow runtime control command tombstones cannot be truncated'
    using errcode = '55000';
end;
$$;

create trigger flow_runtime_control_commands_reject_truncate
before truncate on flow_runtime_control_commands
for each statement execute function flow_reject_runtime_control_command_truncate();

create or replace function flow_prepare_runtime_control_command_outcome()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare command_row flow_runtime_control_commands%rowtype;
        requested_policy jsonb;
        expected_policy_preimage text;
        expected_policy_digest text;
begin
  select * into command_row
    from flow_runtime_control_commands
   where id = new.command_id
   for share;
  if not found or command_row.state <> 'processing' then
    raise exception 'flow runtime control command outcome has no processing command'
      using errcode = '23514';
  end if;
  requested_policy := new.requested_policy_canonical_preimage::jsonb;
  expected_policy_preimage := flow_canonical_runtime_control_jsonb_v1(requested_policy);
  expected_policy_digest := 'sha256:' || encode(digest(expected_policy_preimage, 'sha256'), 'hex');
  if new.requested_policy_canonical_preimage <> expected_policy_preimage
     or new.requested_policy_digest <> expected_policy_digest
     or new.requested_policy_digest <> command_row.requested_policy_digest then
    raise exception 'flow runtime control command outcome evidence is invalid'
      using errcode = '23514';
  end if;
  new.created_at := clock_timestamp();
  return new;
end;
$$;

create trigger flow_runtime_control_command_outcomes_prepare
before insert on flow_runtime_control_command_outcomes
for each row execute function flow_prepare_runtime_control_command_outcome();

create or replace function flow_enforce_runtime_control_command_outcome_retention()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare command_row flow_runtime_control_commands%rowtype;
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'flow runtime control command outcomes cannot be truncated'
      using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'flow runtime control command outcomes are immutable'
      using errcode = '55000';
  end if;
  select * into command_row
    from flow_runtime_control_commands
   where id = old.command_id
   for share;
  if not found or clock_timestamp() < command_row.replay_until then
    raise exception 'flow runtime control command outcome is inside its replay window'
      using errcode = '55000';
  end if;
  return old;
end;
$$;

create trigger flow_runtime_control_command_outcomes_retention_guard
before update or delete on flow_runtime_control_command_outcomes
for each row execute function flow_enforce_runtime_control_command_outcome_retention();

create trigger flow_runtime_control_command_outcomes_reject_truncate
before truncate on flow_runtime_control_command_outcomes
for each statement execute function flow_enforce_runtime_control_command_outcome_retention();

create or replace function flow_reject_runtime_control_policy_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'flow runtime rollout policy versions are immutable' using errcode = '55000';
end;
$$;

create trigger flow_runtime_rollout_policy_versions_immutable
before update or delete on flow_runtime_rollout_policy_versions
for each row execute function flow_reject_runtime_control_policy_mutation();

create or replace function flow_runtime_rollout_policy_preimage_v1(
  policy_row flow_runtime_rollout_policy_versions
)
returns text
language sql
immutable
strict
parallel safe
set search_path = pg_catalog, public
as $$
  select flow_canonical_runtime_control_jsonb_v1(
    jsonb_build_object(
      'schemaVersion', ($1).schema_version,
      'mode', ($1).mode,
      'canaryOwnerSubjectIds', to_jsonb(($1).canary_owner_subject_ids),
      'allowedRequirementKeys', to_jsonb(($1).allowed_requirement_keys),
      'killSwitches', jsonb_build_object(
        'enrollment', jsonb_build_object(
          'global', ($1).enrollment_global_kill_switch,
          'ownerSubjectIds', to_jsonb(($1).enrollment_killed_owner_subject_ids),
          'capabilityKeys', to_jsonb(($1).enrollment_killed_capability_keys)
        ),
        'claim', jsonb_build_object(
          'global', ($1).claim_global_kill_switch,
          'ownerSubjectIds', to_jsonb(($1).claim_killed_owner_subject_ids),
          'capabilityKeys', to_jsonb(($1).claim_killed_capability_keys)
        ),
        'externalDispatch', jsonb_build_object(
          'global', ($1).external_dispatch_global_kill_switch,
          'ownerSubjectIds', to_jsonb(($1).external_dispatch_killed_owner_subject_ids),
          'capabilityKeys', to_jsonb(($1).external_dispatch_killed_capability_keys)
        )
      ),
      'readinessLeaseTtlMs', ($1).readiness_lease_ttl_ms,
      'tokenLeaseDurationMs', ($1).token_lease_duration_ms
    )
  )
$$;

create or replace function flow_validate_runtime_control_arrays()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare expected_preimage text;
        expected_digest text;
        command_row flow_runtime_control_commands%rowtype;
begin
  if (select count(*) <> count(distinct candidate) from unnest(new.canary_owner_subject_ids) candidate)
     or (select count(*) <> count(distinct candidate) from unnest(new.allowed_requirement_keys) candidate)
     or exists (select 1 from unnest(new.allowed_requirement_keys) candidate
                 where length(candidate) > 240 or candidate !~ '^[a-z0-9][a-z0-9._:-]*$')
     or (select count(*) <> count(distinct candidate) from unnest(new.enrollment_killed_owner_subject_ids) candidate)
     or (select count(*) <> count(distinct candidate) from unnest(new.claim_killed_owner_subject_ids) candidate)
     or (select count(*) <> count(distinct candidate) from unnest(new.external_dispatch_killed_owner_subject_ids) candidate)
     or (select count(*) <> count(distinct candidate) from unnest(new.enrollment_killed_capability_keys) candidate)
     or (select count(*) <> count(distinct candidate) from unnest(new.claim_killed_capability_keys) candidate)
     or (select count(*) <> count(distinct candidate) from unnest(new.external_dispatch_killed_capability_keys) candidate)
     or exists (select 1 from unnest(new.enrollment_killed_capability_keys) candidate
                 where length(candidate) > 240 or candidate !~ '^[a-z0-9][a-z0-9._:-]*$')
     or exists (select 1 from unnest(new.claim_killed_capability_keys) candidate
                 where length(candidate) > 240 or candidate !~ '^[a-z0-9][a-z0-9._:-]*$')
     or exists (select 1 from unnest(new.external_dispatch_killed_capability_keys) candidate
                 where length(candidate) > 240 or candidate !~ '^[a-z0-9][a-z0-9._:-]*$')
     or new.canary_owner_subject_ids <> array(select candidate from unnest(new.canary_owner_subject_ids) candidate order by candidate)
     or new.allowed_requirement_keys <> array(select candidate from unnest(new.allowed_requirement_keys) candidate order by candidate)
     or new.enrollment_killed_owner_subject_ids <> array(select candidate from unnest(new.enrollment_killed_owner_subject_ids) candidate order by candidate)
     or new.claim_killed_owner_subject_ids <> array(select candidate from unnest(new.claim_killed_owner_subject_ids) candidate order by candidate)
     or new.external_dispatch_killed_owner_subject_ids <> array(select candidate from unnest(new.external_dispatch_killed_owner_subject_ids) candidate order by candidate)
     or new.enrollment_killed_capability_keys <> array(select candidate from unnest(new.enrollment_killed_capability_keys) candidate order by candidate)
     or new.claim_killed_capability_keys <> array(select candidate from unnest(new.claim_killed_capability_keys) candidate order by candidate)
     or new.external_dispatch_killed_capability_keys <> array(select candidate from unnest(new.external_dispatch_killed_capability_keys) candidate order by candidate) then
    raise exception 'flow runtime control arrays must be unique and sorted' using errcode = '23514';
  end if;

  expected_preimage := flow_runtime_rollout_policy_preimage_v1(new);
  expected_digest := 'sha256:' || encode(digest(expected_preimage, 'sha256'), 'hex');
  if new.canonical_preimage <> expected_preimage or new.policy_digest <> expected_digest then
    raise exception 'flow runtime rollout policy evidence is invalid' using errcode = '23514';
  end if;
  if exists (
    select 1
      from unnest(
        new.canary_owner_subject_ids
        || new.enrollment_killed_owner_subject_ids
        || new.claim_killed_owner_subject_ids
        || new.external_dispatch_killed_owner_subject_ids
      ) subject_id
      left join flow_runtime_owner_subjects subject
        on subject.owner_subject_id = subject_id and subject.state = 'active'
     where subject.owner_subject_id is null
  ) then
    raise exception 'flow runtime rollout policy owner subject is unavailable'
      using errcode = '23503';
  end if;
  if new.revision > 1 then
    select * into command_row
      from flow_runtime_control_commands
     where id = new.command_id
     for share;
    if not found
       or command_row.state <> 'processing'
       or command_row.expected_revision <> new.supersedes_revision
       or command_row.target_revision <> new.revision
       or command_row.actor_subject_id <> new.created_by_actor_subject_id
       or command_row.requested_policy_digest <> new.policy_digest
       or command_row.reason <> new.reason then
      raise exception 'flow runtime rollout policy command provenance is invalid'
        using errcode = '23514';
    end if;
  end if;
  new.created_at := clock_timestamp();
  return new;
end;
$$;

create trigger flow_runtime_rollout_policy_versions_validate
before insert on flow_runtime_rollout_policy_versions
for each row execute function flow_validate_runtime_control_arrays();

create or replace function flow_require_runtime_control_policy_activation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if not exists (
    select 1 from flow_runtime_control_authority
     where authority_key = 'primary'
       and current_policy_revision = new.revision
       and control_revision = new.revision
  ) then
    raise exception 'flow runtime rollout policy must be activated in its creation transaction'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger flow_runtime_rollout_policy_versions_activation_guard
after insert on flow_runtime_rollout_policy_versions
deferrable initially deferred
for each row execute function flow_require_runtime_control_policy_activation();

create or replace function flow_enforce_runtime_control_authority_transition()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare candidate_supersedes_revision integer;
        candidate_command_id uuid;
        candidate_actor_subject_id uuid;
begin
  if tg_op = 'DELETE' then
    raise exception 'flow runtime control authority cannot be deleted' using errcode = '55000';
  end if;
  select supersedes_revision, command_id, created_by_actor_subject_id
    into candidate_supersedes_revision, candidate_command_id, candidate_actor_subject_id
    from flow_runtime_rollout_policy_versions
   where revision = new.current_policy_revision;
  if new.authority_key <> old.authority_key
     or new.current_policy_revision <> old.current_policy_revision + 1
     or new.control_revision <> new.current_policy_revision
     or candidate_supersedes_revision <> old.current_policy_revision
     or new.last_command_id is distinct from candidate_command_id
     or new.updated_by_actor_subject_id is distinct from candidate_actor_subject_id
     or new.change_source <> 'admin'
     or new.updated_by_actor_subject_id is null then
    raise exception 'flow runtime control authority transition is stale' using errcode = '40001';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger flow_runtime_control_authority_transition_guard
before update or delete on flow_runtime_control_authority
for each row execute function flow_enforce_runtime_control_authority_transition();

create or replace function flow_require_runtime_control_command_outcome()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare outcome_row flow_runtime_control_command_outcomes%rowtype;
        command_row flow_runtime_control_commands%rowtype;
        policy_row flow_runtime_rollout_policy_versions%rowtype;
        authority_row flow_runtime_control_authority%rowtype;
        requested_policy jsonb;
        expected_policy_preimage text;
        expected_policy_digest text;
        expected_request_preimage text;
        expected_request_hash text;
begin
  select * into command_row
    from flow_runtime_control_commands
   where id = new.id
   for share;
  if not found or command_row.state = 'processing' then
    raise exception 'flow runtime control command must finish in its creation transaction'
      using errcode = '23514';
  end if;
  select * into outcome_row
    from flow_runtime_control_command_outcomes
   where command_id = command_row.id;
  if not found then
    raise exception 'flow runtime control command outcome is missing' using errcode = '23514';
  end if;
  select * into authority_row
    from flow_runtime_control_authority
   where authority_key = 'primary';
  requested_policy := outcome_row.requested_policy_canonical_preimage::jsonb;
  expected_policy_preimage := flow_canonical_runtime_control_jsonb_v1(requested_policy);
  expected_policy_digest := 'sha256:' || encode(digest(expected_policy_preimage, 'sha256'), 'hex');
  expected_request_preimage := flow_canonical_runtime_control_jsonb_v1(
    jsonb_build_object(
      'schemaVersion', command_row.schema_version,
      'actorSubjectId', command_row.actor_subject_id::text,
      'expectedRevision', command_row.expected_revision,
      'targetRevision', command_row.target_revision,
      'policy', requested_policy,
      'reason', command_row.reason
    )
  );
  expected_request_hash := 'sha256:' || encode(digest(expected_request_preimage, 'sha256'), 'hex');
  if outcome_row.requested_policy_canonical_preimage <> expected_policy_preimage
     or outcome_row.requested_policy_digest <> expected_policy_digest
     or command_row.requested_policy_digest <> expected_policy_digest
     or command_row.request_hash <> expected_request_hash then
    raise exception 'flow runtime control command evidence is invalid' using errcode = '23514';
  end if;

  if command_row.state = 'succeeded' then
    select * into policy_row
      from flow_runtime_rollout_policy_versions
     where command_id = command_row.id;
    if not found
       or policy_row.command_id <> command_row.id
       or policy_row.revision <> command_row.target_revision
       or policy_row.supersedes_revision <> command_row.expected_revision
       or policy_row.canonical_preimage <> outcome_row.requested_policy_canonical_preimage
       or policy_row.policy_digest <> command_row.requested_policy_digest
       or authority_row.current_policy_revision <> command_row.target_revision
       or authority_row.control_revision <> command_row.target_revision
       or authority_row.last_command_id <> command_row.id
       or outcome_row.result_kind <> 'applied'
       or outcome_row.current_revision <> command_row.target_revision
       or outcome_row.policy_revision <> command_row.target_revision
       or outcome_row.requested_policy_digest <> command_row.requested_policy_digest then
      raise exception 'successful flow runtime control command provenance is invalid'
        using errcode = '23514';
    end if;
  else
    if exists (select 1 from flow_runtime_rollout_policy_versions where command_id = command_row.id)
       or outcome_row.result_kind <> 'revision_conflict'
       or outcome_row.current_revision = command_row.expected_revision
       or outcome_row.policy_revision is not null then
      raise exception 'failed flow runtime control command provenance is invalid'
        using errcode = '23514';
    end if;
  end if;
  return null;
end;
$$;

create constraint trigger flow_runtime_control_commands_outcome_guard
after insert or update on flow_runtime_control_commands
deferrable initially deferred
for each row execute function flow_require_runtime_control_command_outcome();

create or replace function flow_require_erased_runtime_owner_subject_not_current()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.state = 'erased' and exists (
    select 1
      from flow_runtime_control_authority authority
      join flow_runtime_rollout_policy_versions policy
        on policy.revision = authority.current_policy_revision
     where authority.authority_key = 'primary'
       and (
         new.owner_subject_id = any(policy.canary_owner_subject_ids)
         or new.owner_subject_id = any(policy.enrollment_killed_owner_subject_ids)
         or new.owner_subject_id = any(policy.claim_killed_owner_subject_ids)
         or new.owner_subject_id = any(policy.external_dispatch_killed_owner_subject_ids)
       )
  ) then
    raise exception 'current flow runtime policy still references erased owner subject'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger flow_runtime_owner_subjects_current_policy_guard
after update on flow_runtime_owner_subjects
deferrable initially deferred
for each row execute function flow_require_erased_runtime_owner_subject_not_current();

create or replace function flow_worker_registration_preimage_v1(
  registration_row flow_worker_registrations
)
returns text
language sql
immutable
strict
parallel safe
set search_path = pg_catalog, public
as $$
  select flow_canonical_runtime_control_jsonb_v1(
    jsonb_build_object(
      'schemaVersion', 'flow-worker-registration.v2',
      'sessionId', ($1).session_id::text,
      'instanceId', ($1).instance_id,
      'roles', to_jsonb(($1).roles),
      'maxRuntimeMode', ($1).max_runtime_mode,
      'maxCanaryOwnerSubjectIds', to_jsonb(($1).max_canary_owner_subject_ids),
      'requirementKeys', to_jsonb(($1).requirement_keys),
      'deploymentId', ($1).deployment_id,
      'buildId', ($1).build_id
    )
  )
$$;

create or replace function flow_prepare_worker_registration()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare expected_digest text;
begin
  if exists (
    select 1 from flow_worker_registration_tombstones
     where session_id = new.session_id
  ) then
    raise exception 'flow worker registration session is permanently retired'
      using errcode = '40001';
  end if;
  if exists (
    select 1
      from unnest(new.max_canary_owner_subject_ids) subject_id
      left join flow_runtime_owner_subjects subject
        on subject.owner_subject_id = subject_id and subject.state = 'active'
     where subject.owner_subject_id is null
  ) then
    raise exception 'flow worker registration owner subject is unavailable'
      using errcode = '23503';
  end if;
  if (select count(*) <> count(distinct candidate) from unnest(new.roles) candidate)
     or (select count(*) <> count(distinct candidate) from unnest(new.max_canary_owner_subject_ids) candidate)
     or (select count(*) <> count(distinct candidate) from unnest(new.requirement_keys) candidate)
     or exists (select 1 from unnest(new.requirement_keys) candidate
                 where length(candidate) > 240 or candidate !~ '^[a-z0-9][a-z0-9._:-]*$')
     or new.roles <> array(select candidate from unnest(new.roles) candidate order by candidate)
     or new.max_canary_owner_subject_ids <> array(select candidate from unnest(new.max_canary_owner_subject_ids) candidate order by candidate)
     or new.requirement_keys <> array(select candidate from unnest(new.requirement_keys) candidate order by candidate) then
    raise exception 'flow worker registration arrays must be unique and sorted' using errcode = '23514';
  end if;
  expected_digest := 'sha256:' || encode(
    digest(flow_worker_registration_preimage_v1(new), 'sha256'),
    'hex'
  );
  if new.registration_digest <> expected_digest then
    raise exception 'flow worker registration evidence is invalid' using errcode = '23514';
  end if;
  new.started_at := clock_timestamp();
  return new;
end;
$$;

create trigger flow_worker_registrations_prepare
before insert on flow_worker_registrations
for each row execute function flow_prepare_worker_registration();

create or replace function flow_reject_worker_registration_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare tombstone_row flow_worker_registration_tombstones%rowtype;
begin
  if tg_op = 'TRUNCATE' or tg_op = 'UPDATE' then
    raise exception 'flow worker registrations are immutable' using errcode = '55000';
  end if;
  select * into tombstone_row
    from flow_worker_registration_tombstones
   where session_id = old.session_id
   for share;
  if not found
     or tombstone_row.registration_digest <> old.registration_digest
     or clock_timestamp() < tombstone_row.purge_after
     or exists (
       select 1 from flow_worker_readiness_leases where session_id = old.session_id
     ) then
    raise exception 'flow worker registration retention is not satisfied'
      using errcode = '55000';
  end if;
  return old;
end;
$$;

create trigger flow_worker_registrations_immutable
before update or delete on flow_worker_registrations
for each row execute function flow_reject_worker_registration_mutation();

create trigger flow_worker_registrations_reject_truncate
before truncate on flow_worker_registrations
for each statement execute function flow_reject_worker_registration_mutation();

create or replace function flow_prepare_worker_registration_tombstone()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare registration_row flow_worker_registrations%rowtype;
        authority_now timestamp with time zone := clock_timestamp();
begin
  select * into registration_row
    from flow_worker_registrations
   where session_id = new.session_id
   for share;
  if not found or registration_row.registration_digest <> new.registration_digest then
    raise exception 'flow worker registration tombstone evidence is invalid'
      using errcode = '23514';
  end if;
  new.schema_version := 'flow-worker-registration-tombstone.v1';
  new.retired_at := authority_now;
  new.purge_after := authority_now + interval '30 days';
  return new;
end;
$$;

create trigger flow_worker_registration_tombstones_prepare
before insert on flow_worker_registration_tombstones
for each row execute function flow_prepare_worker_registration_tombstone();

create or replace function flow_reject_worker_registration_tombstone_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'flow worker registration tombstones are immutable'
    using errcode = '55000';
end;
$$;

create trigger flow_worker_registration_tombstones_immutable
before update or delete on flow_worker_registration_tombstones
for each row execute function flow_reject_worker_registration_tombstone_mutation();

create trigger flow_worker_registration_tombstones_reject_truncate
before truncate on flow_worker_registration_tombstones
for each statement execute function flow_reject_worker_registration_tombstone_mutation();

create or replace function flow_prepare_worker_readiness_lease()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare authority_now timestamp with time zone := clock_timestamp();
        current_revision integer;
        current_mode text;
        readiness_ttl_ms integer;
        registration_instance_id text;
        registration_max_mode text;
begin
  if exists (
    select 1 from flow_worker_registration_tombstones
     where session_id = new.session_id
  ) then
    raise exception 'flow worker readiness session is permanently retired'
      using errcode = '40001';
  end if;
  select authority.current_policy_revision, policy.mode, policy.readiness_lease_ttl_ms
    into current_revision, current_mode, readiness_ttl_ms
    from flow_runtime_control_authority authority
   join flow_runtime_rollout_policy_versions policy
      on policy.revision = authority.current_policy_revision
   where authority.authority_key = 'primary';
  if not found then
    raise exception 'flow runtime control authority is missing' using errcode = '55000';
  end if;

  select instance_id, max_runtime_mode
    into registration_instance_id, registration_max_mode
    from flow_worker_registrations
   where session_id = new.session_id;
  if not found or registration_instance_id <> new.instance_id then
    raise exception 'flow worker readiness registration mismatch' using errcode = '23503';
  end if;

  if tg_op = 'UPDATE' and new.instance_id <> old.instance_id then
    raise exception 'flow worker readiness instance identity is immutable' using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' and new.session_id = old.session_id and old.state = 'draining' then
    raise exception 'drained flow worker session cannot become ready' using errcode = '40001';
  end if;
  if tg_op = 'UPDATE' and new.session_id <> old.session_id
     and old.state <> 'draining' and old.ready_until > authority_now then
    raise exception 'flow worker readiness session is still live' using errcode = '55P03';
  end if;

  if tg_op = 'UPDATE' and new.session_id = old.session_id and new.state = 'draining' then
    new.policy_revision := current_revision;
    new.heartbeat_sequence := old.heartbeat_sequence + 1;
    new.heartbeat_at := authority_now;
    new.ready_until := authority_now;
    new.draining_at := authority_now;
    return new;
  end if;

  if new.state <> 'ready' or new.draining_at is not null then
    raise exception 'flow worker readiness session must start or heartbeat ready' using errcode = '23514';
  end if;
  if (current_mode = 'enabled' and registration_max_mode <> 'enabled')
     or (current_mode = 'canary' and registration_max_mode = 'definition_only') then
    raise exception 'flow runtime policy exceeds worker deployment ceiling' using errcode = '55000';
  end if;

  new.policy_revision := current_revision;
  new.heartbeat_sequence := case when tg_op = 'INSERT' or new.session_id <> old.session_id
    then 1 else old.heartbeat_sequence + 1 end;
  new.heartbeat_at := authority_now;
  new.ready_until := authority_now + readiness_ttl_ms * interval '1 millisecond';
  new.draining_at := null;
  return new;
end;
$$;

create trigger flow_worker_readiness_leases_prepare
before insert or update on flow_worker_readiness_leases
for each row execute function flow_prepare_worker_readiness_lease();
`;
