import type { FlowRuntimeAvailability } from "@elevenhouse/contracts";
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
  historySemantics: "legacy_preview"
} satisfies FlowRuntimeAvailability;

const durableRuntime = {
  mode: "enabled",
  executionAvailable: true,
  reasonCode: null,
  historySemantics: "durable_execution"
} satisfies FlowRuntimeAvailability;

describe("flow runtime presentation", () => {
  it("fails closed when server capability metadata is missing or legacy-only", () => {
    expect(canProjectLiveFlowRuntime(undefined)).toBe(false);
    expect(canProjectLiveFlowRuntime(definitionOnlyRuntime)).toBe(false);
  });

  it("projects live cross-module state only from durable execution history", () => {
    expect(canProjectLiveFlowRuntime(durableRuntime)).toBe(true);
    expect(
      canProjectLiveFlowRuntime({
        ...durableRuntime,
        mode: "canary",
        historySemantics: "mixed"
      })
    ).toBe(false);
  });

  it("localizes fail-closed runtime evidence and automation controls", () => {
    expect(buildFlowRuntimePresentation(undefined, "en").unavailableReason).toBe(
      "Execution availability has not been confirmed by the server."
    );
    expect(buildFlowRuntimePresentation(definitionOnlyRuntime, "en").unavailableReason).toBe(
      "Flow execution is not available yet. You can edit and publish the definition."
    );
    expect(
      buildFlowAutomationControl(
        {
          runtimeStatus: "published",
          latestPublishedVersionId: "11111111-1111-4111-8111-111111111111"
        },
        definitionOnlyRuntime,
        "en"
      )
    ).toMatchObject({
      canToggle: false,
      accessibleLabel: "Execution is unavailable for this flow version"
    });
  });
});
