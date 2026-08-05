import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { auditActorSubjects } from "../audit-log/audit-actor-subjects.schema";
import { flows, flowVersions } from "./flows.schema";
import { flowRuntimeRolloutPolicyVersions } from "./flow-runtime-control.schema";
import { flowRuntimeOwnerSubjects } from "./flow-runtime-subjects.schema";

export const flowEnrollmentCommands = pgTable(
  "flow_enrollment_commands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    apiSurface: text("api_surface").notNull().default("astrologer-api"),
    actorSubjectId: uuid("actor_subject_id").notNull(),
    ownerSubjectId: uuid("owner_subject_id").notNull(),
    routeTemplate: text("route_template").notNull(),
    resourceId: uuid("resource_id").notNull(),
    commandScope: text("command_scope").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    requestHash: varchar("request_hash", { length: 71 }).notNull(),
    requestSchemaVersion: text("request_schema_version").notNull(),
    targetVersionId: uuid("target_version_id"),
    expectedDefinitionRevision: integer("expected_definition_revision"),
    expectedEnrollmentRevision: integer("expected_enrollment_revision").notNull(),
    expectedActiveVersionId: uuid("expected_active_version_id"),
    expectedActivationEpochId: uuid("expected_activation_epoch_id"),
    state: text("state").notNull().default("processing"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    replayUntil: timestamp("replay_until", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.actorSubjectId],
      foreignColumns: [auditActorSubjects.actorSubjectId],
      name: "flow_enrollment_commands_actor_subject_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.ownerSubjectId],
      foreignColumns: [flowRuntimeOwnerSubjects.ownerSubjectId],
      name: "flow_enrollment_commands_owner_subject_fk"
    }).onDelete("restrict"),
    uniqueIndex("flow_enrollment_commands_scope_actor_key_unique").on(
      table.commandScope,
      table.actorSubjectId,
      table.idempotencyKey
    ),
    index("flow_enrollment_commands_replay_until_idx").on(table.replayUntil, table.id),
    index("flow_enrollment_commands_owner_resource_created_idx").on(
      table.ownerSubjectId,
      table.resourceId,
      table.createdAt,
      table.id
    ),
    check(
      "flow_enrollment_commands_identity_check",
      sql`${table.apiSurface} = 'astrologer-api'
        and ((${table.commandScope} = 'flows.enrollment.activate.v1'
            and ${table.routeTemplate} = '/flows/:flowId/activate')
          or (${table.commandScope} = 'flows.enrollment.pause.v1'
            and ${table.routeTemplate} = '/flows/:flowId/pause-enrollment'))`
    ),
    check(
      "flow_enrollment_commands_key_check",
      sql`length(${table.idempotencyKey}) between 8 and 128
        and ${table.idempotencyKey} ~ '^[A-Za-z0-9._:-]+$'`
    ),
    check(
      "flow_enrollment_commands_request_hash_check",
      sql`${table.requestHash} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "flow_enrollment_commands_request_shape_check",
      sql`(${table.commandScope} = 'flows.enrollment.activate.v1'
          and ${table.requestSchemaVersion} = 'flow-activation-command.v1'
          and ${table.targetVersionId} is not null
          and ${table.expectedDefinitionRevision} is not null
          and ${table.expectedDefinitionRevision} > 0
          and ${table.expectedEnrollmentRevision} >= 0
          and ${table.expectedActivationEpochId} is null)
        or (${table.commandScope} = 'flows.enrollment.pause.v1'
          and ${table.requestSchemaVersion} = 'flow-enrollment-pause-command.v1'
          and ${table.targetVersionId} is null
          and ${table.expectedDefinitionRevision} is null
          and ${table.expectedEnrollmentRevision} >= 0
          and ${table.expectedActiveVersionId} is not null
          and ${table.expectedActivationEpochId} is not null)`
    ),
    check(
      "flow_enrollment_commands_state_check",
      sql`(${table.state} = 'processing' and ${table.completedAt} is null)
        or (${table.state} in ('succeeded', 'failed') and ${table.completedAt} is not null)`
    ),
    check(
      "flow_enrollment_commands_time_check",
      sql`${table.replayUntil} = ${table.createdAt} + interval '24 hours'
        and ${table.updatedAt} >= ${table.createdAt}
        and (${table.completedAt} is null
          or (${table.completedAt} >= ${table.createdAt}
            and ${table.completedAt} = ${table.updatedAt}))`
    )
  ]
);

export const flowEnrollmentCommandOutcomes = pgTable(
  "flow_enrollment_command_outcomes",
  {
    commandId: uuid("command_id").primaryKey(),
    responseStatus: integer("response_status").notNull(),
    responseBody: jsonb("response_body").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.commandId],
      foreignColumns: [flowEnrollmentCommands.id],
      name: "flow_enrollment_command_outcomes_command_fk"
    }).onDelete("restrict"),
    index("flow_enrollment_command_outcomes_created_idx").on(table.createdAt, table.commandId),
    check(
      "flow_enrollment_command_outcomes_response_check",
      sql`${table.responseStatus} in (200, 400, 404, 409)
        and jsonb_typeof(${table.responseBody}) = 'object'
        and octet_length(${table.responseBody}::text) between 2 and 65536`
    )
  ]
);

export const flowActivationEpochs = pgTable(
  "flow_activation_epochs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flowId: uuid("flow_id").notNull(),
    ownerSubjectId: uuid("owner_subject_id").notNull(),
    flowVersionId: uuid("flow_version_id").notNull(),
    sequence: integer("sequence").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    manifestDigest: varchar("manifest_digest", { length: 71 }).notNull(),
    rolloutPolicyRevision: integer("rollout_policy_revision").notNull(),
    activatedByActorSubjectId: uuid("activated_by_actor_subject_id").notNull(),
    activateCommandId: uuid("activate_command_id").notNull(),
    closeReason: text("close_reason"),
    closedByActorSubjectId: uuid("closed_by_actor_subject_id"),
    closeCommandId: uuid("close_command_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("flow_activation_epochs_id_flow_version_unique").on(
      table.id,
      table.flowId,
      table.flowVersionId
    ),
    foreignKey({
      columns: [table.flowId, table.flowVersionId],
      foreignColumns: [flowVersions.flowId, flowVersions.id],
      name: "flow_activation_epochs_version_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.ownerSubjectId],
      foreignColumns: [flowRuntimeOwnerSubjects.ownerSubjectId],
      name: "flow_activation_epochs_owner_subject_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.rolloutPolicyRevision],
      foreignColumns: [flowRuntimeRolloutPolicyVersions.revision],
      name: "flow_activation_epochs_policy_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.activatedByActorSubjectId],
      foreignColumns: [auditActorSubjects.actorSubjectId],
      name: "flow_activation_epochs_activated_actor_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.activateCommandId],
      foreignColumns: [flowEnrollmentCommands.id],
      name: "flow_activation_epochs_activate_command_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.closedByActorSubjectId],
      foreignColumns: [auditActorSubjects.actorSubjectId],
      name: "flow_activation_epochs_closed_actor_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.closeCommandId],
      foreignColumns: [flowEnrollmentCommands.id],
      name: "flow_activation_epochs_close_command_fk"
    }).onDelete("restrict"),
    uniqueIndex("flow_activation_epochs_flow_sequence_unique").on(table.flowId, table.sequence),
    uniqueIndex("flow_activation_epochs_one_open_flow_unique")
      .on(table.flowId)
      .where(sql`${table.effectiveTo} is null`),
    uniqueIndex("flow_activation_epochs_activate_command_unique").on(table.activateCommandId),
    uniqueIndex("flow_activation_epochs_close_command_unique")
      .on(table.closeCommandId)
      .where(sql`${table.closeCommandId} is not null`),
    index("flow_activation_epochs_flow_effective_idx").on(
      table.flowId,
      table.effectiveFrom,
      table.id
    ),
    check(
      "flow_activation_epochs_shape_check",
      sql`${table.sequence} > 0
        and ${table.manifestDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.rolloutPolicyRevision} > 0
        and ${table.createdAt} = ${table.effectiveFrom}
        and ((${table.effectiveTo} is null
            and ${table.closeReason} is null
            and ${table.closedByActorSubjectId} is null
            and ${table.closeCommandId} is null)
          or (${table.effectiveTo} > ${table.effectiveFrom}
            and ${table.closeReason} in ('pause_enrollment', 'version_switch')
            and ${table.closedByActorSubjectId} is not null
            and ${table.closeCommandId} is not null
            and ${table.closeCommandId} <> ${table.activateCommandId}))`
    )
  ]
);

export const flowEnrollmentControls = pgTable(
  "flow_enrollment_controls",
  {
    flowId: uuid("flow_id").primaryKey(),
    ownerUserId: uuid("owner_user_id").notNull(),
    ownerSubjectId: uuid("owner_subject_id").notNull(),
    state: text("state").notNull().default("inactive"),
    enrollmentRevision: integer("enrollment_revision").notNull().default(0),
    activeVersionId: uuid("active_version_id"),
    activeActivationEpochId: uuid("active_activation_epoch_id"),
    activeSince: timestamp("active_since", { withTimezone: true }),
    lastPausedAt: timestamp("last_paused_at", { withTimezone: true }),
    lastCommandId: uuid("last_command_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.flowId, table.ownerUserId],
      foreignColumns: [flows.id, flows.ownerUserId],
      name: "flow_enrollment_controls_flow_owner_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.ownerSubjectId],
      foreignColumns: [flowRuntimeOwnerSubjects.ownerSubjectId],
      name: "flow_enrollment_controls_owner_subject_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.activeActivationEpochId, table.flowId, table.activeVersionId],
      foreignColumns: [flowActivationEpochs.id, flowActivationEpochs.flowId, flowActivationEpochs.flowVersionId],
      name: "flow_enrollment_controls_active_epoch_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.lastCommandId],
      foreignColumns: [flowEnrollmentCommands.id],
      name: "flow_enrollment_controls_last_command_fk"
    }).onDelete("restrict"),
    index("flow_enrollment_controls_owner_state_updated_idx").on(
      table.ownerUserId,
      table.state,
      table.updatedAt,
      table.flowId
    ),
    check(
      "flow_enrollment_controls_state_check",
      sql`(${table.state} = 'inactive'
          and ${table.enrollmentRevision} = 0
          and ${table.activeVersionId} is null
          and ${table.activeActivationEpochId} is null
          and ${table.activeSince} is null
          and ${table.lastPausedAt} is null
          and ${table.lastCommandId} is null)
        or (${table.state} = 'active'
          and ${table.enrollmentRevision} > 0
          and ${table.activeVersionId} is not null
          and ${table.activeActivationEpochId} is not null
          and ${table.activeSince} is not null
          and ${table.lastCommandId} is not null
          and (${table.lastPausedAt} is null or ${table.lastPausedAt} < ${table.activeSince}))
        or (${table.state} = 'paused'
          and ${table.enrollmentRevision} > 0
          and ${table.activeVersionId} is null
          and ${table.activeActivationEpochId} is null
          and ${table.activeSince} is null
          and ${table.lastPausedAt} is not null
          and ${table.lastCommandId} is not null)`
    ),
    check(
      "flow_enrollment_controls_time_check",
      sql`${table.updatedAt} >= ${table.createdAt}`
    )
  ]
);

export const flowAutomationQuotaAuthorities = pgTable(
  "flow_automation_quota_authorities",
  {
    ownerSubjectId: uuid("owner_subject_id").primaryKey(),
    activeAllocations: integer("active_allocations").notNull().default(0),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.ownerSubjectId],
      foreignColumns: [flowRuntimeOwnerSubjects.ownerSubjectId],
      name: "flow_automation_quota_authorities_owner_subject_fk"
    }).onDelete("restrict"),
    index("flow_automation_quota_authorities_updated_idx").on(
      table.updatedAt,
      table.ownerSubjectId
    ),
    check(
      "flow_automation_quota_authorities_shape_check",
      sql`${table.activeAllocations} >= 0
        and ${table.revision} > 0
        and ${table.updatedAt} >= ${table.createdAt}`
    )
  ]
);

export const flowEnrollmentCommandTransitionFunctionSql = `
create or replace function flow_guard_enrollment_command_transition()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if old.state <> 'processing'
     or new.id <> old.id
     or new.api_surface <> old.api_surface
     or new.actor_subject_id <> old.actor_subject_id
     or new.owner_subject_id <> old.owner_subject_id
     or new.route_template <> old.route_template
     or new.resource_id <> old.resource_id
     or new.command_scope <> old.command_scope
     or new.idempotency_key <> old.idempotency_key
     or new.request_hash <> old.request_hash
     or new.request_schema_version <> old.request_schema_version
     or new.target_version_id is distinct from old.target_version_id
     or new.expected_definition_revision is distinct from old.expected_definition_revision
     or new.expected_enrollment_revision <> old.expected_enrollment_revision
     or new.expected_active_version_id is distinct from old.expected_active_version_id
     or new.expected_activation_epoch_id is distinct from old.expected_activation_epoch_id
     or new.replay_until <> old.replay_until
     or new.created_at <> old.created_at
     or new.state not in ('succeeded', 'failed')
     or new.completed_at is not null
     or new.updated_at <> old.updated_at then
    raise exception 'flow enrollment command transition is invalid' using errcode = '55000';
  end if;
  new.completed_at := clock_timestamp();
  new.updated_at := new.completed_at;
  return new;
end;
$$;
`;

export const flowEnrollmentControlIntegritySql = `
create or replace function flow_prepare_enrollment_command()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  new.state := 'processing';
  new.completed_at := null;
  new.created_at := transaction_timestamp();
  new.updated_at := new.created_at;
  new.replay_until := new.created_at + interval '24 hours';
  return new;
end;
$$;

create trigger flow_enrollment_commands_prepare
before insert on flow_enrollment_commands
for each row execute function flow_prepare_enrollment_command();

${flowEnrollmentCommandTransitionFunctionSql}

create trigger flow_enrollment_commands_transition_guard
before update on flow_enrollment_commands
for each row execute function flow_guard_enrollment_command_transition();

create or replace function flow_reject_enrollment_command_removal()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'flow enrollment command tombstones cannot be removed' using errcode = '55000';
end;
$$;

create trigger flow_enrollment_commands_reject_delete
before delete on flow_enrollment_commands
for each row execute function flow_reject_enrollment_command_removal();

create trigger flow_enrollment_commands_reject_truncate
before truncate on flow_enrollment_commands
for each statement execute function flow_reject_enrollment_command_removal();

create or replace function flow_guard_enrollment_outcome_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  retention_deadline timestamptz;
begin
  if tg_op = 'DELETE' then
    select replay_until into retention_deadline
      from flow_enrollment_commands where id = old.command_id;
    if retention_deadline <= clock_timestamp() then
      return old;
    end if;
  end if;
  raise exception 'flow enrollment outcomes are immutable' using errcode = '55000';
end;
$$;

create trigger flow_enrollment_command_outcomes_guard
before update or delete on flow_enrollment_command_outcomes
for each row execute function flow_guard_enrollment_outcome_mutation();

create trigger flow_enrollment_command_outcomes_reject_truncate
before truncate on flow_enrollment_command_outcomes
for each statement execute function flow_guard_enrollment_outcome_mutation();

create or replace function flow_assert_enrollment_command_outcome()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  checked_command_id uuid;
  command_row flow_enrollment_commands%rowtype;
  outcome_row flow_enrollment_command_outcomes%rowtype;
  has_outcome boolean;
begin
  if tg_table_name = 'flow_enrollment_commands' then
    checked_command_id := coalesce(new.id, old.id);
  else
    checked_command_id := coalesce(new.command_id, old.command_id);
  end if;
  select * into command_row from flow_enrollment_commands where id = checked_command_id;
  if not found then
    return null;
  end if;
  select * into outcome_row
    from flow_enrollment_command_outcomes where command_id = checked_command_id;
  has_outcome := found;

  if command_row.state = 'processing' then
    raise exception 'flow enrollment command state and outcome are inconsistent'
      using errcode = '23514';
  end if;
  if not has_outcome then
    if clock_timestamp() < command_row.replay_until then
      raise exception 'flow enrollment command state and outcome are inconsistent'
        using errcode = '23514';
    end if;
    return null;
  end if;
  if outcome_row.created_at is distinct from command_row.completed_at
     or (command_row.state = 'succeeded' and outcome_row.response_status <> 200)
     or (command_row.state = 'failed' and outcome_row.response_status not in (400, 404, 409)) then
    raise exception 'flow enrollment command state and outcome are inconsistent'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger flow_enrollment_commands_outcome_consistency
after insert or update on flow_enrollment_commands
deferrable initially deferred
for each row execute function flow_assert_enrollment_command_outcome();

create constraint trigger flow_enrollment_outcomes_command_consistency
after insert or delete on flow_enrollment_command_outcomes
deferrable initially deferred
for each row execute function flow_assert_enrollment_command_outcome();

create or replace function flow_guard_activation_epoch_close()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if old.effective_to is not null
     or new.id <> old.id
     or new.flow_id <> old.flow_id
     or new.owner_subject_id <> old.owner_subject_id
     or new.flow_version_id <> old.flow_version_id
     or new.sequence <> old.sequence
     or new.effective_from <> old.effective_from
     or new.manifest_digest <> old.manifest_digest
     or new.rollout_policy_revision <> old.rollout_policy_revision
     or new.activated_by_actor_subject_id <> old.activated_by_actor_subject_id
     or new.activate_command_id <> old.activate_command_id
     or new.created_at <> old.created_at
     or new.effective_to is null
     or new.close_reason is null
     or new.closed_by_actor_subject_id is null
     or new.close_command_id is null then
    raise exception 'flow activation epoch may only close once' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger flow_activation_epochs_close_guard
before update on flow_activation_epochs
for each row execute function flow_guard_activation_epoch_close();

create or replace function flow_reject_activation_epoch_removal()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'flow activation epochs cannot be removed' using errcode = '55000';
end;
$$;

create trigger flow_activation_epochs_reject_delete
before delete on flow_activation_epochs
for each row execute function flow_reject_activation_epoch_removal();

create trigger flow_activation_epochs_reject_truncate
before truncate on flow_activation_epochs
for each statement execute function flow_reject_activation_epoch_removal();

create or replace function flow_assert_activation_epoch_command_provenance()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  activation_command flow_enrollment_commands%rowtype;
  close_command flow_enrollment_commands%rowtype;
begin
  select * into activation_command
    from flow_enrollment_commands where id = new.activate_command_id;
  if not found
     or activation_command.state <> 'succeeded'
     or activation_command.command_scope <> 'flows.enrollment.activate.v1'
     or activation_command.resource_id <> new.flow_id
     or activation_command.owner_subject_id <> new.owner_subject_id
     or activation_command.actor_subject_id <> new.activated_by_actor_subject_id
     or activation_command.target_version_id is distinct from new.flow_version_id then
    raise exception 'flow activation epoch command provenance is inconsistent'
      using errcode = '23514';
  end if;

  if new.effective_to is null then
    return null;
  end if;
  select * into close_command
    from flow_enrollment_commands where id = new.close_command_id;
  if not found
     or close_command.state <> 'succeeded'
     or close_command.resource_id <> new.flow_id
     or close_command.owner_subject_id <> new.owner_subject_id
     or close_command.actor_subject_id <> new.closed_by_actor_subject_id
     or close_command.expected_active_version_id is distinct from new.flow_version_id then
    raise exception 'flow activation epoch command provenance is inconsistent'
      using errcode = '23514';
  end if;
  if new.close_reason = 'pause_enrollment' and (
       close_command.command_scope <> 'flows.enrollment.pause.v1'
       or close_command.expected_activation_epoch_id <> new.id
       or close_command.target_version_id is not null
     ) then
    raise exception 'flow activation epoch command provenance is inconsistent'
      using errcode = '23514';
  end if;
  if new.close_reason = 'version_switch' and (
       close_command.command_scope <> 'flows.enrollment.activate.v1'
       or close_command.target_version_id is null
       or close_command.target_version_id = new.flow_version_id
       or not exists (
         select 1 from flow_activation_epochs replacement
          where replacement.activate_command_id = close_command.id
            and replacement.flow_id = new.flow_id
            and replacement.owner_subject_id = new.owner_subject_id
            and replacement.flow_version_id = close_command.target_version_id
            and replacement.effective_from = new.effective_to
       )
     ) then
    raise exception 'flow activation epoch command provenance is inconsistent'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger flow_activation_epochs_command_provenance
after insert or update on flow_activation_epochs
deferrable initially deferred
for each row execute function flow_assert_activation_epoch_command_provenance();

create or replace function flow_guard_enrollment_control_transition()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  transition_command flow_enrollment_commands%rowtype;
  current_definition_revision integer;
begin
  if new.flow_id <> old.flow_id
     or new.owner_user_id <> old.owner_user_id
     or new.owner_subject_id <> old.owner_subject_id
     or new.created_at <> old.created_at
     or new.enrollment_revision <> old.enrollment_revision + 1
     or new.last_command_id is null
     or new.last_command_id is not distinct from old.last_command_id then
    raise exception 'flow enrollment revision must advance exactly once' using errcode = '55000';
  end if;

  select * into transition_command
    from flow_enrollment_commands where id = new.last_command_id;
  select revision into current_definition_revision
    from flows where id = old.flow_id and owner_user_id = old.owner_user_id;
  if not found
     or transition_command.id is null
     or transition_command.state <> 'processing'
     or transition_command.resource_id <> old.flow_id
     or transition_command.owner_subject_id <> old.owner_subject_id
     or transition_command.expected_enrollment_revision <> old.enrollment_revision then
    raise exception 'flow enrollment command causal CAS is inconsistent'
      using errcode = '23514';
  end if;

  if new.state = 'active' then
    if transition_command.command_scope <> 'flows.enrollment.activate.v1'
       or transition_command.expected_definition_revision is distinct from current_definition_revision
       or transition_command.target_version_id is distinct from new.active_version_id
       or transition_command.expected_active_version_id is distinct from old.active_version_id
       or transition_command.expected_activation_epoch_id is not null then
      raise exception 'flow enrollment command causal CAS is inconsistent'
        using errcode = '23514';
    end if;
  elsif new.state = 'paused' then
    if old.state <> 'active'
       or transition_command.command_scope <> 'flows.enrollment.pause.v1'
       or transition_command.target_version_id is not null
       or transition_command.expected_definition_revision is not null
       or transition_command.expected_active_version_id is distinct from old.active_version_id
       or transition_command.expected_activation_epoch_id is distinct from old.active_activation_epoch_id then
      raise exception 'flow enrollment command causal CAS is inconsistent'
        using errcode = '23514';
    end if;
  else
    raise exception 'flow enrollment command causal CAS is inconsistent'
      using errcode = '23514';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger flow_enrollment_controls_transition_guard
before update on flow_enrollment_controls
for each row execute function flow_guard_enrollment_control_transition();

create or replace function flow_assert_enrollment_control_provenance()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  checked_flow_id uuid;
  control_row flow_enrollment_controls%rowtype;
  epoch_row flow_activation_epochs%rowtype;
begin
  checked_flow_id := coalesce(new.flow_id, old.flow_id);
  select * into control_row from flow_enrollment_controls where flow_id = checked_flow_id;
  if not found then
    if exists (
      select 1 from flow_activation_epochs
       where flow_id = checked_flow_id and effective_to is null
    ) then
      raise exception 'flow enrollment control provenance is inconsistent'
        using errcode = '23514';
    end if;
    return null;
  end if;

  if not exists (
    select 1 from flow_runtime_owner_subjects subject
     where subject.owner_subject_id = control_row.owner_subject_id
       and subject.owner_user_id = control_row.owner_user_id
       and subject.state = 'active'
  ) then
    raise exception 'flow enrollment owner subject binding is inconsistent'
      using errcode = '23514';
  end if;

  if control_row.state = 'active' then
    select * into epoch_row
      from flow_activation_epochs where id = control_row.active_activation_epoch_id;
    if not found
       or epoch_row.flow_id <> control_row.flow_id
       or epoch_row.owner_subject_id <> control_row.owner_subject_id
       or epoch_row.flow_version_id <> control_row.active_version_id
       or epoch_row.effective_from <> control_row.active_since
       or epoch_row.effective_to is not null
       or epoch_row.activate_command_id <> control_row.last_command_id then
      raise exception 'flow enrollment control provenance is inconsistent'
        using errcode = '23514';
    end if;
  elsif exists (
    select 1 from flow_activation_epochs
     where flow_id = control_row.flow_id and effective_to is null
  ) then
    raise exception 'flow enrollment control provenance is inconsistent'
      using errcode = '23514';
  end if;

  if control_row.state = 'paused' then
    select * into epoch_row
      from flow_activation_epochs where close_command_id = control_row.last_command_id;
    if not found
       or epoch_row.flow_id <> control_row.flow_id
       or epoch_row.owner_subject_id <> control_row.owner_subject_id
       or epoch_row.close_reason <> 'pause_enrollment'
       or epoch_row.effective_to <> control_row.last_paused_at then
      raise exception 'flow enrollment control provenance is inconsistent'
        using errcode = '23514';
    end if;
  end if;
  return null;
end;
$$;

create constraint trigger flow_enrollment_controls_provenance
after insert or update or delete on flow_enrollment_controls
deferrable initially deferred
for each row execute function flow_assert_enrollment_control_provenance();

create constraint trigger flow_activation_epochs_control_provenance
after insert or update on flow_activation_epochs
deferrable initially deferred
for each row execute function flow_assert_enrollment_control_provenance();

create or replace function flow_guard_automation_quota_transition()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.owner_subject_id <> old.owner_subject_id
     or new.created_at <> old.created_at
     or new.revision <> old.revision + 1
     or abs(new.active_allocations - old.active_allocations) <> 1 then
    raise exception 'flow automation quota transition is invalid' using errcode = '55000';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger flow_automation_quota_authorities_transition_guard
before update on flow_automation_quota_authorities
for each row execute function flow_guard_automation_quota_transition();

create or replace function flow_reject_enrollment_authority_removal()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'flow enrollment authority cannot be truncated' using errcode = '55000';
  end if;
  if tg_table_name = 'flow_enrollment_controls' then
    raise exception 'flow enrollment control cannot be removed' using errcode = '55000';
  end if;
  raise exception 'flow automation quota authority cannot be removed' using errcode = '55000';
end;
$$;

create trigger flow_automation_quota_authorities_reject_delete
before delete on flow_automation_quota_authorities
for each row execute function flow_reject_enrollment_authority_removal();

create trigger flow_automation_quota_authorities_reject_truncate
before truncate on flow_automation_quota_authorities
for each statement execute function flow_reject_enrollment_authority_removal();

create trigger flow_enrollment_controls_reject_truncate
before truncate on flow_enrollment_controls
for each statement execute function flow_reject_enrollment_authority_removal();

create trigger flow_enrollment_controls_reject_delete
before delete on flow_enrollment_controls
for each row execute function flow_reject_enrollment_authority_removal();

create or replace function flow_assert_automation_quota_consistency()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  subject_id uuid;
  expected_count integer;
  recorded_count integer;
begin
  if tg_op = 'DELETE' then
    subject_id := old.owner_subject_id;
  else
    subject_id := new.owner_subject_id;
  end if;
  select count(*)::integer into expected_count
    from flow_enrollment_controls
   where owner_subject_id = subject_id and state = 'active';
  select active_allocations into recorded_count
    from flow_automation_quota_authorities
   where owner_subject_id = subject_id;
  if recorded_count is null or recorded_count <> expected_count then
    raise exception 'flow automation quota counter is inconsistent' using errcode = '55000';
  end if;
  return null;
end;
$$;

create constraint trigger flow_enrollment_controls_quota_consistency
after insert or update or delete on flow_enrollment_controls
deferrable initially deferred
for each row execute function flow_assert_automation_quota_consistency();

create constraint trigger flow_automation_quota_authorities_consistency
after insert or update on flow_automation_quota_authorities
deferrable initially deferred
for each row execute function flow_assert_automation_quota_consistency();
`;
