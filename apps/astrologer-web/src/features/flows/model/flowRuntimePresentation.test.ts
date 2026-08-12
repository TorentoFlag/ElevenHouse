import type { FlowDefinitionSummary, FlowRuntimeAvailability } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import {
  buildFlowAutomationControl,
  buildFlowRuntimePresentation,
  canProjectLiveFlowRuntime
} from "./flowRuntimePresentation";

const definitionOnlyRuntime = {
  mode: "definition_only",
  executionAvailable: false,
  reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
  historySemantics: "durable_execution"
} satisfies FlowRuntimeAvailability;

const durableRuntime = {
  mode: "enabled",
  executionAvailable: true,
  reasonCode: null,
  historySemantics: "durable_execution"
} satisfies FlowRuntimeAvailability;

describe("flow runtime presentation", () => {
  it("fails closed when server capability metadata is missing or execution is unavailable", () => {
    expect(canProjectLiveFlowRuntime(undefined)).toBe(false);
    expect(canProjectLiveFlowRuntime(definitionOnlyRuntime)).toBe(false);
  });

  it("projects live cross-module state only from available durable execution", () => {
    expect(canProjectLiveFlowRuntime(durableRuntime)).toBe(true);
    expect(
      canProjectLiveFlowRuntime({
        ...durableRuntime,
        mode: "canary",
        executionAvailable: false,
        reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE"
      })
    ).toBe(false);
  });

  it("localizes fail-closed runtime evidence", () => {
    expect(buildFlowRuntimePresentation(undefined, "en").unavailableReason).toBe(
      "Execution availability has not been confirmed by the server."
    );
    expect(buildFlowRuntimePresentation(definitionOnlyRuntime, "en").unavailableReason).toBe(
      "Flow execution is not available yet. You can edit and publish the definition."
    );
  });

  it("derives automation controls only from the enrollment authority", () => {
    expect(
      buildFlowAutomationControl(versionedFlow({ state: "inactive" }), "en")
    ).toMatchObject({
      checked: false,
      canToggle: true,
      nextAction: "review_activation",
      accessibleLabel: "Review and enable automation"
    });
    expect(buildFlowAutomationControl(draftFlow(), "ru")).toMatchObject({
      checked: false,
      canToggle: false,
      nextAction: "none",
      accessibleLabel: "Сначала опубликуйте воронку"
    });
    expect(
      buildFlowAutomationControl({ ...versionedFlow({ state: "inactive" }), state: "archived" }, "ru")
    ).toMatchObject({ canToggle: false, accessibleLabel: "Воронка находится в архиве" });
  });

  it("uses enrollment pause as the only automation stop command", () => {
    expect(buildFlowAutomationControl(versionedFlow({ state: "active" }), "ru")).toMatchObject({
      checked: true,
      canToggle: true,
      nextAction: "pause_enrollment",
      statusLabel: "Активна"
    });
    expect(
      buildFlowAutomationControl(
        versionedFlow({
          state: "active",
          activeVersionId: "55555555-5555-4555-8555-555555555555"
        }),
        "en"
      )
    ).toMatchObject({
      checked: true,
      statusLabel: "Another version is active",
      nextAction: "pause_enrollment"
    });
  });
});

function draftFlow(): FlowDefinitionSummary {
  return {
    ...versionedFlow({ state: "inactive" }),
    state: "draft",
    latestPublishedVersionId: null,
    latestPublishedVersion: null,
    publishedAt: null
  };
}

function versionedFlow(input: {
  readonly state: "inactive" | "active" | "paused";
  readonly activeVersionId?: string;
}): FlowDefinitionSummary {
  const latestVersionId = "44444444-4444-4444-8444-444444444444";
  const isActive = input.state === "active";
  return {
    id: "11111111-1111-4111-8111-111111111111",
    ownerUserId: "22222222-2222-4222-8222-222222222222",
    name: "Подготовка консультации",
    state: "versioned",
    approvalMode: "manual_approve",
    revision: 7,
    draftBaseVersionId: null,
    latestPublishedVersionId: latestVersionId,
    latestPublishedVersion: 2,
    createdAt: "2026-08-04T18:00:00.000Z",
    updatedAt: "2026-08-04T18:00:00.000Z",
    publishedAt: "2026-08-04T18:00:00.000Z",
    activeRunCount: isActive ? 1 : 0,
    graphSchemaVersion: "flow-graph.v2",
    origin: { schemaVersion: "flow-definition-origin.v1", type: "blank" },
    enrollment: {
      schemaVersion: "flow-enrollment-read-authority.v1",
      authority: "enrollment_v1",
      control: {
        schemaVersion: "flow-enrollment-control.v1",
        flowId: "11111111-1111-4111-8111-111111111111",
        state: input.state,
        definitionRevision: 7,
        enrollmentRevision: input.state === "inactive" ? 0 : 4,
        activeVersionId: isActive ? (input.activeVersionId ?? latestVersionId) : null,
        activeActivationEpochId: isActive
          ? "33333333-3333-4333-8333-333333333333"
          : null,
        activeSince: isActive ? "2026-08-04T18:00:00.000Z" : null,
        lastPausedAt: input.state === "paused" ? "2026-08-04T17:00:00.000Z" : null
      }
    }
  };
}
