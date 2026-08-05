// @vitest-environment jsdom

import type { FlowRunResponse, FlowRuntimeAvailability } from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FlowRuntimePanel } from "./FlowRuntimePanel";

const runtime = {
  mode: "enabled",
  executionAvailable: true,
  reasonCode: null,
  historySemantics: "durable_execution"
} satisfies FlowRuntimeAvailability;

const run = {
  id: "11111111-1111-4111-8111-111111111111",
  flowId: "22222222-2222-4222-8222-222222222222",
  flowVersionId: "33333333-3333-4333-8333-333333333333",
  ownerUserId: "44444444-4444-4444-8444-444444444444",
  sourceEventId: "booking:55555555-5555-4555-8555-555555555555:confirmed",
  status: "waiting",
  snapshot: {
    schemaVersion: "flow-run-snapshot.v2",
    enrollment: {
      activationEpochId: "66666666-6666-4666-8666-666666666666",
      triggerNodeId: "booking-confirmed",
      occurrenceKey: "55555555-5555-4555-8555-555555555555",
      policyKey: "once_per_occurrence",
      policyRevision: 1,
      rolloutPolicyRevision: 1,
      eventOccurredAt: "2026-08-05T08:00:00.000Z",
      enrolledAt: "2026-08-05T08:00:01.000Z"
    },
    subject: {
      type: "booking",
      bookingId: "55555555-5555-4555-8555-555555555555",
      clientUserId: "77777777-7777-4777-8777-777777777777",
      productId: "88888888-8888-4888-8888-888888888888",
      startAt: "2026-08-06T08:00:00.000Z",
      endAt: "2026-08-06T09:00:00.000Z"
    },
    executionAuthority: {
      basis: "current_entitlement",
      referenceId: "99999999-9999-4999-8999-999999999999"
    }
  },
  currentNodeId: "birth-data-available",
  createdAt: "2026-08-05T08:00:01.000Z",
  updatedAt: "2026-08-05T08:01:00.000Z",
  completedAt: null
} satisfies FlowRunResponse;

describe("FlowRuntimePanel", () => {
  afterEach(() => cleanup());

  it("renders durable V2 booking execution state", () => {
    render(<FlowRuntimePanel runs={[run]} simulation={null} runtimeAvailability={runtime} />);

    expect(screen.getByText("История запусков")).toBeTruthy();
    expect(screen.getByText("Ждет условия")).toBeTruthy();
    expect(screen.getByText(run.sourceEventId)).toBeTruthy();
  });

  it("does not dispatch runtime commands while server execution is unavailable", () => {
    const onSimulate = vi.fn();
    render(
      <FlowRuntimePanel
        runs={[]}
        simulation={null}
        runtimeAvailability={{
          ...runtime,
          mode: "definition_only",
          executionAvailable: false,
          reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE"
        }}
        onSimulate={onSimulate}
      />
    );

    const button = screen.getByRole("button", { name: "Тестовый прогон" });
    expect(button).toHaveProperty("disabled", true);
    fireEvent.click(button);
    expect(onSimulate).not.toHaveBeenCalled();
  });
});
