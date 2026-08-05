import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  flowActivationEpochs,
  flowAutomationQuotaAuthorities,
  flowEnrollmentCommandOutcomes,
  flowEnrollmentCommands,
  flowEnrollmentControlIntegritySql,
  flowEnrollmentControls
} from "../index";

describe("Flow enrollment control schema", () => {
  it("separates command replay, mutable authority and immutable epoch history", () => {
    expect(getTableName(flowEnrollmentCommands)).toBe("flow_enrollment_commands");
    expect(getTableName(flowEnrollmentCommandOutcomes)).toBe(
      "flow_enrollment_command_outcomes"
    );
    expect(getTableName(flowEnrollmentControls)).toBe("flow_enrollment_controls");
    expect(getTableName(flowActivationEpochs)).toBe("flow_activation_epochs");
    expect(getTableName(flowAutomationQuotaAuthorities)).toBe(
      "flow_automation_quota_authorities"
    );

    expect(Object.keys(getTableColumns(flowEnrollmentCommands))).toEqual(
      expect.arrayContaining([
        "actorSubjectId",
        "ownerSubjectId",
        "routeTemplate",
        "resourceId",
        "commandScope",
        "idempotencyKey",
        "requestHash",
        "targetVersionId",
        "expectedDefinitionRevision",
        "expectedEnrollmentRevision",
        "expectedActiveVersionId",
        "expectedActivationEpochId",
        "state",
        "completedAt",
        "replayUntil"
      ])
    );
    expect(Object.keys(getTableColumns(flowEnrollmentCommands))).not.toContain("actorUserId");
    expect(Object.keys(getTableColumns(flowEnrollmentCommands))).not.toContain("ownerUserId");

    expect(Object.keys(getTableColumns(flowEnrollmentControls))).toEqual(
      expect.arrayContaining([
        "flowId",
        "ownerUserId",
        "ownerSubjectId",
        "state",
        "enrollmentRevision",
        "activeVersionId",
        "activeActivationEpochId",
        "activeSince",
        "lastPausedAt",
        "lastCommandId"
      ])
    );
    expect(Object.keys(getTableColumns(flowAutomationQuotaAuthorities))).toEqual(
      expect.arrayContaining([
        "ownerSubjectId",
        "activeAllocations",
        "revision",
        "createdAt",
        "updatedAt"
      ])
    );
    expect(Object.keys(getTableColumns(flowActivationEpochs))).toEqual(
      expect.arrayContaining([
        "flowId",
        "flowVersionId",
        "sequence",
        "effectiveFrom",
        "effectiveTo",
        "manifestDigest",
        "rolloutPolicyRevision",
        "activatedByActorSubjectId",
        "activateCommandId",
        "closeReason",
        "closedByActorSubjectId",
        "closeCommandId"
      ])
    );
  });

  it("pins idempotency, owner scope, active epoch and provenance in database constraints", () => {
    const command = getTableConfig(flowEnrollmentCommands);
    const outcome = getTableConfig(flowEnrollmentCommandOutcomes);
    const control = getTableConfig(flowEnrollmentControls);
    const epoch = getTableConfig(flowActivationEpochs);
    const quota = getTableConfig(flowAutomationQuotaAuthorities);

    expect(command.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "flow_enrollment_commands_scope_actor_key_unique",
        "flow_enrollment_commands_replay_until_idx",
        "flow_enrollment_commands_owner_resource_created_idx"
      ])
    );
    expect(command.foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        "flow_enrollment_commands_actor_subject_fk",
        "flow_enrollment_commands_owner_subject_fk"
      ])
    );
    expect(outcome.foreignKeys.map((key) => key.getName())).toContain(
      "flow_enrollment_command_outcomes_command_fk"
    );
    expect(control.foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        "flow_enrollment_controls_flow_owner_fk",
        "flow_enrollment_controls_active_epoch_fk",
        "flow_enrollment_controls_last_command_fk"
      ])
    );
    expect(epoch.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "flow_activation_epochs_flow_sequence_unique",
        "flow_activation_epochs_one_open_flow_unique",
        "flow_activation_epochs_activate_command_unique",
        "flow_activation_epochs_close_command_unique"
      ])
    );
    expect(epoch.foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        "flow_activation_epochs_version_fk",
        "flow_activation_epochs_policy_fk",
        "flow_activation_epochs_activated_actor_fk",
        "flow_activation_epochs_activate_command_fk",
        "flow_activation_epochs_closed_actor_fk",
        "flow_activation_epochs_close_command_fk"
      ])
    );
    expect(quota.foreignKeys.map((key) => key.getName())).toContain(
      "flow_automation_quota_authorities_owner_subject_fk"
    );
  });

  it("ships database guards for close-once epochs and durable command evidence", () => {
    expect(flowEnrollmentControlIntegritySql).toContain(
      "flow enrollment command tombstones cannot be removed"
    );
    expect(flowEnrollmentControlIntegritySql).toContain(
      "flow activation epoch may only close once"
    );
    expect(flowEnrollmentControlIntegritySql).toContain(
      "flow enrollment revision must advance exactly once"
    );
    expect(flowEnrollmentControlIntegritySql).toContain(
      "flow enrollment outcomes are immutable"
    );
    expect(flowEnrollmentControlIntegritySql).toContain(
      "flow automation quota counter is inconsistent"
    );
    expect(flowEnrollmentControlIntegritySql).toContain(
      "flow enrollment command state and outcome are inconsistent"
    );
    expect(flowEnrollmentControlIntegritySql).toContain(
      "flow activation epoch command provenance is inconsistent"
    );
    expect(flowEnrollmentControlIntegritySql).toContain(
      "flow enrollment control provenance is inconsistent"
    );
    expect(flowEnrollmentControlIntegritySql).toContain(
      "flow enrollment authority cannot be truncated"
    );
    expect(flowEnrollmentControlIntegritySql).toContain(
      "flow enrollment owner subject binding is inconsistent"
    );
    expect(flowEnrollmentControlIntegritySql).toContain(
      "flow enrollment command causal CAS is inconsistent"
    );
    expect(flowEnrollmentControlIntegritySql).toContain(
      "flow enrollment control cannot be removed"
    );
    expect(flowEnrollmentControlIntegritySql).toContain(
      "transition_command.expected_enrollment_revision <> old.enrollment_revision"
    );
  });
});
