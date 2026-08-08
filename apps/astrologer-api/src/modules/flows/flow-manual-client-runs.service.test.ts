import { ConflictException } from "@nestjs/common";
import type { FlowRuntimeAvailability } from "@elevenhouse/contracts";
import {
  FlowManualClientEnrollmentIdempotencyConflictError,
  type FlowManualClientEnrollmentStore,
  type FlowRuntimeAvailabilityReader
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";

import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { FlowManualClientRunsService } from "./flow-manual-client-runs.service";

const ownerUserId = "10000000-0000-4000-8000-000000000001";
const flowId = "10000000-0000-4000-8000-000000000002";
const clientUserId = "10000000-0000-4000-8000-000000000003";

describe("FlowManualClientRunsService", () => {
  it("does not persist a manual run while durable runtime admission is unavailable", async () => {
    const enrollManualClient = vi.fn<FlowManualClientEnrollmentStore["enrollManualClient"]>();
    const reader = unavailableReader();
    const service = new FlowManualClientRunsService({ enrollManualClient }, reader);

    await expect(
      service.create(flowId, { clientUserId }, "manual-client-run-1", request())
    ).rejects.toMatchObject({
      constructor: ConflictException,
      status: 409,
      response: expect.objectContaining({ code: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE" })
    });
    expect(enrollManualClient).not.toHaveBeenCalled();
  });

  it("accepts only server-scoped client enrollment with a mandatory idempotency key", async () => {
    const enrollManualClient = vi.fn<FlowManualClientEnrollmentStore["enrollManualClient"]>(async () => ({
      status: "enrolled",
      replayed: false,
      eventId: "10000000-0000-4000-8000-000000000004",
      runs: [
        {
          runId: "10000000-0000-4000-8000-000000000005",
          tokenId: "10000000-0000-4000-8000-000000000006",
          flowId,
          flowVersionId: "10000000-0000-4000-8000-000000000007",
          activationEpochId: "10000000-0000-4000-8000-000000000008"
        }
      ]
    }));
    const service = new FlowManualClientRunsService({ enrollManualClient }, availableReader());

    await expect(
      service.create(flowId, { clientUserId }, "manual-client-run-2", request())
    ).resolves.toMatchObject({ status: "enrolled", runs: [{ flowId }] });
    expect(enrollManualClient).toHaveBeenCalledWith({
      ownerUserId,
      flowId,
      clientUserId,
      idempotencyKey: "manual-client-run-2"
    });
  });

  it("maps a changed replay to a conflict rather than creating another run", async () => {
    const service = new FlowManualClientRunsService(
      {
        enrollManualClient: vi.fn(async () => {
          throw new FlowManualClientEnrollmentIdempotencyConflictError();
        })
      },
      availableReader()
    );
    await expect(
      service.create(flowId, { clientUserId }, "manual-client-run-3", request())
    ).rejects.toMatchObject({
      constructor: ConflictException,
      status: 409,
      response: expect.objectContaining({ code: "FLOW_MANUAL_CLIENT_ENROLLMENT_IDEMPOTENCY_CONFLICT" })
    });
  });
});

function availableReader(): FlowRuntimeAvailabilityReader {
  return {
    readForOwner: vi.fn(async () => ({
      mode: "enabled",
      executionAvailable: true,
      reasonCode: null,
      historySemantics: "durable_execution"
    } satisfies FlowRuntimeAvailability))
  };
}

function unavailableReader(): FlowRuntimeAvailabilityReader {
  return {
    readForOwner: vi.fn(async () => ({
      mode: "definition_only",
      executionAvailable: false,
      reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
      historySemantics: "durable_execution"
    } satisfies FlowRuntimeAvailability))
  };
}

function request(): AstrologerSessionRequest {
  return {
    headers: {},
    currentAstrologerAccount: { account: { id: ownerUserId } }
  } as AstrologerSessionRequest;
}
