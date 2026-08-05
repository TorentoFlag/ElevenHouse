import { readFileSync } from "node:fs";

import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { flowWorkItemIntegritySql, flowWorkItems } from "./flow-work-items.schema";

describe("Flow work-item persistence schema", () => {
  it("stores one owner-scoped human task for one token activation", () => {
    expect(getTableName(flowWorkItems)).toBe("flow_work_items");
    expect(Object.keys(getTableColumns(flowWorkItems))).toEqual(
      expect.arrayContaining([
        "id",
        "ownerUserId",
        "flowRunId",
        "flowVersionId",
        "tokenId",
        "nodeActivationSequence",
        "nodeId",
        "completionHandle",
        "status",
        "taskKind",
        "title",
        "instructions",
        "assigneeUserId",
        "priority",
        "duePolicyKind",
        "dueLeadTimeMinutes",
        "dueBookingLifecycleRevision",
        "dueAt",
        "availableAt",
        "snoozedUntil",
        "revision",
        "resultSummary",
        "lastCommandId",
        "lastRunEventId",
        "createdAt",
        "updatedAt",
        "startedAt",
        "completedAt",
        "completedByUserId",
        "expiredAt",
        "canceledAt"
      ])
    );
  });

  it("pins run, token, owner and one activation behind database constraints", () => {
    const config = getTableConfig(flowWorkItems);

    expect(config.indexes.map((candidate) => candidate.config.name)).toEqual(
      expect.arrayContaining([
        "flow_work_items_token_activation_unique",
        "flow_work_items_owner_status_available_idx",
        "flow_work_items_run_created_idx"
      ])
    );
    expect(config.foreignKeys.map((candidate) => candidate.getName())).toEqual(
      expect.arrayContaining([
        "flow_work_items_run_version_owner_fk",
        "flow_work_items_token_run_owner_fk",
        "flow_work_items_last_command_run_owner_fk",
        "flow_work_items_last_run_event_run_owner_fk"
      ])
    );
  });

  it("constrains assignment, lifecycle evidence, revisions and immutable node semantics", () => {
    const checkNames = getTableConfig(flowWorkItems).checks.map((candidate) => candidate.name);

    expect(checkNames).toEqual(
      expect.arrayContaining([
        "flow_work_items_status_check",
        "flow_work_items_task_kind_check",
        "flow_work_items_priority_check",
        "flow_work_items_due_policy_check",
        "flow_work_items_node_check",
        "flow_work_items_assignment_check",
        "flow_work_items_revision_check",
        "flow_work_items_provenance_revision_check",
        "flow_work_items_lifecycle_check",
        "flow_work_items_time_order_check"
      ])
    );
  });

  it("is present with its critical constraints in the canonical baseline", () => {
    const baseline = readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8");

    expect(baseline).toContain('CREATE TABLE "flow_work_items"');
    expect(baseline).toContain('CONSTRAINT "flow_work_items_run_version_owner_fk"');
    expect(baseline).toContain('CONSTRAINT "flow_work_items_token_run_owner_fk"');
    expect(baseline).toContain(
      'CREATE UNIQUE INDEX "flow_work_items_token_activation_unique"'
    );
    expect(baseline).toContain('CONSTRAINT "flow_work_items_lifecycle_check"');
    expect(baseline).toContain('CREATE TRIGGER "flow_work_items_transition_guard"');
    expect(baseline).toContain(
      'CREATE CONSTRAINT TRIGGER "flow_work_items_command_consistency"'
    );
  });

  it("rejects nullable command and response provenance with null-safe comparisons", () => {
    expect(flowWorkItemIntegritySql).toContain(
      "command_row.flow_run_id IS DISTINCT FROM work_item_row.flow_run_id"
    );
    expect(flowWorkItemIntegritySql).toContain(
      "outcome_row.response_body->'workItem'->>'id' IS DISTINCT FROM work_item_row.id::text"
    );
    expect(flowWorkItemIntegritySql).toContain(
      "work_item_row.completed_by_user_id IS DISTINCT FROM command_row.actor_user_id"
    );
    expect(flowWorkItemIntegritySql).not.toContain(
      "command_row.flow_run_id <> work_item_row.flow_run_id"
    );
  });

  it("requires one append-only run event for each service-owned wake revision", () => {
    expect(flowWorkItemIntegritySql).toContain("FLOW_WORK_ITEM_SNOOZE_ELAPSED");
    expect(flowWorkItemIntegritySql).toContain("NEW.last_run_event_id");
    expect(flowWorkItemIntegritySql).toContain("event_row.summary->>'workItemId'");
    expect(flowWorkItemIntegritySql).toContain(
      'CREATE CONSTRAINT TRIGGER "flow_run_events_work_item_consistency"'
    );
  });

  it("permits system cancellation only through a Booking-linked run event", () => {
    expect(flowWorkItemIntegritySql).toContain("FLOW_BOOKING_CANCELED");
    expect(flowWorkItemIntegritySql).toContain("event_row.booking_lifecycle_event_id IS NULL");
    expect(flowWorkItemIntegritySql).toContain("work_item_row.status IS DISTINCT FROM 'canceled'");
    expect(flowWorkItemIntegritySql).toContain("event_row.event_type = 'run_canceled'");
    expect(flowWorkItemIntegritySql).toContain(
      "item.status IN ('pending', 'in_progress', 'snoozed')"
    );
  });

  it("permits deadline adjustment only through exact Booking reschedule provenance", () => {
    expect(flowWorkItemIntegritySql).toContain("event.event_type = 'booking_rescheduled'");
    expect(flowWorkItemIntegritySql).toContain("FLOW_BOOKING_RESCHEDULED");
    expect(flowWorkItemIntegritySql).toContain("NEW.due_booking_lifecycle_revision");
    expect(flowWorkItemIntegritySql).toContain("event.summary->>'currentDueAt'");
    expect(flowWorkItemIntegritySql).toContain("event.summary->>'snoozeAdjustment'");
  });
});
