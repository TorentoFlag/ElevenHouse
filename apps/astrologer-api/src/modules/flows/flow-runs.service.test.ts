import { NotFoundException } from "@nestjs/common";
import { HEADERS_METADATA } from "@nestjs/common/constants";
import type {
  FlowRuntimeAvailability,
  FlowRunResponse,
  FlowRunTraceEventResponse
} from "@elevenhouse/contracts";
import type {
  FlowDefinitionControlStore,
  FlowDefinitionReadV3Store,
  FlowRunCancellationStore,
  FlowRuntimeAvailabilityReader,
  FlowRuntimeStore
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";

import type { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { FlowRunsController } from "./flow-runs.controller";
import { FlowsService } from "./flows.service";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";

describe("flow run history read", () => {
  it("returns the owner-scoped durable trace from one store read", async () => {
    const getRunHistory = vi.fn<FlowRuntimeStore["getRunHistory"]>(async () => ({
      run: run(),
      trace: [traceEvent("1", "run_enrolled"), traceEvent("2", "run_completed")]
    }));
    const service = createService({ getRunHistory });

    await expect(service.getFlowRun(runId, request())).resolves.toMatchObject({
      run: { id: runId },
      trace: [{ sequence: "1" }, { sequence: "2" }],
      runtime: runtime()
    });
    expect(getRunHistory).toHaveBeenCalledWith({ ownerUserId, runId });
  });

  it("does not expose another owner's missing history", async () => {
    const getRunHistory = vi.fn<FlowRuntimeStore["getRunHistory"]>(async () => null);
    const service = createService({ getRunHistory });

    await expect(service.getFlowRun(runId, request())).rejects.toBeInstanceOf(NotFoundException);
  });

  it("marks the authenticated history response as non-cacheable", () => {
    expect(
      Reflect.getMetadata(HEADERS_METADATA, FlowRunsController.prototype.getFlowRun)
    ).toContainEqual({ name: "Cache-Control", value: "no-store" });
  });
});

function createService(overrides: Partial<FlowRuntimeStore>): FlowsService {
  const runtimeStore = {
    getRunHistory: vi.fn(async () => null),
    ...overrides
  } as unknown as FlowRuntimeStore;
  const runtimeAvailabilityReader = {
    readForOwner: vi.fn(async () => runtime())
  } as unknown as FlowRuntimeAvailabilityReader;
  return new FlowsService(
    {} as FlowDefinitionControlStore,
    {} as FlowDefinitionReadV3Store,
    runtimeStore,
    runtimeAvailabilityReader,
    {} as FlowRunCancellationStore,
    { now: () => new Date("2026-08-07T10:00:00.000Z") } as SystemClock
  );
}

function request(): AstrologerSessionRequest {
  return {
    headers: {},
    currentAstrologerAccount: {
      account: { id: ownerUserId, status: "active", roles: ["astrologer"] }
    }
  };
}

function run(): FlowRunResponse {
  return {
    id: runId,
    flowId: "33333333-3333-4333-8333-333333333333",
    flowVersionId: "44444444-4444-4444-8444-444444444444",
    ownerUserId,
    sourceEventId: "manual:owner:run",
    status: "completed",
    snapshot: {
      schemaVersion: "flow-run-snapshot.v2",
      enrollment: {
        activationEpochId: "55555555-5555-4555-8555-555555555555",
        triggerNodeId: "manual-client",
        occurrenceKey: "66666666-6666-4666-8666-666666666666",
        policyKey: "once_per_occurrence",
        policyRevision: 1,
        rolloutPolicyRevision: 1,
        eventOccurredAt: "2026-08-07T10:00:00.000Z",
        enrolledAt: "2026-08-07T10:00:00.000Z"
      },
      subject: {
        type: "client",
        clientUserId: "77777777-7777-4777-8777-777777777777",
        relationshipId: "88888888-8888-4888-8888-888888888888"
      },
      executionAuthority: {
        basis: "current_entitlement",
        referenceId: "99999999-9999-4999-8999-999999999999"
      }
    },
    currentNodeId: null,
    createdAt: "2026-08-07T10:00:00.000Z",
    updatedAt: "2026-08-07T10:00:03.000Z",
    completedAt: "2026-08-07T10:00:03.000Z"
  };
}

function traceEvent(sequence: string, eventType: string): FlowRunTraceEventResponse {
  return {
    sequence,
    eventType,
    nodeId: null,
    summary: {},
    occurredAt: "2026-08-07T10:00:00.000Z"
  };
}

function runtime(): FlowRuntimeAvailability {
  return {
    mode: "definition_only",
    executionAvailable: false,
    reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
    historySemantics: "durable_execution"
  };
}
