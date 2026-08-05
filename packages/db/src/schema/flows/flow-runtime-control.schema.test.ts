import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  flowRuntimeControlAuthority,
  flowRuntimeControlCommandOutcomes,
  flowRuntimeControlCommands,
  flowRuntimeControlIntegritySql,
  flowRuntimeRolloutPolicyVersions,
  flowWorkerReadinessLeases,
  flowWorkerRegistrationTombstones,
  flowWorkerRegistrations
} from "../index";

describe("Flows persisted runtime control schema", () => {
  it("stores one immutable atomic rollout and containment snapshot behind one CAS head", () => {
    expect(getTableName(flowRuntimeRolloutPolicyVersions)).toBe(
      "flow_runtime_rollout_policy_versions"
    );
    expect(getTableName(flowRuntimeControlAuthority)).toBe("flow_runtime_control_authority");
    expect(Object.keys(getTableColumns(flowRuntimeRolloutPolicyVersions))).toEqual(
      expect.arrayContaining([
        "revision",
        "supersedesRevision",
        "commandId",
        "mode",
        "canaryOwnerSubjectIds",
        "allowedRequirementKeys",
        "enrollmentGlobalKillSwitch",
        "claimGlobalKillSwitch",
        "externalDispatchGlobalKillSwitch",
        "enrollmentKilledOwnerSubjectIds",
        "claimKilledOwnerSubjectIds",
        "externalDispatchKilledOwnerSubjectIds",
        "enrollmentKilledCapabilityKeys",
        "claimKilledCapabilityKeys",
        "externalDispatchKilledCapabilityKeys",
        "readinessLeaseTtlMs",
        "tokenLeaseDurationMs",
        "canonicalPreimage",
        "policyDigest",
        "changeSource",
        "createdByActorSubjectId",
        "reason",
        "createdAt"
      ])
    );
    expect(Object.keys(getTableColumns(flowRuntimeControlAuthority))).toEqual(
      expect.arrayContaining([
        "authorityKey",
        "currentPolicyRevision",
        "controlRevision",
        "lastCommandId",
        "changeSource",
        "updatedByActorSubjectId",
        "reason",
        "updatedAt"
      ])
    );
  });

  it("persists one exact-replay policy command and binds every non-bootstrap revision to it", () => {
    expect(getTableName(flowRuntimeControlCommands)).toBe("flow_runtime_control_commands");
    expect(getTableName(flowRuntimeControlCommandOutcomes)).toBe(
      "flow_runtime_control_command_outcomes"
    );
    expect(Object.keys(getTableColumns(flowRuntimeControlCommands))).toEqual(
      expect.arrayContaining([
        "id",
        "actorSubjectId",
        "idempotencyKey",
        "requestHash",
        "expectedRevision",
        "targetRevision",
        "requestedPolicyDigest",
        "reason",
        "state",
        "completedAt",
        "replayUntil",
        "createdAt",
        "updatedAt"
      ])
    );
    expect(Object.keys(getTableColumns(flowRuntimeControlCommandOutcomes))).toEqual(
      expect.arrayContaining([
        "commandId",
        "resultKind",
        "currentRevision",
        "policyRevision",
        "requestedPolicyCanonicalPreimage",
        "requestedPolicyDigest",
        "createdAt"
      ])
    );
    expect(flowRuntimeControlIntegritySql).toContain("flow_prepare_runtime_control_command");
    expect(flowRuntimeControlIntegritySql).toContain(
      "flow_require_runtime_control_command_outcome"
    );
    expect(flowRuntimeControlIntegritySql).toContain(
      "flow_enforce_runtime_control_command_outcome_retention"
    );
    expect(flowRuntimeControlIntegritySql).toContain("clock_timestamp() < command_row.replay_until");
    expect(flowRuntimeControlIntegritySql).toContain(
      "flow_runtime_control_commands_reject_truncate"
    );
    expect(flowRuntimeControlIntegritySql).toContain(
      "policy_row.command_id <> command_row.id"
    );
    expect(flowRuntimeControlIntegritySql).toContain(
      "from flow_runtime_control_commands\n   where id = new.id\n   for share"
    );
  });

  it("constrains owner and requirement allowlists, lease bounds and exact revision history", () => {
    const policy = getTableConfig(flowRuntimeRolloutPolicyVersions);
    const checkNames = policy.checks.map((candidate) => candidate.name);
    expect(checkNames).toEqual(
      expect.arrayContaining([
        "flow_runtime_rollout_policy_versions_schema_check",
        "flow_runtime_rollout_policy_versions_history_check",
        "flow_runtime_rollout_policy_versions_shape_check",
        "flow_runtime_rollout_policy_versions_requirements_check",
        "flow_runtime_rollout_policy_versions_kill_scope_check",
        "flow_runtime_rollout_policy_versions_lease_check",
        "flow_runtime_rollout_policy_versions_digest_check",
        "flow_runtime_rollout_policy_versions_source_check"
      ])
    );
    expect(sqlOf(policy.checks.find((candidate) => candidate.name.endsWith("shape_check"))!.value))
      .toContain("cardinality");
    const requirementsCheck = sqlOf(
      policy.checks.find((candidate) => candidate.name.endsWith("requirements_check"))!.value
    );
    expect(requirementsCheck).toContain("allowed_requirement_keys");
    expect(requirementsCheck).toContain("array_to_string");
    expect(requirementsCheck).toContain("E'\n'");
    expect(requirementsCheck).not.toContain("array_to_string(\"flow_runtime_rollout_policy_versions\".\"allowed_requirement_keys\", ',')");
    expect(policy.foreignKeys.map((candidate) => candidate.getName())).toEqual(
      expect.arrayContaining([
        "flow_runtime_rollout_policy_versions_supersedes_fk",
        "flow_runtime_rollout_policy_versions_actor_fk"
      ])
    );
  });

  it("makes policy and containment state immutable and advances one unified revision", () => {
    expect(flowRuntimeControlIntegritySql).toContain(
      "flow_runtime_rollout_policy_versions_immutable"
    );
    expect(flowRuntimeControlIntegritySql).toContain("new.current_policy_revision <> old.current_policy_revision + 1");
    expect(flowRuntimeControlIntegritySql).toContain("new.control_revision <> new.current_policy_revision");
    expect(flowRuntimeControlIntegritySql).toContain(
      "candidate_supersedes_revision <> old.current_policy_revision"
    );
    expect(flowRuntimeControlIntegritySql).toContain("flow_validate_runtime_control_arrays");
    expect(flowRuntimeControlIntegritySql).toContain("count(distinct candidate)");
    expect(flowRuntimeControlIntegritySql).toContain("length(candidate) > 240");
    expect(flowRuntimeControlIntegritySql).toContain("create extension if not exists pgcrypto");
    expect(flowRuntimeControlIntegritySql).toContain("flow_canonical_runtime_control_jsonb_v1");
    expect(flowRuntimeControlIntegritySql).toContain("digest(expected_preimage, 'sha256')");
    expect(flowRuntimeControlIntegritySql).toContain(
      "new.canonical_preimage <> expected_preimage"
    );
  });

  it("keeps immutable worker registrations separate from current readiness leases", () => {
    expect(getTableName(flowWorkerRegistrations)).toBe("flow_worker_registrations");
    expect(Object.keys(getTableColumns(flowWorkerRegistrations))).toEqual(
      expect.arrayContaining([
        "sessionId",
        "instanceId",
        "roles",
        "maxRuntimeMode",
        "maxCanaryOwnerSubjectIds",
        "requirementKeys",
        "deploymentId",
        "buildId",
        "protocolVersion",
        "registrationDigest",
        "startedAt"
      ])
    );
    expect(getTableName(flowWorkerRegistrationTombstones)).toBe(
      "flow_worker_registration_tombstones"
    );
    expect(Object.keys(getTableColumns(flowWorkerRegistrationTombstones))).toEqual(
      expect.arrayContaining([
        "sessionId",
        "registrationDigest",
        "retirementReason",
        "retiredAt",
        "purgeAfter"
      ])
    );
    expect(flowRuntimeControlIntegritySql).toContain("flow_worker_registrations_immutable");
    expect(flowRuntimeControlIntegritySql).toContain("flow_worker_registration_preimage_v1");
    expect(flowRuntimeControlIntegritySql).toContain("flow_prepare_worker_registration_tombstone");
    expect(flowRuntimeControlIntegritySql).toContain("flow_worker_registration_tombstones_immutable");
    expect(flowRuntimeControlIntegritySql).toContain("new.registration_digest <> expected_digest");
    expect(flowRuntimeControlIntegritySql).toContain("new.started_at := clock_timestamp()");
    expect(
      getTableConfig(flowWorkerRegistrations).indexes.map((candidate) => candidate.config.name)
    ).not.toEqual(
      expect.arrayContaining([
        "flow_worker_registrations_roles_gin_idx",
        "flow_worker_registrations_requirements_gin_idx"
      ])
    );
    const registrationRequirements = sqlOf(
      getTableConfig(flowWorkerRegistrations).checks.find((candidate) =>
        candidate.name.endsWith("requirements_check")
      )!.value
    );
    expect(registrationRequirements).toContain("E'\n'");
    expect(registrationRequirements).not.toContain(
      "array_to_string(\"flow_worker_registrations\".\"requirement_keys\", ',')"
    );
  });

  it("derives lease revision and time from PostgreSQL and fences replacement sessions", () => {
    expect(getTableName(flowWorkerReadinessLeases)).toBe("flow_worker_readiness_leases");
    expect(Object.keys(getTableColumns(flowWorkerReadinessLeases))).toEqual(
      expect.arrayContaining([
        "instanceId",
        "sessionId",
        "state",
        "policyRevision",
        "heartbeatSequence",
        "heartbeatAt",
        "readyUntil",
        "drainingAt"
      ])
    );
    const config = getTableConfig(flowWorkerReadinessLeases);
    expect(config.indexes.map((candidate) => candidate.config.name)).toEqual(
      expect.arrayContaining([
        "flow_worker_readiness_leases_session_unique",
        "flow_worker_readiness_leases_ready_idx"
      ])
    );
    expect(config.foreignKeys.map((candidate) => candidate.getName())).toEqual(
      expect.arrayContaining([
        "flow_worker_readiness_leases_policy_fk",
        "flow_worker_readiness_leases_registration_fk"
      ])
    );
    expect(flowRuntimeControlIntegritySql).toContain("flow_prepare_worker_readiness_lease");
    expect(flowRuntimeControlIntegritySql).toContain("old.ready_until > authority_now");
    expect(flowRuntimeControlIntegritySql).toContain("new.heartbeat_sequence := old.heartbeat_sequence + 1");
    expect(flowRuntimeControlIntegritySql).toContain("new.ready_until := authority_now +");
  });
});

function sqlOf(value: Parameters<PgDialect["sqlToQuery"]>[0]): string {
  return new PgDialect().sqlToQuery(value).sql;
}
