import { describe, expect, it } from "vitest";

import {
  flowEnrollmentControlBaselineDdl,
  flowEnrollmentControlGeneratedBaselineUpgradeDdl,
  flowEnrollmentControlPreviousCurrentUpgradeDdl,
  flowEnrollmentRuntimeExtensionBaselineDdl,
  flowEnrollmentRuntimeIntegrityBaselineDdl
} from "./flow-enrollment-control-reconciliation";

describe("Flow enrollment control production reconciliation", () => {
  it("owns the complete current authority catalog for an absent deployment", () => {
    expect(flowEnrollmentControlBaselineDdl).toContain("CREATE TABLE flow_enrollment_commands");
    expect(flowEnrollmentControlBaselineDdl).toContain("CREATE TABLE flow_activation_epochs");
    expect(flowEnrollmentControlBaselineDdl).toContain("CREATE TABLE flow_enrollment_controls");
    expect(flowEnrollmentControlBaselineDdl).toContain(
      "CREATE TABLE flow_automation_quota_authorities"
    );
    expect(flowEnrollmentControlBaselineDdl).toContain(
      "flow activation epoch command provenance is inconsistent"
    );
  });

  it("upgrades only the empty generated pre-quota shape with CAS and quota authority", () => {
    expect(flowEnrollmentControlGeneratedBaselineUpgradeDdl).toContain(
      "ADD COLUMN request_schema_version text NOT NULL"
    );
    expect(flowEnrollmentControlGeneratedBaselineUpgradeDdl).toContain(
      "ADD COLUMN owner_subject_id uuid NOT NULL"
    );
    expect(flowEnrollmentControlGeneratedBaselineUpgradeDdl).toContain(
      "CREATE TABLE flow_automation_quota_authorities"
    );
    expect(flowEnrollmentControlGeneratedBaselineUpgradeDdl).toContain(
      "flow enrollment command state and outcome are inconsistent"
    );
  });

  it("upgrades exact previous catalogs by rebuilding the enrollment guards transactionally", () => {
    expect(flowEnrollmentControlPreviousCurrentUpgradeDdl).toContain(
      "create or replace function flow_guard_enrollment_command_transition()"
    );
    expect(flowEnrollmentControlPreviousCurrentUpgradeDdl).toContain(
      "or new.completed_at is not null"
    );
    expect(flowEnrollmentControlPreviousCurrentUpgradeDdl).toContain(
      "DROP TRIGGER flow_enrollment_controls_transition_guard"
    );
    expect(flowEnrollmentControlPreviousCurrentUpgradeDdl).toContain(
      "create trigger flow_enrollment_controls_reject_delete"
    );
    expect(flowEnrollmentControlPreviousCurrentUpgradeDdl).toContain(
      "expected_definition_revision IS NOT NULL"
    );
  });

  it("adds nullable runtime provenance before validating exact constraints and indexes", () => {
    expect(flowEnrollmentRuntimeExtensionBaselineDdl).toContain("ADD COLUMN event_kind text");
    expect(flowEnrollmentRuntimeExtensionBaselineDdl).toContain(
      "ADD COLUMN activation_epoch_id uuid"
    );
    expect(flowEnrollmentRuntimeExtensionBaselineDdl).toContain(
      "flow_runtime_events_normalized_shape_check"
    );
    expect(flowEnrollmentRuntimeExtensionBaselineDdl).toContain("'product_purchased'");
    expect(flowEnrollmentRuntimeExtensionBaselineDdl).toContain("'subscription_event'");
    expect(flowEnrollmentRuntimeExtensionBaselineDdl).toContain("flow_runs_activation_epoch_fk");
    expect(flowEnrollmentRuntimeExtensionBaselineDdl).toContain(
      "WHERE activation_epoch_id IS NOT NULL"
    );
  });

  it("installs immutable enrollment and source-event history guards", () => {
    expect(flowEnrollmentRuntimeIntegrityBaselineDdl).toContain(
      'CREATE TRIGGER "flow_runs_enrollment_immutable"'
    );
    expect(flowEnrollmentRuntimeIntegrityBaselineDdl).toContain(
      'CREATE TRIGGER "flow_runtime_events_immutable"'
    );
    expect(flowEnrollmentRuntimeIntegrityBaselineDdl).toContain(
      'CREATE TRIGGER "flow_runtime_events_truncate_guard"'
    );
    expect(flowEnrollmentRuntimeIntegrityBaselineDdl).not.toMatch(
      /\b(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+flow_(?:runs|runtime_events)/
    );
  });
});
